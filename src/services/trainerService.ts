import { apiRequest, getAuthToken } from './apiClient';
import { invalidateCachedResource } from './appCache';
import { getSiteUrl } from '../constants/config';
import type { AnalysisReport, CoachHubPayload, TrainerRecommendation } from '../types/api';

export async function fetchRecommendedTrainer() {
  return apiRequest<{ trainer: TrainerRecommendation; report: AnalysisReport }>('/trainer/recommended');
}

export async function fetchTrainerById(id: string) {
  return apiRequest<{
    trainerId: string;
    name: string;
    gender: string;
    photoUrl: string;
    expertise: string;
    description: string;
  }>(`/trainer/${id}`);
}

export async function fetchCoachHub() {
  return apiRequest<CoachHubPayload>('/trainer/options');
}

/**
 * Temporary compatibility source for trainer photos created before the
 * dedicated backend image route was available in every environment.
 */
export async function fetchCoachHubPhotoFallbacks() {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication is required to load coach photos.');
  const response = await fetch(`${getSiteUrl()}/api/mobile/trainer/options`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`Coach photo fallback failed (${response.status}).`);
  return response.json() as Promise<CoachHubPayload>;
}

export async function changeCoach(trainerId: string) {
  const response = await apiRequest<{ ok: boolean; trainer: CoachHubPayload['currentTrainer'] }>('/trainer/change', {
    method: 'POST',
    body: { trainerId },
  });
  invalidateCachedResource('coachBundle');
  invalidateCachedResource('workoutPlan');
  invalidateCachedResource('workoutDay');
  return response;
}
