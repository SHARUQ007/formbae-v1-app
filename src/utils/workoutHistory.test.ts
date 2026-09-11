import { workoutDateKey, workoutHistoryStats, workoutMonthDays } from './workoutHistory';

it('lays out leap February Monday first with trailing blank cells', () => {
  const days = workoutMonthDays(new Date(2024, 1, 1));
  expect(days.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
  expect(days.filter(Boolean)).toHaveLength(29);
  expect(days).toHaveLength(35);
  expect(days[31]).toBe('2024-02-29');
  expect(days[34]).toBeNull();
});
it('uses local dates and handles year boundaries', () => {
  expect(workoutDateKey(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
  expect(workoutMonthDays(new Date(2025, 12, 1))).toContain('2026-01-01');
});
it('counts active days once when multiple workouts happen on the same day', () => {
  const result = workoutHistoryStats([
    { date: '2026-09-12', planId: 'a', planDayId: '1', workoutMode: 'standard' },
    { date: '2026-09-12', planId: 'b', planDayId: '2', workoutMode: 'quick' },
    { date: '2026-09-05', planId: 'a', planDayId: '3', workoutMode: 'standard' },
  ]);
  expect(result).toEqual({ days: 2, first: '2026-09-05', quick: 1, favouriteDay: 'Saturday' });
});
it('does not invent highlights for empty history', () => {
  expect(workoutHistoryStats([])).toEqual({ days: 0, first: undefined, quick: 0, favouriteDay: null });
});
