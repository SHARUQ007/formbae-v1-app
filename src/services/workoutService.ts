import { ApiError, apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { AiPlanRefresh, TodayPayload, WorkoutDayDetail } from '../types/api';

export async function fetchWorkoutPlan() {
  return apiRequest<{ today: TodayPayload; plan: TodayPayload['plan']; aiPlanRefresh?: AiPlanRefresh }>('/workouts/plan');
}

export async function fetchToday() {
  return apiRequest<TodayPayload>('/workouts/today');
}

export async function fetchWorkoutDay(planDayId: string, mode: 'standard' | 'quick' = 'standard'): Promise<WorkoutDayDetail> {
  const path = `/workouts/day/${encodeURIComponent(planDayId)}`;
  try {
    return await apiRequest<WorkoutDayDetail>(`${path}?mode=${mode}`);
  } catch (error) {
    if (mode !== 'quick') throw error;
    const status = error instanceof ApiError ? error.status : 0;
    if (status && status !== 404 && status < 500) throw error;
    const fallback = await apiRequest<WorkoutDayDetail>(`${path}?mode=standard`);
    return { ...fallback, workoutMode: 'quick' as const };
  }
}

export async function completeWorkoutAction(params: {
  planId: string;
  planDayId: string;
  action: 'exercise' | 'exerciseUndo' | 'day' | 'dayUndo';
  exerciseId?: string;
  workoutMode?: string;
}) {
  const response = await apiRequest<{ ok: boolean; completed: boolean; date: string }>('/workouts/complete', {
    method: 'POST',
    body: params,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('progressBundle');
  return response;
}

export async function requestAiPlanRefresh(params: {
  planId: string;
  aiTrainerAnswers: Record<string, string>;
}) {
  const response = await apiRequest<{ ok: boolean; allowance?: AiPlanRefresh['allowance']; error?: string }>('/workouts/redesign', {
    method: 'POST',
    body: params,
    timeoutMs: 120000,
  });
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  return response;
}
