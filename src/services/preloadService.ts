import { normalizeWorkoutBundle, normalizeWorkoutDetail } from '../utils/workoutTitle';
import type { ImageSourcePropType } from 'react-native';
import { getActiveCacheSessionId, getCachedResource, peekCachedResource } from './appCache';
import { fetchAccountability, fetchAccountabilityBae } from './accountabilityService';
import { DIET_DIARY_CACHE_KEY, fetchDietDiary } from './dietDiaryService';
import {
  getAccountabilityProofSources,
  getCoachImageSources,
  getDietDiaryImageSources,
  getMainAppArtworkSources,
  dedupeImageSources,
  preloadImageSources,
} from './imagePreloadService';
import { fetchProgress, fetchTrophyLeaderboard, flushPendingProgressLogs } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';
import { loadDietDiaryEntries, peekDietDiaryEntries } from '../store/dietDiaryStore';
import { preloadReadingPage } from './readingFeedService';

export const CACHE_KEYS = {
  // Bump when the plan presentation contract changes so persisted legacy
  // titles such as "Starter Plan by Ava" cannot survive an app update.
  workoutPlan: 'workoutPlan:v2',
  // Bump when the progress response contract changes so an older persisted
  // bundle cannot hide a newly generated weekly review after an app update.
  progressBundle: 'progressBundle:v12',
  dietDiary: DIET_DIARY_CACHE_KEY,
  profileSettings: 'profileSettings',
  // v2 discards the brief rollout window where cached coach payloads could
  // reference the image endpoint before that endpoint reached production.
  coachBundle: 'coachBundle:v2',
  workoutDay: 'workoutDay',
  trophyLeaderboard: 'trophyLeaderboard:v2',
} as const;

export async function loadWorkoutPlanCached(options?: { force?: boolean }) {
  return normalizeWorkoutBundle(await getCachedResource(CACHE_KEYS.workoutPlan, fetchWorkoutPlan, { force: options?.force }));
}

export function peekWorkoutPlanCached() {
  const cached = peekCachedResource<Awaited<ReturnType<typeof fetchWorkoutPlan>>>(CACHE_KEYS.workoutPlan);
  return cached ? normalizeWorkoutBundle(cached) : cached;
}

export async function loadWorkoutDayCached(planDayId: string, mode: 'standard' | 'quick' = 'standard', options?: { force?: boolean }) {
  return normalizeWorkoutDetail(await getCachedResource(
    `${CACHE_KEYS.workoutDay}:${planDayId}:${mode}`,
    () => fetchWorkoutDay(planDayId, mode),
    { force: options?.force },
  ));
}

export function peekWorkoutDayCached(planDayId: string, mode: 'standard' | 'quick' = 'standard') {
  const cached = peekCachedResource<Awaited<ReturnType<typeof fetchWorkoutDay>>>(`${CACHE_KEYS.workoutDay}:${planDayId}:${mode}`);
  return cached ? normalizeWorkoutDetail(cached) : cached;
}

export function loadProgressBundleCached(options?: { force?: boolean }) {
  return getCachedResource(
    CACHE_KEYS.progressBundle,
    async () => {
      // Retry durable uploads independently; a slow upload must not block the dashboard.
      flushPendingProgressLogs().catch(() => undefined);
      // Progress is the only payload consumed by the Progress, Trophy and
      // Action tabs. Do not hold it behind unrelated check-in, plan and profile
      // requests; those resources are preloaded independently.
      const progress = await fetchProgress();
      const settings = peekProfileSettingsCached();
      return {
        progress,
        checkIns: [],
        dueThisWeek: [],
        planDays: [],
        gender: settings?.profile?.gender || '',
        userName: settings?.user?.name || settings?.profile?.name || '',
      };
    },
    { force: options?.force },
  );
}

export function peekProgressBundleCached() {
  return peekCachedResource<Awaited<ReturnType<typeof loadProgressBundleCached>>>(CACHE_KEYS.progressBundle);
}

export function loadDietDiaryCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.dietDiary, fetchDietDiary, { force: options?.force });
}

export function peekDietDiaryCached() {
  return peekCachedResource<Awaited<ReturnType<typeof fetchDietDiary>>>(CACHE_KEYS.dietDiary);
}

export function loadProfileSettingsCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.profileSettings, fetchSettings, { force: options?.force });
}

export function peekProfileSettingsCached() {
  return peekCachedResource<Awaited<ReturnType<typeof fetchSettings>>>(CACHE_KEYS.profileSettings);
}

