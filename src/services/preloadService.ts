import { getCachedResource } from './appCache';
import { fetchCheckIns } from './checkInService';
import { fetchDietDiary } from './dietDiaryService';
import { fetchMessages } from './messageService';
import { fetchProgress } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchUserPlans, fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';

export const CACHE_KEYS = {
  workoutPlan: 'workoutPlan',
  // Bump when the progress response contract changes so an older persisted
  // bundle cannot hide a newly generated weekly review after an app update.
  progressBundle: 'progressBundle:v5',
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
      const [progress, checkIns, userPlans, settings] = await Promise.all([
        fetchProgress(),
        fetchCheckIns(),
        fetchUserPlans(),
        loadProfileSettingsCached(options),
      ]);
      return {
        progress,
        checkIns: checkIns.checkIns,
        dueThisWeek: checkIns.dueThisWeek,
        planDays: userPlans.plans.flatMap((plan) => plan.days ?? []),
        gender: settings.profile?.gender || '',
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
  ]).finally(() => {
    preloadPromise = null;
  });
  return preloadPromise;
}
