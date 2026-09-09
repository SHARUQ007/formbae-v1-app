import { act, create } from 'react-test-renderer';
import { hasWorkoutStarted, loadWorkoutProgress, type WorkoutProgress } from '../store/workoutStore';
import { useWorkoutStarted } from './useWorkoutStarted';

let mockFocus = 0;
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => () => void) => require('react').useEffect(effect, [effect, mockFocus]) }));
jest.mock('../store/workoutStore', () => ({ ...jest.requireActual('../store/workoutStore'), loadWorkoutProgress: jest.fn() }));
const load = jest.mocked(loadWorkoutProgress);
const fresh: WorkoutProgress = { planDayId: 'one', completedExerciseIds: [], updatedAt: '' };
let started = false;
function Harness({ day }: { day: string }) { started = useWorkoutStarted(day); return null; }
beforeEach(() => { load.mockReset(); mockFocus = 0; });

it('distinguishes an untouched workout from started sets, logged sets, and rest', () => {
  expect(hasWorkoutStarted(fresh)).toBe(false);
  expect(hasWorkoutStarted({ ...fresh, updatedAt: '2026-09-10', selectedAlternatesByExercise: { chest: 1 }, setProgressByExercise: { chest: 0 } })).toBe(false);
  expect(hasWorkoutStarted({ ...fresh, activeExerciseId: 'chest' })).toBe(true);
  expect(hasWorkoutStarted({ ...fresh, setProgressByExercise: { chest: 1 } })).toBe(true);
  expect(hasWorkoutStarted({ ...fresh, completedExerciseIds: ['chest'] })).toBe(true);
  expect(hasWorkoutStarted({ ...fresh, rest: { nextExerciseId: 'chest', startedAt: 1000, durationSec: 60 } })).toBe(true);
});

it('refreshes started status on return and keeps it separate for each workout', async () => {
  load.mockResolvedValueOnce(fresh);
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<Harness day="one" />); });
  expect(started).toBe(false);
  load.mockResolvedValueOnce({ ...fresh, activeExerciseId: 'chest' });
  mockFocus += 1;
  await act(() => tree.update(<Harness day="one" />));
  expect(started).toBe(true);
  load.mockResolvedValueOnce({ ...fresh, planDayId: 'two' });
  await act(() => tree.update(<Harness day="two" />));
  expect(started).toBe(false);
  act(() => tree.unmount());
});

it('ignores a delayed result after switching to a different workout', async () => {
  let finish!: (progress: WorkoutProgress) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness day="one" />); });
  load.mockResolvedValueOnce({ ...fresh, planDayId: 'two' });
  await act(() => tree.update(<Harness day="two" />));
  await act(() => finish({ ...fresh, activeExerciseId: 'chest' }));
  expect(started).toBe(false);
  act(() => tree.unmount());
});
