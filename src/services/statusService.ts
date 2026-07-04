import { apiRequest } from './apiClient';
import type { UserStatus } from '../types/api';

export async function fetchUserStatus() {
  return apiRequest<UserStatus>('/me/status');
}

export async function fetchMe() {
  return apiRequest<{
    user: { userId: string; name: string; mobile: string; trainerId: string };
    profile: Record<string, string> | null;
    access: Record<string, unknown> | null;
    status: UserStatus;
  }>('/me');
}