export function loadCoachBundleCached(options?: { force?: boolean }) {
  return getCachedResource(
    CACHE_KEYS.coachBundle,
    async () => {
      const coachHub = await fetchCoachHub();
      return { coachHub };
    },
    { force: options?.force },
  );
}

export function peekCoachBundleCached() {
  return peekCachedResource<Awaited<ReturnType<typeof loadCoachBundleCached>>>(CACHE_KEYS.coachBundle);
}

export function loadTrophyLeaderboardCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.trophyLeaderboard, fetchTrophyLeaderboard, { force: options?.force });
}

export function peekTrophyLeaderboardCached() {
  return peekCachedResource<Awaited<ReturnType<typeof fetchTrophyLeaderboard>>>(CACHE_KEYS.trophyLeaderboard);
}

export type MainAppPreloadSnapshot = {
  phase: 'idle' | 'loading' | 'ready';
  completed: number;
  total: number;
  lastCompletedLabel: string;
};

type PreloadRun = {
  id: number;
  sessionId: string;
  startedAt: number;
  settled: boolean;
  criticalReady: Promise<PromiseSettledResult<unknown>[]>;
  allReady: Promise<PromiseSettledResult<unknown>[]>;
};

const CRITICAL_TASK_TOTAL = 7;
const preloadListeners = new Set<(snapshot: MainAppPreloadSnapshot) => void>();
let preloadSnapshot: MainAppPreloadSnapshot = {
  phase: 'idle',
  completed: 0,
  total: CRITICAL_TASK_TOTAL,
  lastCompletedLabel: '',
};
let activePreload: PreloadRun | null = null;
let preloadRunId = 0;

function publishPreloadSnapshot(next: MainAppPreloadSnapshot) {
  preloadSnapshot = next;
  preloadListeners.forEach((listener) => listener(next));
}

export function getMainAppPreloadSnapshot() {
  return preloadSnapshot;
}

export function subscribeToMainAppPreload(listener: (snapshot: MainAppPreloadSnapshot) => void) {
  listener(preloadSnapshot);
  preloadListeners.add(listener);
  return () => {
    preloadListeners.delete(listener);
  };
}

function trackPreloadTask<T>(runId: number, label: string, critical: boolean, promise: Promise<T>) {
  return promise.finally(() => {
    if (!critical || runId !== preloadRunId) return;
    const completed = Math.min(preloadSnapshot.total, preloadSnapshot.completed + 1);
    publishPreloadSnapshot({
      phase: completed >= preloadSnapshot.total ? 'ready' : 'loading',
      completed,
      total: preloadSnapshot.total,
      lastCompletedLabel: label,
    });
  });
}

async function warmCoachArtwork(
  workout: Awaited<ReturnType<typeof loadWorkoutPlanCached>> | null,
  coach: Awaited<ReturnType<typeof loadCoachBundleCached>> | null,
) {
  if (!coach?.coachHub) return;
  await preloadImageSources(
    getCoachImageSources(coach.coachHub, workout?.today?.assignedTrainer),
  );
}

