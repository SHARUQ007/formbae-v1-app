import type { WorkoutExerciseDetail } from '../types/api';

function youtubeVideoId(value: string) {
  const input = value.trim();
  return input.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|embed\/)|[?&]v=)([A-Za-z0-9_-]+)/i)?.[1] || '';
}

function isSameVideo(left: string, right: string) {
  if (!left || !right) return false;
  if (left.trim() === right.trim()) return true;
  const leftId = youtubeVideoId(left);
  const rightId = youtubeVideoId(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

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

  // Legacy plans copied the primary URL into alternatives and did not store a
  // movement-specific video ID. Only trust links produced by the resolver, which
  // always persists both fields for the selected movement.
  const alternativeVideoUrl = alternative.videoId
    && alternative.videoUrl
    && !isSameVideo(alternative.videoUrl, exercise.videoUrl)
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
