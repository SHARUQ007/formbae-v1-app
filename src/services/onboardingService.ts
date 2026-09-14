import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { MobileQuestion } from '../types/api';

export type OnboardingPlanState = { status: 'idle' | 'building' | 'completed' | 'failed'; planId?: string };
export const fetchOnboardingPlanState = () => apiRequest<OnboardingPlanState>('/onboarding/plan');
export async function createOnboardingPlan() {
  const result = await apiRequest<OnboardingPlanState>('/onboarding/plan', { method: 'POST', timeoutMs: 315_000, retries: 0 });
  if (result.status === 'completed') {
    invalidateCachedResource('workoutPlan');
    invalidateCachedResource('workoutDay');
  }
  return result;
}

export type CoachQuestionsPayload = {
  questions: MobileQuestion[];
  answers: Record<string, string>;
  completed: boolean;
  required: boolean;
};

export const fetchCoachQuestions = () => apiRequest<CoachQuestionsPayload>('/onboarding/coach-questions');

export const saveCoachQuestions = (answers: Record<string, string>) =>
  apiRequest<{ ok: boolean; completed: boolean }>('/onboarding/coach-questions', {
    method: 'POST',
    body: { answers },
  });
