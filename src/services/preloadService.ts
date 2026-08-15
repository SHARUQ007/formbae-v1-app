import { getCachedResource, peekCachedResource } from './appCache';
import { fetchAccountability, fetchAccountabilityBae } from './accountabilityService';
import { fetchDietDiary } from './dietDiaryService';
import { fetchMessages } from './messageService';
import { fetchProgress, fetchTrophyLeaderboard, flushPendingProgressLogs } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';

export const CACHE_KEYS = {
  // Bump when the plan presentation contract changes so persisted legacy
  // titles such as "Starter Plan by Ava" cannot survive an app update.
  workoutPlan: 'workoutPlan:v2',
  // Bump when the progress response contract changes so an older persisted
  // bundle cannot hide a newly generated weekly review after an app update.
  progressBundle: 'progressBundle:v10',
  dietDiary: 'dietDiary',
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
      const [msgs, coachHub] = await Promise.all([fetchMessages(), fetchCoachHub()]);
      return {
        messages: [...msgs.messages].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
        planId: msgs.planId,
        coachHub,
      };
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

let preloadPromise: Promise<unknown[]> | null = null;
let lastPreloadStartedAt = 0;

export function preloadMainAppData() {
  const now = Date.now();
  if (preloadPromise && now - lastPreloadStartedAt < 10_000) {
    return preloadPromise;
  }
  lastPreloadStartedAt = now;
  preloadPromise = Promise.allSettled([
    loadWorkoutPlanCached(),
    loadDietDiaryCached(),
    loadProgressBundleCached(),
    loadTrophyLeaderboardCached(),
    loadProfileSettingsCached(),
    loadCoachBundleCached(),
    fetchAccountability(),
    fetchAccountabilityBae(),
  ]).finally(() => {
    preloadPromise = null;
  });
  return preloadPromise;
}
