import { formatWorkoutTitle, normalizeWorkoutBundle, normalizeWorkoutDetail, normalizeWorkoutPlan } from './workoutTitle';
import { workoutTitle } from './contextualAction';

const cases = [
  ['Full Body Strength + Fat Burn', 'Full Body Strength and Fat Burn'],
  ['Strength+Core & Mobility', 'Strength and Core and Mobility'],
  ['Strength + andd Mobility', 'Strength and Mobility'],
  ['HIIT / Core', 'HIIT and Core'],
  ['Return to Running', 'Return to Running'],
  ['Fitness 50+', 'Fitness 50+'],
  ['+2', '+2'],
];

test.each(cases)('formats the workout heading %s', (input, expected) => {
  expect(formatWorkoutTitle(input)).toBe(expected);
  expect(formatWorkoutTitle(expected)).toBe(expected);
});

test('preserves cached object identity after titles have been normalized', () => {
  const unchanged = { planDayId: 'day1', dayNumber: '1', focus: 'Core Stability', notes: '' };
  const plan = { planId: 'plan1', title: 'Strength', days: [unchanged, { planDayId: 'day2', dayNumber: '2', focus: 'Strength + Mobility', notes: '' }] };
  const bundle = normalizeWorkoutBundle({ plan, today: { plan } });
  expect(bundle.plan).toBe(bundle.today.plan);
  expect(bundle.plan.days[0]).toBe(unchanged);
  expect(bundle.plan.days[1].focus).toBe('Strength and Mobility');
  expect(plan.days[1].focus).toBe('Strength + Mobility');
  expect(normalizeWorkoutBundle(bundle)).toBe(bundle);
  expect(normalizeWorkoutPlan(bundle.plan)).toBe(bundle.plan);
  const detail = { focus: 'Core Stability', planTitle: 'Strength' };
  expect(normalizeWorkoutDetail(detail)).toBe(detail);
});

test('normalizes saved plans, today and session detail consistently with Accountability', () => {
  const day = { planDayId: 'day1', dayNumber: '1', focus: cases[0][0], notes: '3 sets + 2 warm-ups' };
  const plan = { planId: 'plan1', title: 'Strength + Mobility', days: [day] };
  const data = { plan, today: { plan } };
  const normalized = normalizeWorkoutBundle(data);
  expect(normalized.plan.days?.[0].focus).toBe(workoutTitle(day));
  expect(normalized.today.plan?.days?.[0].focus).toBe(cases[0][1]);
  expect(normalized.plan.title).toBe('Strength and Mobility');
  expect(normalized.plan.days?.[0].notes).toBe(day.notes);
  expect(data.plan.days[0].focus).toBe(cases[0][0]);
  expect(normalizeWorkoutDetail({ focus: day.focus, planTitle: plan.title }).focus).toBe(workoutTitle(day));
  expect(workoutTitle()).toBe("Today's workout");
});
