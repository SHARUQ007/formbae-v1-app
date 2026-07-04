import { apiRequest } from './apiClient';
import type { LegalLinks } from '../types/api';

export async function fetchLegal() {
  return apiRequest<LegalLinks>('/legal', { token: null });
}

export async function requestAccountDeletion(reason?: string) {
  return apiRequest<{ ok: boolean; status: string; message: string }>('/me/delete-request', {
    method: 'POST',
    body: { reason },
    retries: 0,
  });
}
