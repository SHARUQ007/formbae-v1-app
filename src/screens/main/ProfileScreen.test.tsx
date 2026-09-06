import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ProfileScreen } from './ProfileScreen';

jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 80 }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../../hooks/useAsync', () => ({
  useAsync: () => ({
    data: {
      user: { name: 'Sam', mobile: '9999999999' },
      profile: { lifestyleJson: JSON.stringify({ workoutSetting: 'home' }) },
      access: { tier: 'premium', label: 'Active', premiumStartDate: '2026-06-12', premiumEndDate: '2026-10-30' },
      notifications: { workoutReminders: true, weeklyCheckInReminders: true, trainerMessageReminders: true },
    },
    loading: false,
    error: '',
    reload: jest.fn(),
    refresh: jest.fn(),
    refreshing: false,
  }),
}));
jest.mock('../../services/appCache', () => ({ peekCachedResource: () => undefined }));
jest.mock('../../services/notificationService', () => ({ syncReminders: jest.fn() }));
jest.mock('../../services/preloadService', () => ({
  CACHE_KEYS: { profileSettings: 'profileSettings' },
  loadProfileSettingsCached: jest.fn(),
}));
jest.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ logout: jest.fn(), status: { hasPaid: true, name: 'Sam' } }),
}));

describe('Profile subscription disclosure', () => {
  it('keeps management details collapsed until the user expands them', () => {
    const navigation = { navigate: jest.fn(), getParent: jest.fn() };
    let tree: ReturnType<typeof create>;

    act(() => {
      tree = create(<ProfileScreen navigation={navigation as never} route={{ key: 'Profile', name: 'ProfileMain' }} />);
    });

    const bodyArtwork = tree!.root.findByProps({ testID: 'body-profile-artwork' });
    const planArtwork = tree!.root.findByProps({ testID: 'plan-profile-artwork' });
    expect(bodyArtwork.props.source).not.toEqual(planArtwork.props.source);
    expect(StyleSheet.flatten(bodyArtwork.props.style)).toEqual(expect.objectContaining({ width: '100%', height: '100%' }));
    expect(StyleSheet.flatten(planArtwork.props.style)).toEqual(expect.objectContaining({ width: '100%', height: '100%' }));

    expect(tree!.root.findAllByProps({ children: 'Cancel subscription' })).toHaveLength(0);

    act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'Manage subscription' }).props.onPress();
    });

    expect(tree!.root.findAllByProps({ children: 'Cancel subscription' }).length).toBeGreaterThan(0);
  });
});
