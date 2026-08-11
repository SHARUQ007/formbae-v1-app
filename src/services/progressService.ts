import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { ProgressSummary, TrophyInvite, TrophyLeaderboard } from '../types/api';

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

export function fetchTrophyLeaderboard() {
  return apiRequest<TrophyLeaderboard>('/trophies/leaderboard');
}

export function fetchTrophyInvite() {
  return apiRequest<TrophyInvite>('/trophies/invite');
}

export function acceptTrophyInvite(code: string) {
  return apiRequest<{ ok: boolean; connectedUserId: string }>('/trophies/invite/accept', {
    method: 'POST',
    body: { code },
  });
}
