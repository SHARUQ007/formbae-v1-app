import type { CompletedExerciseInput } from '../services/workoutService';
import type { WorkoutExerciseDetail } from '../types/api';
import type { WorkoutSetLog } from './workoutStore';

export function isTimedWorkoutTarget(value: string): boolean {
  return /\b(?:sec(?:ond)?s?|mins?|minutes?|hours?)\b|\d\s*s\b/i.test(value);
}

/** Capture what the player recorded before local progress is cleared. */
export function buildCompletedExercises(
  exercises: WorkoutExerciseDetail[],
  completed: ReadonlySet<string>,
  logsByExercise: Record<string, WorkoutSetLog[]>,
): CompletedExerciseInput[] {
  return exercises
    .filter(exercise => completed.has(exercise.exerciseId) || logsByExercise[exercise.exerciseId]?.length)
    .map(exercise => {
      const logs = logsByExercise[exercise.exerciseId] || [];
      const firstRecorded = logs[0];
      const plannedReps = firstRecorded?.plannedReps ?? exercise.reps;
      return {
        exerciseId: exercise.exerciseId,
        name: firstRecorded?.exerciseName || exercise.exerciseName,
        completed: completed.has(exercise.exerciseId),
        plannedSets: firstRecorded?.plannedSets ?? exercise.sets,
        plannedReps,
        sets: logs.map(log => ({
          setNumber: String(log.setNumber),
          // Old local progress used the time target as a rep count. Never
          // present those seconds as repetitions in the session record.
          reps: isTimedWorkoutTarget(log.plannedReps ?? plannedReps) ? '' : log.reps.trim(),
          weight: log.weight.trim(),
          ...(Number.isFinite(log.durationSec) && Number(log.durationSec) >= 0
            ? { durationSec: String(log.durationSec) }
            : {}),
        })),
      };
    });
}
