import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';

export type ConnectionDetails = {
  userId: string;
  displayName: string;
  trophyCount: number;
  isPartner: boolean;
  onLeaderboard: boolean;
  connectedSince: string;
  sharedDays: number;
};
export type RemovalScope = 'partner' | 'leaderboard' | 'both';
export function fetchConnection(userId: string) {
  return apiRequest<ConnectionDetails>(
    `/connections/${encodeURIComponent(userId)}`,
  );
}
export async function removeConnection(userId: string, scope: RemovalScope) {
  await apiRequest(
    `/connections/${encodeURIComponent(userId)}/remove/${scope}`,
    { method: 'POST' },
  );
  invalidateCachedResource('trophyLeaderboard:v2');
  invalidateCachedResource('accountability:bae:v3');
}
