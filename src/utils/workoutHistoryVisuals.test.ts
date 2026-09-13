import type { WorkoutHistoryEntry } from '../types/api';
import { workoutHistoryVisuals } from './workoutHistoryVisuals';
import { workoutOverviewVisuals } from './workoutOverviewVisuals';

const session: WorkoutHistoryEntry = { date: '2026-08-25', planId: 'archived', planDayId: 'day-4', workoutMode: 'standard', title: 'Lower body strength' };

it('reuses the workout overview cover for the original date, day and mode', () => {
  const expected = workoutOverviewVisuals(session.planDayId, session.workoutMode, session.date, session.title);
  jest.useFakeTimers();
  try {
    jest.setSystemTime(new Date('2026-09-13T12:00:00'));
    expect(workoutHistoryVisuals(session)).toEqual(expected);
    jest.setSystemTime(new Date('2027-01-25T12:00:00'));
    expect(workoutHistoryVisuals(session)).toEqual(expected);
  } finally { jest.useRealTimers(); }
});

it('uses the recovery artwork pool for an archived mobility session', () => {
  const recovery = { ...session, title: 'Recovery and mobility', workoutMode: 'quick' };
  expect(workoutHistoryVisuals(recovery)).toEqual(workoutOverviewVisuals(recovery.planDayId, recovery.workoutMode, recovery.date, recovery.title));
});

it('uses neutral artwork for unidentified sessions without guessing a workout', () => {
  for (const title of [undefined, 'Workout session', 'Training session', 'Quick workout']) {
    expect(workoutHistoryVisuals({ ...session, title })).toBeNull();
  }
  expect(workoutHistoryVisuals({ ...session, title: undefined, muscleGroups: ['Quads'] })).not.toBeNull();
});
