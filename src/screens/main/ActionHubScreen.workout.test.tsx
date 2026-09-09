import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActionHubScreen } from './ActionHubScreen';
import type { DietDiaryEntry } from '../../store/dietDiaryStore';

const mockDay = { planDayId: 'day-2', focus: 'Full Body Strength', dayNumber: 2, completed: false, exercises: [] };
let mockDays = [mockDay];
let mockActive = true;
let mockEntries: DietDiaryEntry[] = [];
beforeEach(() => { mockEntries = []; });

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../components/DailyReadingRoom', () => ({ DailyReadingRoom: () => null }));
jest.mock('../../services/trophyRealtime', () => ({ subscribeToTrophySummary: () => () => {} }));
jest.mock('../../services/preloadService', () => ({ peekProgressBundleCached: () => null }));
jest.mock('../../services/accountabilityService', () => ({
  peekAccountability: () => ({ today: mockActive ? { status: 'active', targetKind: 'workout', targetId: 'day-2', title: 'Full Body Strength' } : { status: 'completed' } }),
  peekAccountabilityBae: () => null,
}));
jest.mock('../../utils/contextualAction', () => ({
  ...jest.requireActual('../../utils/contextualAction'),
  peekContextualSnapshot: () => ({ target: { kind: 'workout', day: mockDay }, workoutData: { plan: { days: mockDays } }, dietEntries: mockEntries }),
}));

it.each(['continue', 'uncached day', 'start'])('opens the main Workout tab from My day: %s', scenario => {
  mockDays = scenario === 'uncached day' ? [] : [mockDay];
  mockActive = scenario !== 'start';
  const navigate = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ActionHubScreen {...({ navigation: { navigate } } as unknown as React.ComponentProps<typeof ActionHubScreen>)} />); });
  const action = scenario === 'start' ? 'Start' : 'Continue';
  const card = tree.root.findAll(node => node.props.accessibilityRole === 'button'
    && String(node.props.accessibilityLabel).startsWith('Full Body Strength.')
    && String(node.props.accessibilityLabel).endsWith(action))[0];
  expect(card).toBeDefined();
  act(() => { card.props.onPress(); });
  expect(navigate).toHaveBeenCalledWith('Workouts', {
    screen: 'WorkoutList',
  });
  act(() => tree.unmount());
});

it.each([4, 23])('offers food alongside an active workout at %s:17 and opens the logger directly', async hour => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, hour, 17));
  mockActive = true;
  mockDays = [mockDay];
  mockEntries = [{ id: 'yesterday', mealType: 'Lunch', createdAt: new Date(2026, 8, 9, 13).toISOString(), storedLocally: true }];
  const navigate = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<ActionHubScreen {...({ navigation: { navigate } } as unknown as React.ComponentProps<typeof ActionHubScreen>)} />); });
  const card = tree.root.findAll(node => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith('Log food.'))[0];
  expect(card).toBeDefined();
  await act(() => card.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Diet', { action: 'log', requestId: expect.any(Number), mealType: hour === 4 ? 'Breakfast' : 'Dinner' });
  act(() => tree.unmount());
  jest.useRealTimers();
});
