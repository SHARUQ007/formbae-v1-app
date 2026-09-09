import { ScrollView, TouchableOpacity, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WeeklyReportPending } from './WeeklyReportPending';

const defaults = {
  workouts: 0, workoutTarget: 3, meals: 10, mealTarget: 12,
  generating: false, queued: false, nextInDays: 2, bottomInset: 34,
  onWorkout: jest.fn(), onMeal: jest.fn(), onRankings: jest.fn(),
};

it('keeps workout, meal and rankings actions available alongside contextual illustrations', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<WeeklyReportPending {...defaults} />); });
  const buttons = tree.root.findAllByType(TouchableOpacity);
  act(() => buttons.forEach(button => button.props.onPress()));
  expect(defaults.onWorkout).toHaveBeenCalledTimes(1);
  expect(defaults.onMeal).toHaveBeenCalledTimes(1);
  expect(defaults.onRankings).toHaveBeenCalledTimes(1);
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('67% logged');
  expect(output).toContain('weekly-goal-artwork-training');
  expect(output).toContain('weekly-goal-artwork-nutrition');
  expect(output).toContain('weekly-pending-artwork');
  act(() => tree.unmount());
});

it('only enables contained scrolling when content exceeds the available viewport', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<WeeklyReportPending {...defaults} />); });
  const viewport = tree.root.findAllByType(View).find(node => node.props.testID === 'weekly-report-pending')!;
  const scroll = () => tree.root.findByType(ScrollView);
  act(() => {
    viewport.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
    scroll().props.onContentSizeChange(380, 700);
  });
  expect(scroll().props.scrollEnabled).toBe(false);
  act(() => scroll().props.onContentSizeChange(380, 900));
  expect(scroll().props.scrollEnabled).toBe(true);
  act(() => viewport.props.onLayout({ nativeEvent: { layout: { height: 950 } } }));
  expect(scroll().props.scrollEnabled).toBe(false);
  act(() => tree.unmount());
});

it('handles workout-only reports and background generation without prompting completed tasks', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<WeeklyReportPending {...defaults} workouts={3} mealTarget={0} generating />); });
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('Preparing');
  expect(output).toContain('Your report is on its way');
  expect(output).not.toContain('Meal logs');
  expect(tree.root.findAllByType(TouchableOpacity)[0].props.disabled).toBe(true);
  act(() => tree.unmount());
});
