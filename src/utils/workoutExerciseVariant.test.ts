import type { WorkoutExerciseDetail } from '../types/api';
import { exerciseWithSelectedVariant } from './workoutExerciseVariant';

const plannedExercise: WorkoutExerciseDetail = {
  exerciseId: 'ce_goblet_squat',
  exerciseName: 'Goblet Squat',
  sets: '3',
  reps: '10-12',
  restSec: '75',
  notes: 'Target Muscles: Quads, Glutes',
  videoUrl: 'https://youtube.com/shorts/goblet',
  order: '1',
  alternatives: [{ exerciseName: 'Leg Press' }],
};

describe('exerciseWithSelectedVariant', () => {
  it('does not reuse movement-specific video or notes for an alternative', () => {
    const selected = exerciseWithSelectedVariant(plannedExercise, 0);

    expect(selected.exerciseId).toBe(plannedExercise.exerciseId);
    expect(selected.exerciseName).toBe('Leg Press');
    expect(selected.videoUrl).toBe('');
    expect(selected.notes).toBe('');
    expect(selected.sets).toBe('3');
  });

  it('uses video and notes supplied for the alternative', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      alternatives: [{
        exerciseName: 'Leg Press',
        notes: 'Target Muscles: Quads, Glutes',
        videoId: 'yt_leg-press',
        videoUrl: 'https://youtube.com/shorts/leg-press',
      }],
    }, 0);

    expect(selected.videoUrl).toContain('leg-press');
    expect(selected.notes).toContain('Quads');
  });

  it('rejects an alternative video copied from the original movement', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      alternatives: [{
        exerciseName: 'Leg Press',
        videoUrl: plannedExercise.videoUrl,
      }],
    }, 0);

    expect(selected.exerciseName).toBe('Leg Press');
    expect(selected.videoUrl).toBe('');
  });

  it('rejects a legacy alternative URL that has not been verified for that movement', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      alternatives: [{
        exerciseName: 'Split Squat',
        videoUrl: 'https://youtube.com/shorts/a-different-but-unverified-link',
      }],
    }, 0);

    expect(selected.exerciseName).toBe('Split Squat');
    expect(selected.videoUrl).toBe('');
  });

  it('rejects the original YouTube video even when its URL format differs', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      videoUrl: 'https://www.youtube.com/watch?v=goblet123',
      alternatives: [{
        exerciseName: 'Leg Press',
        videoId: 'yt_goblet123',
        videoUrl: 'https://youtu.be/goblet123',
      }],
    }, 0);

    expect(selected.videoUrl).toBe('');
  });
});
