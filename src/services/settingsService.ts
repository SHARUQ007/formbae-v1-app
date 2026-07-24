import { apiRequest } from './apiClient';

export type MobileAccessStatus = {
  tier?: string;
  label?: string;
  badgeLabel?: string;
  detail?: string;
  premiumStartDate?: string;
  premiumEndDate?: string;
  premiumDaysRemaining?: number;
  trainerAccessRemainingWeeks?: number;
  trainerAccessTotalWeeks?: number;
  trainerAccessLabel?: string;
  paywallId?: string;
  planName?: string;
};

export async function fetchSettings() {
  return apiRequest<{
    profile: Record<string, string> | null;
    access: MobileAccessStatus | null;
    notifications: {
      workoutReminders: boolean;
      weeklyCheckInReminders: boolean;
      trainerMessageReminders: boolean;
    };
  }>('/settings');
}

export async function updateSettings(notifications: {
  workoutReminders?: boolean;
  weeklyCheckInReminders?: boolean;
  trainerMessageReminders?: boolean;
}) {
  return apiRequest<{ ok: boolean; notifications: Record<string, boolean> }>('/settings', {
    method: 'PATCH',
    body: notifications,
  });
}

export async function updateProfile(body: Record<string, string>) {
  return apiRequest<{ ok: boolean; profile: Record<string, string> }>('/me/profile', {
    method: 'PATCH',
    body,
  });
}

export async function cancelMobileSubscription() {
  return apiRequest<{ ok: boolean; message: string }>('/user/subscription/cancel', {
    method: 'POST',
  });
}
