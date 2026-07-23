import { apiRequest } from './apiClient';
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

export async function changeCoach(trainerId: string) {
  return apiRequest<{ ok: boolean; trainer: CoachHubPayload['currentTrainer'] }>('/trainer/change', {
    method: 'POST',
    body: { trainerId },
  });
}
