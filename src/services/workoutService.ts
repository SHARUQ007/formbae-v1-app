import { apiRequest } from './apiClient';
import type { AiPlanRefresh, TodayPayload, WorkoutDayDetail } from '../types/api';

export async function fetchWorkoutPlan() {
  return apiRequest<{ today: TodayPayload; plan: TodayPayload['plan']; aiPlanRefresh?: AiPlanRefresh }>('/workouts/plan');
}

export async function fetchToday() {
  return apiRequest<TodayPayload>('/workouts/today');
}

export async function fetchWorkoutDay(planDayId: string, mode: 'standard' | 'quick' = 'standard') {
  return apiRequest<WorkoutDayDetail>(`/workouts/day/${encodeURIComponent(planDayId)}?mode=${mode}`);
}

export async function completeWorkoutAction(params: {
  planId: string;
  planDayId: string;
  action: 'exercise' | 'exerciseUndo' | 'day' | 'dayUndo';
  exerciseId?: string;
  workoutMode?: string;
}) {
  return apiRequest<{ ok: boolean; completed: boolean; date: string }>('/workouts/complete', {
    method: 'POST',
    body: params,
  });
}

export async function requestAiPlanRefresh(params: {
  planId: string;
  aiTrainerAnswers: Record<string, string>;
}) {
  return apiRequest<{ ok: boolean; allowance?: AiPlanRefresh['allowance']; error?: string }>('/workouts/redesign', {
    method: 'POST',
    body: params,
    timeoutMs: 120000,
  });
}
