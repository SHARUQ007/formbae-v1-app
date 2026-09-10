import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';

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
