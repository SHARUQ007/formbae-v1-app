import { Platform } from 'react-native';
import { compareAppVersions, requiredAppUpdate, type AppVersionPolicy } from './appUpdateService';

const policy: AppVersionPolicy = {
  platforms: {
    ios: { minimumSupportedVersion: '1.2.0', updateUrl: 'https://apps.apple.com/formbae' },
    android: { minimumSupportedVersion: '1.3.0', updateUrl: 'https://play.google.com/formbae' },
  },
  title: 'Update FormBae',
  message: 'A required update is ready.',
  updatedAt: '',
};

it('compares semantic versions numerically', () => {
  expect(compareAppVersions('1.10.0', '1.9.9')).toBe(1);
  expect(compareAppVersions('1.2', '1.2.0')).toBe(0);
  expect(compareAppVersions('1.1.9', '1.2.0')).toBe(-1);
});

it('requires only versions below the configured platform minimum', () => {
  const original = Platform.OS;
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    expect(requiredAppUpdate(policy, '1.2.9')).toEqual(expect.objectContaining({ minimumVersion: '1.3.0' }));
    expect(requiredAppUpdate(policy, '1.3.0')).toBeNull();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
  }
});
