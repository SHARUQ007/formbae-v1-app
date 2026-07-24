import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { ProgressSummary } from '../types/api';

export async function fetchProgress() {
  return apiRequest<ProgressSummary>('/progress');
}

export async function logProgress(body: {
  weight?: string;
  chest?: string;
  waist?: string;
  biceps?: string;
  notes?: string;
}) {
  const response = await apiRequest<{ ok: boolean }>('/progress', { method: 'POST', body });
  invalidateCachedResource('progressBundle');
  return response;
}
