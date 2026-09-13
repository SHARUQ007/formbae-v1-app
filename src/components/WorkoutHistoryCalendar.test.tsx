import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { WorkoutHistoryCalendar } from './WorkoutHistoryCalendar';

const history = [
  { date: '2026-08-07', planId: 'old', planDayId: 'upper', workoutMode: 'standard', title: 'Upper body' },
  { date: '2026-08-25', planId: 'old', planDayId: 'lower', workoutMode: 'standard', title: 'Lower body' },
  { date: '2026-08-25', planId: 'old', planDayId: 'core', workoutMode: 'quick', title: 'Core session' },
];
const press = (tree: ReturnType<typeof create>, label: string) => {
  const target = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  act(() => target.props.onPress());
};
const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity).filter(child => typeof child === 'string')).join(' ');

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-12T12:00:00')); });
afterEach(() => { jest.useRealTimers(); });

it('opens at the latest workout month with seven aligned columns and every selected-day session', () => {
  const onOpenSession = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkoutHistoryCalendar history={history} onOpenSession={onOpenSession} />); });
  expect(text(tree)).toContain('August 2026');
  const weeks = tree.root.findAll(node => node.props.testID === 'history-calendar-week' && Array.isArray(node.props.children));
  expect(weeks.length).toBeGreaterThan(0);
  weeks.forEach(week => expect(week.props.children).toHaveLength(7));
  expect(text(tree)).toContain('Lower body');
  expect(text(tree)).toContain('Core session');
  press(tree, 'View Core session');
  expect(onOpenSession).toHaveBeenCalledWith(history[2]);
  press(tree, '2026-08-07, workout completed');
  expect(text(tree)).toContain('Upper body');
  press(tree, 'Hide calendar');
  press(tree, 'Show calendar');
  expect(tree.root.findAll(node => node.props.accessibilityLabel === '2026-08-07, workout completed' && node.props.accessibilityState?.selected).length).toBeGreaterThan(0);
  act(() => tree.unmount());
});

it('bounds navigation to recorded months through today and disables future dates', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkoutHistoryCalendar history={history} onOpenSession={jest.fn()} />); });
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Previous month' && node.props.disabled).length).toBeGreaterThan(0);
  press(tree, 'Next month');
  expect(text(tree)).toContain('September 2026');
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Next month' && node.props.disabled).length).toBeGreaterThan(0);
  expect(tree.root.findAll(node => node.props.accessibilityLabel === '2026-09-13, no workout recorded' && node.props.disabled).length).toBeGreaterThan(0);
  press(tree, '2026-09-12, no workout recorded, today');
  expect(text(tree)).toContain('No session recorded');
  act(() => tree.unmount());
});

it('allows an empty history to open on the current month', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkoutHistoryCalendar history={[]} onOpenSession={jest.fn()} />); });
  expect(text(tree)).toContain('September 2026');
  expect(text(tree)).toContain('No session recorded');
  act(() => tree.unmount());
});
