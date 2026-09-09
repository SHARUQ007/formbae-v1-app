import { act, create } from 'react-test-renderer';
import { WeeklyScoreCard } from './WeeklyScoreCard';
import { buildWeeklyScorecard } from '../utils/weeklyReport';

const criteria = buildWeeklyScorecard({ reportStats: {
  workoutsCompleted: 0, workoutsPlanned: 5, standardWorkoutsCompleted: 0, adherencePct: 0,
  currentStreak: 0, mealsLogged: 10, dietDaysLogged: 5, describedDaysLogged: 5,
  workoutFeedbackCount: 0, ratedSessionCount: 0, checkInCount: 0, bodyLogCount: 0,
} });
let tree: ReturnType<typeof create>;
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });

it('keeps a measured zero distinct from an unavailable score', () => {
  act(() => { tree = create(<WeeklyScoreCard criterion={criteria[0]} reportKey="week" />); });
  expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(0);
  act(() => tree.update(<WeeklyScoreCard criterion={criteria[2]} reportKey="week" />));
  expect(tree.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Not available');
  expect(JSON.stringify(tree.toJSON())).toContain('No completed sessions to rate in this period.');
});

it('reveals the calculation and interpretation on request, then collapses them', () => {
  act(() => { tree = create(<WeeklyScoreCard criterion={criteria[1]} reportKey="week" />); });
  const toggle = () => tree.root.findByProps({ accessibilityLabel: "How it's calculated: Food diary detail" });
  expect(toggle().props.accessibilityState.expanded).toBe(false);
  expect(JSON.stringify(tree.toJSON())).not.toContain(criteria[1].calculation);
  act(() => toggle().props.onPress());
  expect(toggle().props.accessibilityState.expanded).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain(criteria[1].calculation);
  expect(JSON.stringify(tree.toJSON())).toContain('This is evidence coverage, not a diet-quality score.');
  expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(71);
  act(() => toggle().props.onPress());
  expect(JSON.stringify(tree.toJSON())).not.toContain(criteria[1].calculation);
});
