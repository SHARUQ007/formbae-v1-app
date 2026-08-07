import { deriveWorkoutResumeIndex, remainingRestSeconds } from './useWorkoutSession';

const exercises = [
  { exerciseId: 'walk', sets: '2' },
  { exerciseId: 'press', sets: '3' },
];

describe('workout session resume', () => {
  it('opens the first unfinished set instead of restarting the workout', () => {
    expect(
      deriveWorkoutResumeIndex(exercises, {
        planDayId: 'day-1',
        completedExerciseIds: [],
        setProgressByExercise: { walk: 2, press: 1 },
        updatedAt: '',
      }),
    ).toBe(1);
  });

  it('honors the explicitly saved active exercise when it remains unfinished', () => {
    expect(
      deriveWorkoutResumeIndex(exercises, {
        planDayId: 'day-1',
        completedExerciseIds: [],
        activeExerciseId: 'press',
        updatedAt: '',
      }),
    ).toBe(1);
  });

  it('calculates rest from a timestamp after the app returns to foreground', () => {
    expect(
      remainingRestSeconds(
        { nextExerciseId: 'press', startedAt: 1_000, durationSec: 90 },
        31_000,
      ),
    ).toBe(60);
  });
});
