import { act, create } from 'react-test-renderer';
import { Animated, TouchableOpacity } from 'react-native';
import { WorkoutDetailScreen } from './WorkoutDetailScreen';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import { completeWithQueue, loadWorkoutProgress, clearWorkoutProgress } from '../../store/workoutStore';
import type { WorkoutDayDetail } from '../../types/api';

jest.mock('../../components/WeeklyBodyMap', () => ({ WeeklyBodyMap: () => null }));
jest.mock('../../components/ExerciseVideo', () => ({ ExerciseVideo: () => null }));
jest.mock('../../services/preloadService', () => ({ loadProfileSettingsCached: jest.fn().mockResolvedValue({ profile: {} }), loadWorkoutDayCached: jest.fn() }));
jest.mock('../../services/workoutService', () => ({ getWorkoutVideoOverride: () => '', replaceWorkoutVideo: jest.fn(), resolveWorkoutVideo: jest.fn().mockResolvedValue({ videoUrl: '' }) }));
jest.mock('../../store/workoutStore', () => ({
  loadWorkoutProgress: jest.fn(), saveWorkoutProgress: jest.fn().mockResolvedValue(undefined),
  clearWorkoutProgress: jest.fn().mockResolvedValue(undefined), completeWithQueue: jest.fn().mockResolvedValue({ synced: true }),
}));

const detail: WorkoutDayDetail = {
  planId: 'plan', planDayId: 'day', planTitle: 'Strength', dayNumber: '1', focus: 'Legs', notes: '',
  workoutMode: 'standard', dayComplete: false,
  exercises: [{ exerciseId: 'slot', exerciseName: 'Leg Press', sets: '1', reps: '12', restSec: '0', notes: '', videoUrl: '', order: '1',
    alternatives: [{ exerciseName: 'Goblet Squat', reps: '10–12' }],
  }],
};

const mountedTrees: ReturnType<typeof create>[] = [];

beforeEach(() => {
  jest.mocked(completeWithQueue).mockReset().mockResolvedValue({ synced: true });
});
afterEach(() => {
  act(() => mountedTrees.splice(0).forEach(tree => tree.unmount()));
  jest.restoreAllMocks();
});

async function openSetEntry() {
  jest.mocked(loadWorkoutProgress).mockResolvedValue({ planDayId: 'day', completedExerciseIds: [], updatedAt: '' });
  const navigation = { getParent: () => ({ setOptions: jest.fn(), navigate: jest.fn() }), popToTop: jest.fn(), goBack: jest.fn() };
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<WorkoutDetailScreen {...({ route: { params: { planDayId: 'day', mode: 'standard', initialDetail: detail } }, navigation } as unknown as React.ComponentProps<typeof WorkoutDetailScreen>)} />);
  });
  mountedTrees.push(tree);
  await act(async () => { tree.root.findByType(WorkoutPrimaryCTA).props.onPress(); });
  await act(async () => {
    tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'Complete set')!.props.onPress();
  });
  return tree;
}

it('stops the set celebration when leaving the workout before it finishes', async () => {
  const tree = await openSetEntry();
  const animation: Animated.CompositeAnimation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  const sequence = jest.spyOn(Animated, 'sequence').mockReturnValue(animation);
  await act(async () => {
    await tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'Save set')!.props.onPress();
  });
  expect(sequence).toHaveBeenCalledTimes(1);
  expect(animation.start).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  expect(animation.stop).toHaveBeenCalledTimes(1);
});

it('does not start a celebration when saving resolves after leaving the workout', async () => {
  let resolveSave!: (value: { synced: boolean }) => void;
  jest.mocked(completeWithQueue).mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
  const tree = await openSetEntry();
  const sequence = jest.spyOn(Animated, 'sequence');
  let saving!: Promise<void>;
  await act(async () => {
    saving = tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === 'Save set')!.props.onPress();
  });
  act(() => tree.unmount());
  await act(async () => {
    resolveSave({ synced: true });
    await saving;
  });
  expect(sequence).not.toHaveBeenCalled();
});

it('sends the selected movement and the final logged set on both exercise and finish actions', async () => {
  jest.mocked(loadWorkoutProgress).mockResolvedValue({ planDayId: 'day', completedExerciseIds: [], selectedAlternatesByExercise: { slot: 0 }, updatedAt: '' });
  const navigation = { getParent: () => ({ setOptions: jest.fn(), navigate: jest.fn() }), popToTop: jest.fn(), goBack: jest.fn() };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<WorkoutDetailScreen {...({ route: { params: { planDayId: 'day', mode: 'standard', initialDetail: detail } }, navigation } as unknown as React.ComponentProps<typeof WorkoutDetailScreen>)} />); });
  const entry = () => tree.root.find(node => typeof node.props.onSave === 'function' && node.props.targetReps !== undefined);
  await act(async () => {
    entry().props.onReps('8');
    entry().props.onWeight('24');
  });
  await act(async () => { await entry().props.onSave(); });
  const exercises = [{ exerciseId: 'slot', name: 'Goblet Squat', completed: true, plannedSets: '1', plannedReps: '10–12', sets: [{ setNumber: '1', reps: '8', weight: '24', durationSec: '0' }] }];
  expect(completeWithQueue).toHaveBeenCalledWith(expect.objectContaining({ action: 'exercise', exerciseId: 'slot', exercises }));
  const feedback = tree.root.find(node => typeof node.props.onSelectAlternate === 'function' && node.props.canChangeExercise !== undefined);
  expect(feedback.props.canChangeExercise).toBe(false);
  const finish = tree.root.find(node => typeof node.props.onViewProgress === 'function');
  await act(async () => { await finish.props.onDone(); });
  expect(completeWithQueue).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'day', exercises }));
  expect(clearWorkoutProgress).toHaveBeenCalledWith('day', 'standard');
  act(() => tree.unmount());
});
