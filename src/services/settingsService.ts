import { apiRequest } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { SessionUser } from '../types/api';

export type MobileAccessStatus = {
  tier?: string;
  label?: string;
  badgeLabel?: string;
  detail?: string;
  premiumStartDate?: string;
  premiumEndDate?: string;
  premiumDaysRemaining?: number;
  accessState?: 'active' | 'grace' | 'expired' | 'open';
  inGracePeriod?: boolean;
  gracePeriodDays?: number;
  graceEndDate?: string;
  graceDaysRemaining?: number;
  trainerAccessRemainingWeeks?: number;
  trainerAccessTotalWeeks?: number;
  trainerAccessLabel?: string;
  paywallId?: string;
  planName?: string;
};

export type MobileSettingsResponse = {
  user?: SessionUser | null;
  profile: Record<string, string> | null;
  access: MobileAccessStatus | null;
  notifications: {
    workoutReminders: boolean;
    weeklyCheckInReminders: boolean;
    trainerMessageReminders: boolean;
  };
};

export async function fetchSettings() {
  return apiRequest<MobileSettingsResponse>('/settings');
}

export async function updateSettings(notifications: {
  workoutReminders?: boolean;
  weeklyCheckInReminders?: boolean;
  trainerMessageReminders?: boolean;
}) {
  const response = await apiRequest<{ ok: boolean; notifications: Record<string, boolean> }>('/settings', {
    method: 'PATCH',
    body: notifications,
  });
  invalidateCachedResource('profileSettings');
  return response;
}

export async function updateProfile(body: Record<string, string>) {
  const response = await apiRequest<{ ok: boolean; profile: Record<string, string> }>('/me/profile', {
    method: 'PATCH',
    body,
  });
  invalidateCachedResource('profileSettings');
  return response;
}

export async function cancelMobileSubscription() {
  const response = await apiRequest<{ ok: boolean; message: string }>('/user/subscription/cancel', {
    method: 'POST',
  });
  invalidateCachedResource('profileSettings');
  return response;
}
