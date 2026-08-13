import { ApiError, apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { AiPlanRefresh, TodayPayload, UserPlanSummary, WorkoutDayDetail } from '../types/api';
import {ensureEquipmentFreeQuickWorkout} from '../utils/quickWorkout';

export async function fetchWorkoutPlan() {
  return apiRequest<{ today: TodayPayload; plan: TodayPayload['plan']; aiPlanRefresh?: AiPlanRefresh }>('/workouts/plan');
}

export async function fetchUserPlans() {
  return apiRequest<{ plans: UserPlanSummary[] }>('/user/plans');
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
  return apiRequest<TodayPayload>('/workouts/today');
}

export async function fetchWorkoutDay(planDayId: string, mode: 'standard' | 'quick' = 'standard'): Promise<WorkoutDayDetail> {
  const path = `/workouts/day/${encodeURIComponent(planDayId)}`;
  try {
    const detail = await apiRequest<WorkoutDayDetail>(`${path}?mode=${mode}`);
    return mode === 'quick' ? ensureEquipmentFreeQuickWorkout(detail) : detail;
  } catch (error) {
    if (mode !== 'quick') throw error;
    const status = error instanceof ApiError ? error.status : 0;
    if (status && status !== 404 && status < 500) throw error;
    const fallback = await apiRequest<WorkoutDayDetail>(`${path}?mode=standard`);
    return ensureEquipmentFreeQuickWorkout(fallback, true);
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

export async function completeWorkoutAction(params: {
  planId: string;
  planDayId: string;
  action: 'exercise' | 'exerciseUndo' | 'day' | 'dayUndo';
  exerciseId?: string;
  workoutMode?: string;
  streakOnly?: boolean;
}) {
  const response = await apiRequest<{ ok: boolean; completed: boolean; date: string }>('/workouts/complete', {
    method: 'POST',
    body: params,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  invalidateCachedResource('progressBundle');
  return response;
}

export async function requestAiPlanRefresh(params: {
  planId: string;
  aiTrainerAnswers: Record<string, string>;
}) {
  const response = await apiRequest<{ ok: boolean; newPlanId?: string; status?: string; error?: string }>('/workouts/redesign', {
    method: 'POST',
    body: params,
    timeoutMs: 300000,
    retries: 0,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  return response;
}
