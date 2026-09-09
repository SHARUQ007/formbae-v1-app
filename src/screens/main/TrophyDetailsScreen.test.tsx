import React from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TrophyDetailsScreen } from './TrophyDetailsScreen';
import { loadProgressBundleCached, loadTrophyLeaderboardCached } from '../../services/preloadService';
import { TrophyInfoSheet } from '../../components/TrophyInfoSheet';

jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 90 }));
jest.mock('../../services/preloadService', () => ({ loadProgressBundleCached: jest.fn(), loadTrophyLeaderboardCached: jest.fn(), peekProgressBundleCached: jest.fn(), peekTrophyLeaderboardCached: jest.fn() }));
jest.mock('../../services/trophyRealtime', () => ({ subscribeToTrophySummary: () => () => {} }));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Alex Morgan' } }) }));
const navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn() };
const score = { score: 132, safeZone: 125, nextMilestone: 150, pointsToNext: 18 };
const current = { rank: 8, displayName: '9999999999', score: 132, isCurrentUser: true };
let tree: ReactTestRenderer;
const text = () => tree.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
async function render() {
  await act(() => { tree = create(<TrophyDetailsScreen navigation={navigation as never} route={{ params: {} } as never} />); });
}
beforeEach(() => {
  jest.mocked(loadProgressBundleCached).mockReset().mockResolvedValue({ progress: { trophies: score } } as never);
  jest.mocked(loadTrophyLeaderboardCached).mockReset().mockResolvedValue({
    leaders: [{ rank: 1, displayName: 'Priya', score: 200, isCurrentUser: false }], currentUser: current, participantCount: 12,
  });
});
afterEach(async () => { await act(() => tree?.unmount()); });

it('shows your actual position outside the leading group and retains the trophy explanation', async () => {
  await render();
  expect(text()).toContain('#8');
  expect(text()).toContain('12 members');
  expect(text()).toContain('Alex Morgan');
  expect(text()).not.toContain('9999999999');
  expect(tree.root.findByProps({ accessibilityLabel: 'Rank 8. Alex Morgan. You. 132 trophies' })).toBeTruthy();
  await act(() => tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'How trophies work')!.props.onPress());
  expect(tree.root.findByType(TrophyInfoSheet).props.visible).toBe(true);
});

it('keeps the real trophy score without inventing a rank when the leaderboard is unavailable, then retries', async () => {
  jest.mocked(loadTrophyLeaderboardCached).mockRejectedValueOnce(new Error('Offline'));
  await render();
  expect(text()).toContain('132');
  expect(text()).toContain('Rankings unavailable');
  expect(text()).not.toContain('#1');
  expect(text()).not.toContain('1 member');
  await act(() => tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'Retry leaderboard')!.props.onPress());
  expect(text()).toContain('#8');
  expect(text()).toContain('12 members');
});

it('keeps a solo member in the ranking table and pins Join and Invite outside the scrolling content', async () => {
  const solo = { ...current, rank: 1 };
  jest.mocked(loadTrophyLeaderboardCached).mockResolvedValueOnce({ leaders: [solo], currentUser: solo, participantCount: 1 });
  await render();
  expect(text()).toContain('Alex Morgan');
  expect(text()).toContain('132');
  expect(text()).toContain('RANK MEMBER TROPHIES');
  expect(text()).toContain('1 member');
  expect(tree.root.findByProps({ accessibilityLabel: 'Rank 1. Alex Morgan. You. 132 trophies' })).toBeTruthy();
  expect(text()).toContain('#1');
  const content = tree.root.findAllByType(ScrollView)[0];
  const scrollingActions = content.findAllByType(TouchableOpacity);
  expect(scrollingActions.some(node => ['Invite friends', 'Join leaderboard with a code'].includes(node.props.accessibilityLabel))).toBe(false);
  const actions = tree.root.findAllByType(TouchableOpacity);
  expect(actions.filter(node => node.props.accessibilityLabel === 'Invite friends')).toHaveLength(1);
  expect(actions.filter(node => ['Invite friends', 'Join leaderboard with a code'].includes(node.props.accessibilityLabel)).map(node => node.props.accessibilityLabel)).toEqual(['Join leaderboard with a code', 'Invite friends']);
  const join = actions.find(node => node.props.accessibilityLabel === 'Join leaderboard with a code')!;
  await act(() => join.props.onPress());
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible && node.findAllByType(TextInput).length === 1)).toBe(true);
});
