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

/** Picked options and free text stay apart: an option can itself contain ", ". */
export type CoachAnswer = { options: string[]; notes: string };

export type CoachQuestionsPayload = {
  questions: MobileQuestion[];
  answers: Record<string, CoachAnswer>;
  completed: boolean;
  required: boolean;
};

export const fetchCoachQuestions = () => apiRequest<CoachQuestionsPayload>('/onboarding/coach-questions');

export const saveCoachQuestions = (answers: Record<string, CoachAnswer>) =>
  apiRequest<{ ok: boolean; completed: boolean }>('/onboarding/coach-questions', {
    method: 'POST',
    body: { answers },
  });
