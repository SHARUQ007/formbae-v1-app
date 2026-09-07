import { loadWorkoutPlanCached, peekWorkoutPlanCached } from '../services/preloadService';
import { loadDietDiaryEntries, peekDietDiaryEntries, type DietDiaryEntry, type MealType } from '../store/dietDiaryStore';
import type { PlanDay, TodayPayload } from '../types/api';
import { mealForCurrentTime } from './dietDiaryTime';

export type ContextualTarget =
  | { kind: 'diet'; label: string; detail: string; icon: string; mealType: MealType }
  | { kind: 'workout'; label: string; detail: string; icon: string; day?: PlanDay }
  | { kind: 'refresh'; label: string; detail: string; icon: string }
  | { kind: 'progress'; label: string; detail: string; icon: string };

export type ContextualSnapshot = {
  target: ContextualTarget;
  workoutData: Awaited<ReturnType<typeof loadWorkoutPlanCached>> | null;
  dietEntries: Awaited<ReturnType<typeof loadDietDiaryEntries>>;
};

export function currentMealType(date = new Date()): MealType {
  return mealForCurrentTime(date);
}

export function isMealWindow(date = new Date()) {
  const hour = date.getHours();
  return hour >= 5 && hour < 23;
}

export function isToday(value: string, reference = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === reference.toDateString();
}

export function isUsableDietEntry(entry: DietDiaryEntry) {
  return entry.kind !== 'skip' && entry.status !== 'skipped';
}

export function shouldOfferMealTask(entries: DietDiaryEntry[], date = new Date()) {
  const usableEntries = entries.filter(isUsableDietEntry);
  const mealType = currentMealType(date);
  const currentMealLogged = usableEntries.some(
    (entry) => isToday(entry.createdAt, date) && entry.mealType === mealType,
  );
  return !currentMealLogged && (isMealWindow(date) || usableEntries.length === 0);
}

export function workoutTitle(day?: PlanDay) {
  const focus = String(day?.focus || '').trim();
  return focus || "Today's workout";
}

export function nextPlanDay(plan?: TodayPayload['plan']) {
  const days = plan?.days || [];
  return days.find((day) => !day.completed) || days[0];
}

export function resolveTargetFromSnapshot(snapshot: Omit<ContextualSnapshot, 'target'>): ContextualTarget {
  const { workoutData, dietEntries } = snapshot;
  const now = new Date();
  const mealType = currentMealType(now);

  if (shouldOfferMealTask(dietEntries, now)) {
    return {
      kind: 'diet',
      label: mealType,
      detail: 'Food memory',
      icon: 'book-open',
      mealType,
    };
  }

  const plan = workoutData?.plan || workoutData?.today?.plan;
  const day = nextPlanDay(plan);
  if (day?.planDayId && !day.completed) {
    return {
      kind: 'workout',
      label: 'Today',
      detail: 'Workout',
      icon: 'activity',
      day,
    };
  }

  if (workoutData?.aiPlanRefresh?.due) {
    return {
      kind: 'refresh',
      label: 'Ava',
      detail: 'Next plan',
      icon: 'refresh-cw',
    };
  }

  if (!plan?.days?.length) {
    return {
      kind: 'workout',
      label: 'Start',
      detail: 'First workout',
      icon: 'activity',
    };
  }

  return {
    kind: 'progress',
    label: 'Check',
    detail: 'Progress',
    icon: 'smile',
  };
}

/**
 * Builds the Action tab's first frame entirely from warmed synchronous data.
 * A cached empty diary is valid data, so null is the only cold state.
 */
export function peekContextualSnapshot(): ContextualSnapshot | null {
  const workoutData = peekWorkoutPlanCached();
  const dietEntries = peekDietDiaryEntries();
  if (!workoutData && dietEntries === null) return null;
  const base = { workoutData, dietEntries: dietEntries ?? [] };
  return { ...base, target: resolveTargetFromSnapshot(base) };
}

export async function resolveContextualSnapshot(): Promise<ContextualSnapshot> {
  try {
    const [workoutData, dietEntries] = await Promise.all([
      loadWorkoutPlanCached().catch(() => null),
      loadDietDiaryEntries().catch(() => []),
    ]);
    const base = { workoutData, dietEntries };
    return { ...base, target: resolveTargetFromSnapshot(base) };
  } catch {
    return {
      workoutData: null,
      dietEntries: [],
      target: {
        kind: 'workout',
        label: 'Today',
        detail: 'Workout',
        icon: 'home',
      },
    };
  }
}
