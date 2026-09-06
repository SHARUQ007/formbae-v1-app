import { Image, type ImageSourcePropType } from 'react-native';
import { getActiveCacheSessionId, getCachedResource, peekCachedResource } from './appCache';
import { fetchAccountability, fetchAccountabilityBae } from './accountabilityService';
import { DIET_DIARY_CACHE_KEY, fetchDietDiary } from './dietDiaryService';
import { fetchProgress, fetchTrophyLeaderboard, flushPendingProgressLogs } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';
import { loadDietDiaryEntries } from '../store/dietDiaryStore';
import { getCoachArtworkSource } from '../utils/coachArtwork';

export const CACHE_KEYS = {
  // Bump when the plan presentation contract changes so persisted legacy
  // titles such as "Starter Plan by Ava" cannot survive an app update.
  workoutPlan: 'workoutPlan:v2',
  // Bump when the progress response contract changes so an older persisted
  // bundle cannot hide a newly generated weekly review after an app update.
  progressBundle: 'progressBundle:v11',
  dietDiary: DIET_DIARY_CACHE_KEY,
  profileSettings: 'profileSettings',
  coachBundle: 'coachBundle',
  workoutDay: 'workoutDay',
  trophyLeaderboard: 'trophyLeaderboard',
} as const;

export function loadWorkoutPlanCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.workoutPlan, fetchWorkoutPlan, { force: options?.force });
}

export function peekWorkoutPlanCached() {
  return peekCachedResource<Awaited<ReturnType<typeof fetchWorkoutPlan>>>(CACHE_KEYS.workoutPlan);
}

export function loadWorkoutDayCached(planDayId: string, mode: 'standard' | 'quick' = 'standard', options?: { force?: boolean }) {
  return getCachedResource(
    `${CACHE_KEYS.workoutDay}:${planDayId}:${mode}`,
    () => fetchWorkoutDay(planDayId, mode),
    { force: options?.force },
  );
}

export function peekWorkoutDayCached(planDayId: string, mode: 'standard' | 'quick' = 'standard') {
  return peekCachedResource<Awaited<ReturnType<typeof fetchWorkoutDay>>>(`${CACHE_KEYS.workoutDay}:${planDayId}:${mode}`);
}

export function loadProgressBundleCached(options?: { force?: boolean }) {
  return getCachedResource(
    CACHE_KEYS.progressBundle,
    async () => {
      // Persisted offline body logs are flushed before reading progress so the
      // response reflects everything the user has already saved on-device.
      await flushPendingProgressLogs();
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

const CRITICAL_TASK_TOTAL = 6;
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

async function warmRemoteCoachArtwork(
  workout: Awaited<ReturnType<typeof loadWorkoutPlanCached>> | null,
  coach: Awaited<ReturnType<typeof loadCoachBundleCached>> | null,
) {
  const assignedTrainer = workout?.today?.assignedTrainer;
  const currentCoach = coach?.coachHub.currentTrainer;
  const sources = [
    getCoachArtworkSource({ name: assignedTrainer?.name, photoUrl: assignedTrainer?.trainerPhotoUrl }),
    getCoachArtworkSource({ name: currentCoach?.name, photoUrl: currentCoach?.photoUrl }),
  ].filter((source): source is ImageSourcePropType => Boolean(source));
  const remoteUris = [...new Set(
    sources
      .map(source => Image.resolveAssetSource(source)?.uri)
      .filter((uri): uri is string => Boolean(uri && /^https?:\/\//i.test(uri))),
  )];
  await Promise.allSettled(remoteUris.map(uri => Image.prefetch(uri)));
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

  const workoutPlan = trackPreloadTask(runId, 'Training plan', true, loadWorkoutPlanCached());
  const profileSettings = trackPreloadTask(runId, 'Profile', true, loadProfileSettingsCached());
  const progressBundle = trackPreloadTask(runId, 'Progress', true, loadProgressBundleCached());
  const coachBundle = trackPreloadTask(runId, 'Coach', true, loadCoachBundleCached());
  const accountability = trackPreloadTask(runId, 'Accountability', true, fetchAccountability());
  const localDietDiary = trackPreloadTask(runId, 'Meal diary', true, loadDietDiaryEntries());

  const criticalReady = Promise.allSettled([
    workoutPlan,
    profileSettings,
    progressBundle,
    coachBundle,
    accountability,
    localDietDiary,
  ]);
  // Optional work starts only after the first-paint resources settle, so the
  // slower report/leaderboard endpoints never compete with startup.
  const allReady = criticalReady.then(async (criticalResults) => {
    const remoteDietDiary = trackPreloadTask(runId, 'Diet report', false, loadDietDiaryCached());
    const trophyLeaderboard = trackPreloadTask(runId, 'Rankings', false, loadTrophyLeaderboardCached());
    const accountabilityBae = trackPreloadTask(runId, 'Partner updates', false, fetchAccountabilityBae());
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
    const remoteCoachArtwork = trackPreloadTask(
      runId,
      'Coach artwork',
      false,
      Promise.all([
        workoutPlan.catch(() => null),
        coachBundle.catch(() => null),
      ]).then(([workout, coach]) => warmRemoteCoachArtwork(workout, coach)),
    );
    const optionalResults = await Promise.allSettled([
      remoteDietDiary,
      trophyLeaderboard,
      accountabilityBae,
      nextWorkout,
      remoteCoachArtwork,
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

/** Starts the complete warm-up. Optional tasks intentionally continue after navigation. */
export function preloadMainAppData() {
  return startMainAppPreload().allReady;
}
