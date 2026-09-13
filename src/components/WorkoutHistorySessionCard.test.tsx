import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { StableImage } from './StableImage';
import { WorkoutHistoryArtwork } from './WorkoutHistoryArtwork';
import { WorkoutHistorySessionCard } from './WorkoutHistorySessionCard';
import type { WorkoutHistoryEntry } from '../types/api';

const session: WorkoutHistoryEntry = {
  date: '2026-08-25', planId: 'archived', planDayId: 'leg-day', workoutMode: 'standard', title: 'Lower body strength', detailsSource: 'snapshot',
  muscleGroups: ['Quads', 'Glutes'],
  exercises: [{ exerciseId: 'squat', name: 'Goblet squat', muscleGroups: ['Quads'], completed: true, plannedSets: '4', plannedReps: '12', sets: [{ setNumber: '1', reps: '8', weight: '20' }] }],
};
const content = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join('')).join(' ');

it('shows archived workout details and only counts recorded sets on the card', () => {
  const onOpen = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkoutHistorySessionCard session={session} onOpen={onOpen} />); });
  expect(content(tree)).toContain('Goblet squat');
  expect(content(tree)).toContain('Quads · Glutes');
  expect(content(tree)).toContain('1 exercise · 1 logged set');
  expect(content(tree)).not.toContain('4 logged sets');
  expect(tree.root.findAllByType(StableImage)).toHaveLength(1);
  const button = tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
  act(() => button.props.onPress());
  expect(onOpen).toHaveBeenCalledWith(session);
  act(() => tree.unmount());
});

it('falls back to a local SVG after an artwork error without losing the session', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkoutHistorySessionCard session={session} onOpen={jest.fn()} />); });
  act(() => tree.root.findByType(StableImage).props.onError());
  expect(tree.root.findAllByType(StableImage)).toHaveLength(0);
  expect(tree.root.findAllByType(WorkoutHistoryArtwork)).toHaveLength(1);
  expect(content(tree)).toContain('Lower body strength');
  act(() => tree.unmount());
});
