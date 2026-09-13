import { StrictMode } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WorkoutHistoryScreen } from './WorkoutHistoryScreen';
import { fetchProgress, fetchTrophyLeaderboard } from '../../services/progressService';
import { loadProgressBundleCached, peekProgressBundleCached } from '../../services/preloadService';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../services/progressService', () => ({ fetchProgress: jest.fn(), fetchTrophyLeaderboard: jest.fn() }));
jest.mock('../../services/preloadService', () => ({
  loadProgressBundleCached: jest.fn(() => require('../../services/progressService').fetchProgress().then((progress: unknown) => ({ progress }))),
  loadTrophyLeaderboardCached: jest.fn(() => require('../../services/progressService').fetchTrophyLeaderboard()),
  peekProgressBundleCached: jest.fn(),
  peekTrophyLeaderboardCached: jest.fn(),
}));

it('shows five recent workouts and expands the full history with the calendar open by default', async () => {
  const history = Array.from({ length: 25 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, planId: 'plan', planDayId: String(index), workoutMode: 'standard' }));
  jest.mocked(fetchProgress).mockResolvedValue({ userId: 'user', adherencePct: 0, completed: 0, planned: 0, currentStreak: 0, bestStreak: 25, completionHistory: history });
  jest.mocked(fetchTrophyLeaderboard).mockResolvedValue({ leaders: [], participantCount: 1 });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkoutHistoryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} />); });
  const list = tree.root.findByType(FlatList);
  expect(list.props.data).toHaveLength(5);
  expect(list.props.data[0][0]).toBe('2026-08-25');
  expect(list.props.data[4][0]).toBe('2026-08-21');
  expect(list.props.showsVerticalScrollIndicator).toBe(false);
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Previous month' }).length).toBeGreaterThan(0);
  const viewAll = tree.root.findAll(node => node.props.accessibilityLabel === 'View all 25 workouts' && typeof node.props.onPress === 'function')[0];
  act(() => viewAll.props.onPress());
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(25);
  expect(tree.root.findByType(FlatList).props.data[24][0]).toBe('2026-08-01');
  expect(tree.root.findAllByProps({ accessibilityLabel: 'View all 25 workouts' })).toHaveLength(0);
  act(() => tree.unmount());
});

it('opens the selected historical workout instead of the current workout plan', async () => {
  const session = {date:'2026-08-25',planId:'archived-plan',planDayId:'old-day',workoutMode:'standard',title:'Lower body strength',muscleGroups:['Quads','Glutes'],exercises:[{exerciseId:'squat',name:'Goblet squat',muscleGroups:['Quads'],sets:[]}]};
  jest.mocked(fetchProgress).mockResolvedValue({userId:'user',adherencePct:100,completed:1,planned:1,currentStreak:1,bestStreak:1,completionHistory:[session]});
  jest.mocked(fetchTrophyLeaderboard).mockResolvedValue({leaders:[],participantCount:1});
  const navigate=jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async()=>{tree=create(<WorkoutHistoryScreen navigation={{goBack:jest.fn(),navigate} as never} route={{key:'history',name:'WorkoutHistory'}} />);});
  const button=tree.root.findAll(node=>node.props.accessibilityLabel==='View Lower body strength, 2026-08-25' && typeof node.props.onPress==='function')[0];
  act(()=>button.props.onPress());
  expect(navigate).toHaveBeenCalledWith('WorkoutHistoryDetail',{session});
  act(()=>tree.unmount());
});

