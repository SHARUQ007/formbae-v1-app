import type { Asset } from 'react-native-image-picker';
import { apiRequest, getApiUrl, getAuthToken } from './apiClient';
import { getCachedResource, setCachedResource } from './appCache';
import type { AccountabilityBaeSummary, AccountabilitySummary } from '../types/api';

const ACCOUNTABILITY_CACHE_KEY = 'accountability:summary:v1';
const ACCOUNTABILITY_BAE_CACHE_KEY = 'accountability:bae:v1';

export function fetchAccountability(options?: { force?: boolean }) {
  return getCachedResource(
    ACCOUNTABILITY_CACHE_KEY,
    () => apiRequest<AccountabilitySummary>('/accountability'),
    { force: options?.force },
  );
}

export function updateAccountability(body: {
  action: 'commit' | 'complete' | 'skip';
  targetKind?: string;
  targetId?: string;
  title?: string;
}) {
  return apiRequest<AccountabilitySummary>('/accountability', { method: 'POST', body }).then((summary) => {
    setCachedResource(ACCOUNTABILITY_CACHE_KEY, summary);
    return summary;
  });
}

export function fetchAccountabilityBae(options?: { force?: boolean }) {
  return getCachedResource(
    ACCOUNTABILITY_BAE_CACHE_KEY,
    () => apiRequest<AccountabilityBaeSummary>('/accountability/bae'),
    { force: options?.force },
  );
}

function cacheBae(summary: AccountabilityBaeSummary) {
  setCachedResource(ACCOUNTABILITY_BAE_CACHE_KEY, summary);
  return summary;
}

export function startAccountabilityBaeMatch(preference: 'male' | 'female' | 'friend') {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/match', { method: 'POST', body: { preference } }).then(cacheBae);
}

export function joinAccountabilityBaeFriend(inviteCode: string) {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/friend/join', { method: 'POST', body: { inviteCode } }).then(cacheBae);
}

export function leaveAccountabilityBae() {
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/leave', { method: 'POST' }).then(cacheBae);
}

export function uploadAccountabilityBaeProof(asset: Asset) {
  if (!asset.base64) throw new Error('Photo data is unavailable.');
  return apiRequest<AccountabilityBaeSummary>('/accountability/bae/proof', {
    method: 'POST',
    timeoutMs: 30000,
    body: { imageBase64: asset.base64, imageMime: asset.type || 'image/jpeg' },
  }).then(cacheBae);
}

export function accountabilityBaeProofSource(path?: string) {
  if (!path) return undefined;
  const token = getAuthToken();
  return { uri: getApiUrl(path), headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}
