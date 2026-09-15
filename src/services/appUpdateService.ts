import Config from 'react-native-config';
import { Platform } from 'react-native';
import { apiRequest } from './apiClient';

export type AppVersionPolicy = {
  platforms: Record<'ios' | 'android', { minimumSupportedVersion: string; updateUrl: string }>;
  title: string;
  message: string;
  updatedAt: string;
  /** Whether sign-in must prove the number. Read to choose a screen, never as permission. */
  otp?: { enabled: boolean };
};

export type RequiredAppUpdate = {
  currentVersion: string;
  minimumVersion: string;
  updateUrl: string;
  title: string;
  message: string;
};

// Keep these values aligned with MARKETING_VERSION and versionName for each store build.
export const CURRENT_APP_VERSION = Platform.select({
  ios: Config.IOS_APP_VERSION,
  android: Config.ANDROID_APP_VERSION,
}) || Config.APP_VERSION || '1.0.0';

export function compareAppVersions(left: string, right: string) {
  const parts = (value: string) => value.split('.').map(part => Number.parseInt(part, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

export async function fetchAppVersionPolicy() {
  return apiRequest<AppVersionPolicy>('/app/version-policy');
}

export function requiredAppUpdate(policy: AppVersionPolicy, currentVersion = CURRENT_APP_VERSION): RequiredAppUpdate | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const platform = policy.platforms[Platform.OS];
  if (!platform || compareAppVersions(currentVersion, platform.minimumSupportedVersion) >= 0) return null;
  return {
    currentVersion,
    minimumVersion: platform.minimumSupportedVersion,
    updateUrl: platform.updateUrl,
    title: policy.title,
    message: policy.message,
  };
}

/**
 * Whether to take the trainee through verification.
 *
 * Only ever decides which screen to show. The backend reads the same setting and judges
 * every sign-in itself, so a tampered app that skips verification is refused there - which
 * is why defaulting to false when the policy cannot be read costs nothing: the sign-in that
 * follows is rejected if verification was in fact required.
 */
export function otpRequired(policy: AppVersionPolicy | null): boolean {
  return Boolean(policy?.otp?.enabled);
}
