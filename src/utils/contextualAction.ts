import { loadWorkoutPlanCached } from '../services/preloadService';
import { loadDietDiaryEntries, type MealType } from '../store/dietDiaryStore';
import type { PlanDay, TodayPayload } from '../types/api';

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
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 18 && hour < 23) return 'Dinner';
  return 'Snack';
}

export function isMealWindow(date = new Date()) {
  const hour = date.getHours();
  return (hour >= 5 && hour < 16) || (hour >= 18 && hour < 23);
}

export function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
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
  const mealType = currentMealType();
  const hasCurrentMealLog = dietEntries.some((entry) => isToday(entry.createdAt) && entry.mealType === mealType);

  if (isMealWindow() && !hasCurrentMealLog) {
    return {
      kind: 'diet',
      label: mealType,
      detail: 'Food memory',
      icon: 'edit-3',
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

  return {
    kind: 'progress',
    label: 'Check',
    detail: 'Progress',
    icon: 'smile',
  };
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
