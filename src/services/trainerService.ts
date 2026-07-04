import { apiRequest } from './apiClient';
import type { AnalysisReport, TrainerRecommendation } from '../types/api';

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
