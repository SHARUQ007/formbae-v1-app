import { StrictMode } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WorkoutHistoryScreen } from './WorkoutHistoryScreen';
import { fetchProgress, fetchTrophyLeaderboard } from '../../services/progressService';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../services/progressService', () => ({ fetchProgress: jest.fn(), fetchTrophyLeaderboard: jest.fn() }));

it('exposes every saved date newest first while keeping the calendar optional', async () => {
  const history = Array.from({ length: 25 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, planId: 'plan', planDayId: String(index), workoutMode: 'standard' }));
  jest.mocked(fetchProgress).mockResolvedValue({ userId: 'user', adherencePct: 0, completed: 0, planned: 0, currentStreak: 0, bestStreak: 25, completionHistory: history });
  jest.mocked(fetchTrophyLeaderboard).mockResolvedValue({ leaders: [], participantCount: 1 });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkoutHistoryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'history', name: 'WorkoutHistory' }} />); });
  const list = tree.root.findByType(FlatList);
  expect(list.props.data).toHaveLength(25);
  expect(list.props.data[0][0]).toBe('2026-08-25');
  expect(list.props.data[24][0]).toBe('2026-08-01');
  expect(list.props.showsVerticalScrollIndicator).toBe(false);
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Previous month' })).toHaveLength(0);
  const toggle = tree.root.findAll(node => node.props.accessibilityState?.expanded === false && typeof node.props.onPress === 'function')[0];
  await act(async () => toggle.props.onPress());
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Previous month' }).length).toBeGreaterThan(0);
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
    const show = tree.root.findAll(node => node.props.accessibilityLabel === 'Show calendar' && typeof node.props.onPress === 'function')[0];
    act(() => show.props.onPress());
    jest.mocked(fetchProgress).mockRejectedValue(new Error('Offline'));
    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    expect(tree.root.findByType(FlatList).props.data[0][1]).toEqual([logged]);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Hide calendar').length).toBeGreaterThan(0);
    expect(errors.mock.calls.filter(args => /static flag|order of Hooks|Rendered (more|fewer) hooks/i.test(args.join(' ')))).toEqual([]);
  } finally {
    if (tree) act(() => tree.unmount());
    errors.mockRestore();
  }
});
