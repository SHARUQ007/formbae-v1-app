import { apiRequest } from './apiClient';
import type { AccountabilitySummary } from '../types/api';

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
