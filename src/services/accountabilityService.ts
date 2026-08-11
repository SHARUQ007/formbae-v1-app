import type { Asset } from 'react-native-image-picker';
import { apiRequest, getApiUrl, getAuthToken } from './apiClient';
import type { AccountabilityBaeSummary, AccountabilitySummary } from '../types/api';

export function fetchAccountability() {
  return apiRequest<AccountabilitySummary>('/accountability');
}

export function updateAccountability(body: {
  action: 'commit' | 'complete' | 'skip';
  targetKind?: string;
  targetId?: string;
  title?: string;
}) {
  return apiRequest<AccountabilitySummary>('/accountability', { method: 'POST', body });
}

export function fetchAccountabilityBae() {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae');
}

export function startAccountabilityBaeMatch(preference: 'male' | 'female' | 'friend') {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/match', { method: 'POST', body: { preference } });
}

export function joinAccountabilityBaeFriend(inviteCode: string) {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/friend/join', { method: 'POST', body: { inviteCode } });
}

export function leaveAccountabilityBae() {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/leave', { method: 'POST' });
}

export function uploadAccountabilityBaeProof(asset: Asset) {
  if (!asset.base64) throw new Error('Photo data is unavailable.');
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/proof', {
    method: 'POST',
    timeoutMs: 30000,
    body: { imageBase64: asset.base64, imageMime: asset.type || 'image/jpeg' },
  });
}

export function accountabilityBaeProofSource(path?: string) {
  if (!path) return undefined;
  const token = getAuthToken();
  return { uri: getApiUrl(path), headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}
