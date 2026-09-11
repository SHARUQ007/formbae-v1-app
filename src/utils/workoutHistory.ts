import type { ProgressSummary } from '../types/api';

export const workoutDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function workoutMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => i < offset || i >= offset + count ? null : workoutDateKey(new Date(month.getFullYear(), month.getMonth(), i - offset + 1)));
}
export function workoutHistoryStats(history: NonNullable<ProgressSummary['completionHistory']>) {
  const days = [...new Set(history.map(entry => entry.date))].sort();
  const weekdays = Array<number>(7).fill(0);
  days.forEach(day => { const date = new Date(`${day}T12:00:00`); if (!Number.isNaN(date.getTime())) weekdays[date.getDay()]++; });
  return { days: days.length, first: days[0], quick: history.filter(entry => entry.workoutMode === 'quick').length, favouriteDay: days.length ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdays.indexOf(Math.max(...weekdays))] : null };
}