function startMainAppPreload(): PreloadRun {
  const sessionId = getActiveCacheSessionId();
  const now = Date.now();
  if (
    activePreload?.sessionId === sessionId
    && (!activePreload.settled || now - activePreload.startedAt < 10_000)
  ) {
    return activePreload;
  }

  const runId = ++preloadRunId;
  publishPreloadSnapshot({
    phase: 'loading',
    completed: 0,
    total: CRITICAL_TASK_TOTAL,
    lastCompletedLabel: '',
  });

  const workoutPlanRequest = loadWorkoutPlanCached();
  // Public reading content warms alongside startup without holding the splash.
  const readingRoom = preloadReadingPage()
    .then(page => preloadImageSources(page.articles.slice(0, 3).map(article =>
      article.imageUrl ? { uri: article.imageUrl } : null,
    )))
    .catch(() => null);
  const profileSettingsRequest = loadProfileSettingsCached();
  const coachBundleRequest = loadCoachBundleCached();
  const workoutPlan = trackPreloadTask(runId, 'Training plan', true, workoutPlanRequest);
  const profileSettings = trackPreloadTask(runId, 'Profile', true, profileSettingsRequest);
  const progressBundle = trackPreloadTask(runId, 'Progress', true, loadProgressBundleCached());
  const coachBundle = trackPreloadTask(
    runId,
    'Coach',
    true,
    Promise.all([
      coachBundleRequest,
      Promise.all([
        workoutPlanRequest.catch(() => null),
        coachBundleRequest.catch(() => null),
      ]).then(([workout, coach]) => warmCoachArtwork(workout, coach)),
    ]).then(([coach]) => coach),
  );
  const artwork = trackPreloadTask(
    runId,
    'Artwork',
    true,
    profileSettingsRequest
      .catch(() => null)
      .then(settings => preloadImageSources(getMainAppArtworkSources(settings?.profile?.gender))),
  );
  const accountability = trackPreloadTask(runId, 'Accountability', true, fetchAccountability());
  const localDietDiary = trackPreloadTask(
    runId,
    'Meal diary',
    true,
    loadDietDiaryEntries().then(async entries => {
      // Warm the latest diary thumbnails that can appear without scrolling.
      await preloadImageSources(getDietDiaryImageSources(entries.slice(0, 8)));
      return entries;
    }),
  );

  const criticalReady = Promise.allSettled([
    workoutPlan,
    profileSettings,
    progressBundle,
    coachBundle,
    artwork,
    accountability,
    localDietDiary,
  ]);
  // Optional work starts only after the first-paint resources settle, so the
  // slower report/leaderboard endpoints never compete with startup.
  const allReady = criticalReady.then(async (criticalResults) => {
    const remoteDietDiary = trackPreloadTask(
      runId,
      'Diet report',
      false,
      loadDietDiaryCached().then(async data => {
        await preloadImageSources(getDietDiaryImageSources(
          data.entries.slice(0, 8).map(entry => ({
            id: entry.entryId,
            kind: entry.status === 'skipped' ? 'skip' : entry.imageUrl ? 'photo' : 'text',
            status: entry.status,
            uri: entry.imageUrl,
            remoteImageUrl: entry.imageUrl,
            remoteId: entry.entryId,
            createdAt: entry.createdAt,
            loggedAt: entry.loggedAt,
            mealType: entry.mealType === 'Snack' ? 'Evening' : entry.mealType,
            note: entry.note,
            storedLocally: false,
          }))),
        );
        return data;
      }),
    );
    const trophyLeaderboard = trackPreloadTask(runId, 'Rankings', false, loadTrophyLeaderboardCached());
    const accountabilityBae = trackPreloadTask(
      runId,
      'Partner updates',
      false,
      fetchAccountabilityBae().then(async summary => {
        await preloadImageSources(getAccountabilityProofSources(summary));
        return summary;
      }),
    );
    const nextWorkout = trackPreloadTask(
      runId,
      'Next workout',
      false,
      workoutPlan.then(async (data): Promise<Array<PromiseSettledResult<Awaited<ReturnType<typeof loadWorkoutDayCached>>>>> => {
        const plan = data.plan || data.today?.plan;
        const days = plan?.days || [];
        const day = days.find((item) => !item.completed) || days[0];
        if (!day?.planDayId) return [];
        return Promise.allSettled([
          loadWorkoutDayCached(day.planDayId, 'standard'),
          loadWorkoutDayCached(day.planDayId, 'quick'),
        ]);
      }),
    );
    const optionalResults = await Promise.allSettled([
      readingRoom,
      remoteDietDiary,
      trophyLeaderboard,
      accountabilityBae,
      nextWorkout,
    ]);
    return [...criticalResults, ...optionalResults];
  }).finally(() => {
    if (activePreload?.id === runId) activePreload.settled = true;
  });

  activePreload = {
    id: runId,
    sessionId,
    startedAt: now,
    settled: false,
    criticalReady,
    allReady,
  };
  return activePreload;
}

/** Resolves once first-paint data has settled; callers should still use a hard deadline. */
export function preloadMainAppCriticalData() {
  return startMainAppPreload().criticalReady;
}

/**
 * Returns the final first-frame sources after critical data has hydrated.
 * Splash mounts these in native Image views so pixel decoding—not just URI
 * prefetching—finishes before Main is revealed.
 */
export function getMainAppImageSourcesSnapshot(): ImageSourcePropType[] {
  const settings = peekProfileSettingsCached();
  const workout = peekWorkoutPlanCached();
  const coach = peekCoachBundleCached();
  const diaryEntries = peekDietDiaryEntries() || [];
  return dedupeImageSources([
    ...getMainAppArtworkSources(settings?.profile?.gender),
    ...(coach?.coachHub
      ? getCoachImageSources(coach.coachHub, workout?.today?.assignedTrainer)
      : []),
    ...getDietDiaryImageSources(diaryEntries.slice(0, 8)),
  ]);
}

/** Starts the complete warm-up. Optional tasks intentionally continue after navigation. */
export function preloadMainAppData() {
  return startMainAppPreload().allReady;
}
