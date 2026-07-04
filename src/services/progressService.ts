import { apiRequest } from './apiClient';
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
  return apiRequest<{ ok: boolean }>('/progress', { method: 'POST', body });
}
