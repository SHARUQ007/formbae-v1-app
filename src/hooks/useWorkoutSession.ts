import { useMemo } from 'react';
import type { WorkoutExerciseDetail } from '../types/api';
import type { WorkoutProgress } from '../store/workoutStore';

type ResumeExercise = Pick<WorkoutExerciseDetail, 'exerciseId' | 'sets'>;

export function deriveWorkoutResumeIndex(exercises: ResumeExercise[], progress: WorkoutProgress) {
  if (!exercises.length) return 0;

  const savedIndex = progress.activeExerciseId
    ? exercises.findIndex((exercise) => exercise.exerciseId === progress.activeExerciseId)
    : -1;
  if (savedIndex >= 0 && !progress.completedExerciseIds.includes(exercises[savedIndex].exerciseId)) {
    return savedIndex;
  }

  const setProgress = progress.setProgressByExercise || {};
  const firstIncomplete = exercises.findIndex((exercise) => {
    const targetSets = Math.max(1, Number(exercise.sets || 1));
    return !progress.completedExerciseIds.includes(exercise.exerciseId) && (setProgress[exercise.exerciseId] || 0) < targetSets;
  });
  return firstIncomplete >= 0 ? firstIncomplete : Math.max(0, exercises.length - 1);
}

export function remainingRestSeconds(rest?: WorkoutProgress['rest'], now = Date.now()) {
  if (!rest) return 0;
  const elapsed = Math.max(0, Math.floor((now - rest.startedAt) / 1000));
  return Math.max(0, rest.durationSec - elapsed);
}

export function useWorkoutSession(exercises: ResumeExercise[], progress: WorkoutProgress | null) {
  return useMemo(
    () => ({
      resumeIndex: progress ? deriveWorkoutResumeIndex(exercises, progress) : 0,
      remainingRest: progress ? remainingRestSeconds(progress.rest) : 0,
    }),
    [exercises, progress],
  );
}