it('keeps loaded history and calendar state through refresh failure without hook warnings', async () => {
  const logged = { date: '2026-08-25', planId: 'old', planDayId: 'lower', workoutMode: 'standard', title: 'Lower body' };
  const progress = { userId: 'user', adherencePct: 100, completed: 1, planned: 1, currentStreak: 1, bestStreak: 1, completionHistory: [logged] };
  let resolve!: (value: typeof progress) => void;
  jest.mocked(fetchProgress).mockReturnValue(new Promise(done => { resolve = done; }));
  jest.mocked(fetchTrophyLeaderboard).mockResolvedValue({ leaders: [], participantCount: 1 });
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<StrictMode><WorkoutHistoryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} /></StrictMode>); });
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(0);
    await act(async () => resolve(progress));
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Hide calendar' }).length).toBeGreaterThan(0);
    jest.mocked(fetchProgress).mockRejectedValue(new Error('Offline'));
    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    expect(loadProgressBundleCached).toHaveBeenLastCalledWith({ force: true });
    expect(tree.root.findByType(FlatList).props.data[0][1]).toEqual([logged]);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Hide calendar').length).toBeGreaterThan(0);
    expect(errors.mock.calls.filter(args => /static flag|order of Hooks|Rendered (more|fewer) hooks/i.test(args.join(' ')))).toEqual([]);
  } finally {
    if (tree) act(() => tree.unmount());
    errors.mockRestore();
  }
});

it('shows workouts while optional leaderboard data is still pending', async () => {
  jest.mocked(fetchProgress).mockResolvedValue({ userId: 'user', adherencePct: 100, completed: 1, planned: 1, currentStreak: 1, bestStreak: 1, completionHistory: [{ date: '2026-08-25', planId: 'old', planDayId: 'lower', workoutMode: 'standard', title: 'Lower body' }] });
  jest.mocked(fetchTrophyLeaderboard).mockReturnValue(new Promise(() => {}));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkoutHistoryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} />); });
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(1);
  expect(tree.root.findByType(RefreshControl).props.refreshing).toBe(false);
  act(() => tree.unmount());
});

it('renders warm history immediately while refreshing in the background', async () => {
  const progress = { userId: 'user', adherencePct: 100, completed: 1, planned: 1, currentStreak: 1, bestStreak: 1, completionHistory: [{ date: '2026-08-25', planId: 'old', planDayId: 'lower', workoutMode: 'standard', title: 'Lower body' }] };
  jest.mocked(peekProgressBundleCached).mockReturnValue({ progress, checkIns: [], dueThisWeek: [], planDays: [], gender: '', userName: '' });
  jest.mocked(fetchProgress).mockReturnValue(new Promise(() => {}));
  jest.mocked(fetchTrophyLeaderboard).mockReturnValue(new Promise(() => {}));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<WorkoutHistoryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} />); });
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(1);
    expect(tree.root.findByType(RefreshControl).props.refreshing).toBe(false);
  } finally {
    act(() => tree.unmount());
    jest.mocked(peekProgressBundleCached).mockReset();
  }
});


it('limits sessions rather than dates and keeps the calendar’s complete history', async () => {
  const history = Array.from({ length: 7 }, (_, index) => ({ date: index < 6 ? '2026-08-25' : '2026-08-01', planId: 'old', planDayId: String(index), workoutMode: 'standard', title: `Workout ${index}` }));
  jest.mocked(fetchProgress).mockResolvedValue({ userId: 'user', adherencePct: 100, completed: 7, planned: 7, currentStreak: 1, bestStreak: 1, completionHistory: history });
  jest.mocked(fetchTrophyLeaderboard).mockResolvedValue({ leaders: [], participantCount: 1 });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkoutHistoryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} />); });
  const groups = tree.root.findByType(FlatList).props.data;
  expect(groups).toHaveLength(1);
  expect(groups[0][1]).toHaveLength(5);
  expect(tree.root.findAllByProps({ accessibilityLabel: '2026-08-01, workout completed' }).length).toBeGreaterThan(0);
  const viewAll = tree.root.findAll(node => node.props.accessibilityLabel === 'View all 7 workouts' && typeof node.props.onPress === 'function')[0];
  act(() => viewAll.props.onPress());
  expect(tree.root.findByType(FlatList).props.data[0][1]).toHaveLength(6);
  expect(tree.root.findByType(FlatList).props.data[1][1]).toHaveLength(1);
  act(() => tree.unmount());
});
