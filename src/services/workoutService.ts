import { normalizeWorkoutBundle, normalizeWorkoutPlan, normalizeWorkoutDetail } from '../utils/workoutTitle';
import { ApiError, apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import { publishOrRefreshTrophySummary } from './trophyRealtime';
import type { AiPlanRefresh, TodayPayload, TrophySummary, UserPlanSummary, WorkoutDayDetail } from '../types/api';
import {ensureEquipmentFreeQuickWorkout} from '../utils/quickWorkout';

export const PENDING_AI_PLAN_BUILD_KEY = 'formbae_pending_ai_plan_build';

export async function fetchWorkoutPlan() {
  return normalizeWorkoutBundle(await apiRequest<{ today: TodayPayload; plan: TodayPayload['plan']; aiPlanRefresh?: AiPlanRefresh }>('/workouts/plan'));
}

export async function fetchUserPlans() {
  const data = await apiRequest<{ plans: UserPlanSummary[] }>('/user/plans');
  return { ...data, plans: data.plans.map(normalizeWorkoutPlan) };
}

export async function selectWorkoutPlan(planId: string) {
  const response = await apiRequest<{ ok: boolean; planId: string }>('/workouts/plan/select', {
    method: 'POST',
    body: { planId },
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  invalidateCachedResource('progressBundle');
  return response;
}

export async function fetchToday() {
  const data = await apiRequest<TodayPayload>('/workouts/today');
  return { ...data, plan: data.plan ? normalizeWorkoutPlan(data.plan) : data.plan };
}

export async function fetchWorkoutDay(planDayId: string, mode: 'standard' | 'quick' = 'standard'): Promise<WorkoutDayDetail> {
  const path = `/workouts/day/${encodeURIComponent(planDayId)}`;
  try {
    const detail = await apiRequest<WorkoutDayDetail>(`${path}?mode=${mode}`);
    return normalizeWorkoutDetail(mode === 'quick' ? ensureEquipmentFreeQuickWorkout(detail) : detail);
  } catch (error) {
    if (mode !== 'quick') throw error;
    const status = error instanceof ApiError ? error.status : 0;
    if (status && status !== 404 && status < 500) throw error;
    const fallback = await apiRequest<WorkoutDayDetail>(`${path}?mode=standard`);
    return normalizeWorkoutDetail(ensureEquipmentFreeQuickWorkout(fallback, true));
  }
}

export async function resolveWorkoutVideo(params: {
  planDayId: string;
  workoutMode: 'standard' | 'quick';
  exerciseId?: string;
  exerciseName: string;
  order?: string;
  focus?: string;
}) {
  const response = await apiRequest<{ ok: boolean; videoUrl: string; videoId?: string; source?: string; title?: string }>(
    '/workouts/resolve-video',
    {
      method: 'POST',
      body: params,
      timeoutMs: 25000,
    },
  );
  invalidateCachedResource('workoutDay');
  return response;
}

type WorkoutVideoContext = {
  planDayId: string;
  workoutMode: 'standard' | 'quick';
  exerciseId?: string;
  exerciseName: string;
  order?: string;
};

const workoutVideoOverrides = new Map<string, string>();

function workoutVideoContextKey(params: WorkoutVideoContext) {
  return [params.planDayId, params.workoutMode, params.exerciseId || '', params.order || '', params.exerciseName.trim().toLowerCase()].join(':');
}

export function getWorkoutVideoOverride(params: WorkoutVideoContext) {
  return workoutVideoOverrides.get(workoutVideoContextKey(params)) || '';
}

export async function replaceWorkoutVideo(params: WorkoutVideoContext & {
  previousVideoUrl: string;
  focus?: string;
}) {
  const response = await apiRequest<{ ok: boolean; videoUrl: string; videoId?: string; source?: string; title?: string }>(
    '/workouts/resolve-video',
    {
      method: 'POST',
      body: { ...params, replaceExisting: true },
      timeoutMs: 25000,
    },
  );
  if (response.videoUrl) {
    workoutVideoOverrides.set(workoutVideoContextKey(params), response.videoUrl);
  }
  invalidateCachedResource('workoutDay');
  return response;
}

export type CompletedExerciseInput = {
  exerciseId: string;
  name: string;
  completed: boolean;
  plannedSets?: string;
  plannedReps?: string;
  sets: Array<{ setNumber: string; reps: string; weight: string; durationSec?: string }>;
};

export type WorkoutCompletionInput = {
  planId: string;
  planDayId: string;
  action: 'exercise' | 'exerciseUndo' | 'day' | 'dayUndo';
  exerciseId?: string;
  workoutMode?: string;
  streakOnly?: boolean;
  exercises?: CompletedExerciseInput[];
};

export async function completeWorkoutAction(params: WorkoutCompletionInput) {
  const response = await apiRequest<{ ok: boolean; completed: boolean; date: string; trophies?: TrophySummary }>('/workouts/complete', {
    method: 'POST',
    body: params,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export async function requestAiPlanRefresh(params: {
  planId: string;
  aiTrainerAnswers: Record<string, string>;
}) {
  const response = await apiRequest<{ ok: boolean; newPlanId?: string; status?: string; error?: string }>('/workouts/redesign', {
    method: 'POST',
    body: params,
    // The backend owns the build request until the frontend has saved and activated the
    // generated plan. Leave enough headroom around its 295-second upstream timeout for the
    // final status write and response trip back to the device.
    timeoutMs: 315000,
    retries: 0,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  return response;
}
