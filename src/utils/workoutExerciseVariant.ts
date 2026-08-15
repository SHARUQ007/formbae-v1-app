import type { WorkoutExerciseDetail } from '../types/api';

/**
 * Keeps the workout slot identity while replacing movement-specific content.
 * An alternative must never inherit the original movement's video or coaching
 * notes, since those can describe a completely different exercise.
 */
export function exerciseWithSelectedVariant(
  exercise: WorkoutExerciseDetail,
  selectedIndex?: number,
): WorkoutExerciseDetail {
  const alternative = selectedIndex !== undefined && selectedIndex >= 0
    ? exercise.alternatives?.[selectedIndex]
    : null;
  if (!alternative) return exercise;

  const alternativeVideoUrl = alternative.videoUrl
    && alternative.videoUrl !== exercise.videoUrl
    ? alternative.videoUrl
    : '';

  return {
    ...exercise,
    exerciseName: alternative.exerciseName || exercise.exerciseName,
    sets: alternative.sets || exercise.sets,
    reps: alternative.reps || exercise.reps,
    restSec: alternative.restSec || exercise.restSec,
    notes: alternative.notes || '',
    videoUrl: alternativeVideoUrl,
  };
}
