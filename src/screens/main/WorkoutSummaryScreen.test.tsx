import { ScrollView, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WorkoutSummaryScreen } from './WorkoutSummaryScreen';
import { WorkoutScreenHeader } from '../../features/workout/components/WorkoutScreenHeader';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import type { WorkoutDayDetail } from '../../types/api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => () => void) => require('react').useEffect(effect, [effect]) }));
jest.mock('../../hooks/useProfileBodyGender', () => ({ useProfileBodyGender: () => 'neutral' }));
jest.mock('../../hooks/useDailyReadingDate', () => ({ useDailyReadingDate: () => '2026-09-10' }));
jest.mock('../../components/WeeklyBodyMap', () => ({ WeeklyBodyMap: () => null }));
jest.mock('../../store/workoutStore', () => ({ ...jest.requireActual('../../store/workoutStore'), loadWorkoutProgress: jest.fn().mockResolvedValue({ completedExerciseIds: [], activeExerciseId: 'leg-press' }) }));

const detail: WorkoutDayDetail = {
  planId: 'plan', planDayId: 'day-one', planTitle: 'Strength', dayNumber: '1', focus: 'Full Body Strength', workoutMode: 'standard', dayComplete: false,
  notes: `WorkoutSummary: ${JSON.stringify({ muscles: ['Quads', 'Glutes', 'Chest'], benefits: ['Train multiple muscle groups', 'Build a steady routine'], calories: '280–380 kcal', muscleGain: 'Strength', duration: '40–50 min', intensity: 'Moderate', overview: 'A full body session' })}`,
  exercises: [{ exerciseId: 'leg-press', exerciseName: 'Leg Press', sets: '3', reps: '10–12', restSec: '60', notes: '', videoUrl: '', order: '1' }],
};

it('moves the day into the overview and keeps the resume action outside the scrolling content', async () => {
  const navigate = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<WorkoutSummaryScreen {...({ route: { params: { planDayId: detail.planDayId, mode: 'standard', initialDetail: detail } }, navigation: { navigate, goBack: jest.fn(), getParent: () => ({ setOptions: jest.fn() }) } } as unknown as React.ComponentProps<typeof WorkoutSummaryScreen>)} />); });
  expect(tree.root.findByType(WorkoutScreenHeader).props.subtitle).toBeUndefined();
  expect(tree.root.findAllByType(Text).some(node => [node.props.children].flat().join('') === 'DAY 1')).toBe(true);
  expect(tree.root.findAllByType(Text).filter(node => node.props.children === detail.focus)).toHaveLength(1);
  const cta = tree.root.findByType(WorkoutPrimaryCTA);
  expect(cta.props.title).toBe('Continue workout');
  let parent = cta.parent;
  while (parent) { expect(parent.type).not.toBe(ScrollView); parent = parent.parent; }
  act(() => cta.props.onPress());
  expect(navigate).toHaveBeenCalledWith('WorkoutDetail', { planDayId: detail.planDayId, title: detail.focus, mode: 'standard', initialDetail: detail });
  act(() => tree.unmount());
});
