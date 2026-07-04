import { apiRequest } from './apiClient';

export async function fetchSettings() {
  return apiRequest<{
    profile: Record<string, string> | null;
    access: Record<string, unknown> | null;
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
