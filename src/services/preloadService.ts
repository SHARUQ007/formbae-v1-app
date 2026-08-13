import { getCachedResource } from './appCache';
import { fetchCheckIns } from './checkInService';
import { fetchAccountability, fetchAccountabilityBae } from './accountabilityService';
import { fetchDietDiary } from './dietDiaryService';
import { fetchMessages } from './messageService';
import { fetchProgress, flushPendingProgressLogs } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchUserPlans, fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';

export const CACHE_KEYS = {
  workoutPlan: 'workoutPlan',
  // Bump when the progress response contract changes so an older persisted
  // bundle cannot hide a newly generated weekly review after an app update.
  progressBundle: 'progressBundle:v10',
  dietDiary: 'dietDiary',
  profileSettings: 'profileSettings',
  coachBundle: 'coachBundle',
  workoutDay: 'workoutDay',
} as const;

export function loadWorkoutPlanCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.workoutPlan, fetchWorkoutPlan, { force: options?.force });
}

export function loadWorkoutDayCached(planDayId: string, mode: 'standard' | 'quick' = 'standard', options?: { force?: boolean }) {
  return getCachedResource(
    `${CACHE_KEYS.workoutDay}:${planDayId}:${mode}`,
    () => fetchWorkoutDay(planDayId, mode),
    { force: options?.force },
  );
}

export function loadProgressBundleCached(options?: { force?: boolean }) {
  return getCachedResource(
    CACHE_KEYS.progressBundle,
    async () => {
      // Persisted offline body logs are flushed before reading progress so the
      // response reflects everything the user has already saved on-device.
      await flushPendingProgressLogs();
      const [progressResult, checkInsResult, userPlansResult, settingsResult] = await Promise.allSettled([
        fetchProgress(),
        fetchCheckIns(),
        fetchUserPlans(),
        loadProfileSettingsCached(options),
      ] as const);
      // Progress is the primary payload. Optional supporting requests should
      // never hide measurements that were successfully read from the database.
      if (progressResult.status === 'rejected') throw progressResult.reason;
      const progress = progressResult.value;
      const checkIns = checkInsResult.status === 'fulfilled' ? checkInsResult.value : null;
      const userPlans = userPlansResult.status === 'fulfilled' ? userPlansResult.value : null;
      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      return {
        progress,
        checkIns: checkIns?.checkIns ?? [],
        dueThisWeek: checkIns?.dueThisWeek ?? [],
        planDays: userPlans?.plans.flatMap((plan) => plan.days ?? []) ?? [],
        gender: settings?.profile?.gender || '',
        userName: settings?.user?.name || settings?.profile?.name || '',
      };
    },
    { force: options?.force },
  );
}

export function loadDietDiaryCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.dietDiary, fetchDietDiary, { force: options?.force });
}

export function loadProfileSettingsCached(options?: { force?: boolean }) {
  return getCachedResource(CACHE_KEYS.profileSettings, fetchSettings, { force: options?.force });
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
    loadProfileSettingsCached(),
    loadCoachBundleCached(),
    fetchAccountability(),
    fetchAccountabilityBae(),
  ]).finally(() => {
    preloadPromise = null;
  });
  return preloadPromise;
}
