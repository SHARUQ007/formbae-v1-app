import React from 'react';
import { RefreshControl, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ProfileScreen } from './ProfileScreen';
import { loadProfileSettingsCached } from '../../services/preloadService';

const mockCached = {
  user: { name: 'Sam', mobile: '9999999999' },
  profile: { lifestyleJson: JSON.stringify({ workoutSetting: 'home' }) },
  access: { tier: 'premium', label: 'Active', premiumStartDate: '2026-06-12', premiumEndDate: '2026-10-30' },
  notifications: { workoutReminders: true, weeklyCheckInReminders: true, trainerMessageReminders: true },
};
let mockFocus: () => void;
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 80 }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void) => {
  mockFocus = callback;
  require('react').useEffect(callback, [callback]);
} }));
jest.mock('../../services/appCache', () => ({ peekCachedResource: () => mockCached }));
jest.mock('../../services/notificationService', () => ({ syncReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/preloadService', () => ({ CACHE_KEYS: { profileSettings: 'profileSettings' }, loadProfileSettingsCached: jest.fn() }));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ logout: jest.fn(), status: { hasPaid: true, name: 'Sam' } }) }));

it('keeps the cached layout stable during first load and tab-focus revalidation', async () => {
  let finish!: (value: typeof mockCached) => void;
  jest.mocked(loadProfileSettingsCached).mockImplementation(() => new Promise(resolve => { finish = resolve; }) as never);
  let tree!: ReactTestRenderer;
  await act(() => { tree = create(<ProfileScreen navigation={{ navigate: jest.fn(), getParent: jest.fn() } as never} route={{ key: 'Profile', name: 'ProfileMain' }} />); });
  const copy = () => tree.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
  const initial = copy();
  expect(initial).toContain('Sam');
  expect(initial).not.toContain('Refreshing latest details');
  expect(initial).not.toContain('Loading your profile');
  const card = tree.root.findByProps({ testID: 'profile-summary-card' });
  await act(() => finish(mockCached));
  expect(copy()).toBe(initial);
  await act(() => mockFocus());
  expect(loadProfileSettingsCached).toHaveBeenCalledTimes(2);
  expect(tree.root.findByType(RefreshControl).props.refreshing).toBe(false);
  expect(tree.root.findByProps({ testID: 'profile-summary-card' })).toBe(card);
  expect(copy()).toBe(initial);
  await act(() => finish(mockCached));
  expect(copy()).toBe(initial);
  await act(() => tree.unmount());
});
