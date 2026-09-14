import { apiRequest } from './apiClient';
import type { UserStatus } from '../types/api';

export function acknowledgeMembershipGift() {
  return apiRequest<{ ok: boolean; status: UserStatus }>('/user/membership-gift/acknowledge', {
    method: 'POST',
  });
}
