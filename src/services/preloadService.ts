import { getCachedResource } from './appCache';
import { fetchCheckIns } from './checkInService';
import { fetchDietDiary } from './dietDiaryService';
import { fetchMessages } from './messageService';
import { fetchProgress } from './progressService';
import { fetchSettings } from './settingsService';
import { fetchCoachHub } from './trainerService';
import { fetchWorkoutDay, fetchWorkoutPlan } from './workoutService';

export const CACHE_KEYS = {
  workoutPlan: 'workoutPlan',
  progressBundle: 'progressBundle',
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
      const [progress, checkIns] = await Promise.all([fetchProgress(), fetchCheckIns()]);
      return { progress, checkIns: checkIns.checkIns, dueThisWeek: checkIns.dueThisWeek };
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

export function preloadMainAppData() {
  Promise.allSettled([
    loadWorkoutPlanCached(),
    loadProgressBundleCached(),
    loadDietDiaryCached(),
    loadProfileSettingsCached(),
    loadCoachBundleCached(),
  ]).catch(() => undefined);
}
