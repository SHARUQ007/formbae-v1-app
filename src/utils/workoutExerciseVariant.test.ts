import type { WorkoutExerciseDetail } from '../types/api';
import { exerciseWithSelectedVariant } from './workoutExerciseVariant';

const plannedExercise: WorkoutExerciseDetail = {
  exerciseId: 'ce_goblet_squat',
  exerciseName: 'Goblet Squat',
  sets: '3',
  reps: '10-12',
  restSec: '75',
  notes: 'Target Muscles: Quads, Glutes',
  videoUrl: 'https://www.youtube.com/watch?v=goblet123',
  order: '1',
  alternatives: [{ exerciseName: 'Split Squat' }],
};

describe('exerciseWithSelectedVariant', () => {
  it('does not reuse the primary movement video or notes', () => {
    const selected = exerciseWithSelectedVariant(plannedExercise, 0);

    expect(selected.exerciseName).toBe('Split Squat');
    expect(selected.videoUrl).toBe('');
    expect(selected.notes).toBe('');
    expect(selected.exerciseId).toBe(plannedExercise.exerciseId);
  });

  it('uses a movement-specific video cached with its own ID', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      alternatives: [{
        exerciseName: 'Split Squat',
        videoId: 'yt_split-squat',
        videoUrl: 'https://youtube.com/shorts/split-squat',
      }],
    }, 0);

    expect(selected.videoUrl).toContain('split-squat');
  });

  it('rejects the primary YouTube video when its URL format differs', () => {
    const selected = exerciseWithSelectedVariant({
      ...plannedExercise,
      alternatives: [{
        exerciseName: 'Split Squat',
        videoId: 'yt_goblet123',
        videoUrl: 'https://youtu.be/goblet123',
      }],
    }, 0);

    expect(selected.videoUrl).toBe('');
  });
});
