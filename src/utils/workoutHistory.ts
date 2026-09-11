import { formatWorkoutTitle } from './workoutTitle';
import type { BodyMuscle } from './weeklyMuscles';
import type { ProgressSummary, WorkoutHistoryEntry } from '../types/api';

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

const bodyMuscles: BodyMuscle[] = ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Glutes', 'Quads', 'Hamstrings', 'Calves'];
export function historyMuscleGroups(session: WorkoutHistoryEntry) {
  const groups = session.muscleGroups?.length ? session.muscleGroups : (session.exercises ?? []).flatMap(exercise => exercise.muscleGroups ?? []);
  return [...new Set(groups.map(group => group.trim()).filter(Boolean))];
}
export function historyBodyMuscles(session: WorkoutHistoryEntry): BodyMuscle[] {
  const aliases: Record<string, BodyMuscle> = { quadriceps: 'Quads', abdominals: 'Core', abs: 'Core', deltoids: 'Shoulders', gluteal: 'Glutes', 'upper back': 'Back', 'lower back': 'Back', lats: 'Back' };
  return [...new Set(historyMuscleGroups(session).flatMap(group => {
    const known = bodyMuscles.find(muscle => muscle.toLowerCase() === group.toLowerCase()) || aliases[group.toLowerCase()];
    return known ? [known] : [];
  }))];
}
export function historyWorkoutTitle(session: WorkoutHistoryEntry) {
  const title = formatWorkoutTitle(session.title);
  if (title && !/^(standard|quick)?\s*workout$/i.test(title)) return title;
  const groups = historyMuscleGroups(session);
  if (groups.length) return groups.length <= 2 ? groups.join(' & ') : `${groups[0]} & more`;
  return session.workoutMode === 'quick' ? 'Quick session' : 'Training session';
}
export function historyHasPerformance(session: WorkoutHistoryEntry) {
  return (session.exercises ?? []).some(exercise => exercise.completed === true || exercise.sets?.length);
}
export function historyWorkoutSummary(session: WorkoutHistoryEntry) {
  const exercises = session.exercises ?? [];
  if (!exercises.length) return 'Session saved · Details unavailable';
  const sets = exercises.reduce((count, exercise) => count + (exercise.sets?.length || 0), 0);
  const reference = session.detailsSource === 'plan' || !historyHasPerformance(session) ? 'Plan · ' : '';
  return `${reference}${exercises.length} exercise${exercises.length === 1 ? '' : 's'}${sets ? ` · ${sets} logged set${sets === 1 ? '' : 's'}` : ''}`;
}
export function historyExercisePreview(session: WorkoutHistoryEntry) {
  const names = (session.exercises ?? []).map(exercise => exercise.name).filter(Boolean);
  return names.slice(0, 3).join(' · ') + (names.length > 3 ? ` · +${names.length - 3}` : '');
}
export function historySessionKey(session: WorkoutHistoryEntry) {
  return session.logId || `${session.date}:${session.planId}:${session.planDayId}:${session.workoutMode}`;
}
