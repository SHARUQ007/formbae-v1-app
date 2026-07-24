import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { CheckIn } from '../types/api';

export async function fetchCheckIns() {
  return apiRequest<{ checkIns: CheckIn[]; dueThisWeek: boolean }>('/check-ins');
}

export async function submitCheckIn(body: {
  weight?: string;
  workoutCompletion?: string;
  energyLevel?: string;
  difficultyLevel?: string;
  notes?: string;
}) {
  const response = await apiRequest<{ ok: boolean; checkIn: CheckIn }>('/check-ins', { method: 'POST', body });
  invalidateCachedResource('progressBundle');
  return response;
}
