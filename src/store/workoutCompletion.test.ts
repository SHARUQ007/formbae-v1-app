import type { WorkoutExerciseDetail } from '../types/api';
import { buildCompletedExercises } from './workoutCompletion';

const movement = (overrides: Partial<WorkoutExerciseDetail> = {}): WorkoutExerciseDetail => ({
  exerciseId: 'slot-1', exerciseName: 'Goblet Squat', sets: '3', reps: '10–12', restSec: '60', notes: '', videoUrl: '', order: '1', ...overrides,
});

it('keeps the performed alternative and actual sets separate from the prescription', () => {
  const result = buildCompletedExercises([movement({ exerciseName: 'Leg Press' })], new Set(['slot-1']), {
    'slot-1': [{ setNumber: 1, reps: '8', weight: '35', durationSec: 42, exerciseName: 'Goblet Squat', plannedSets: '3', plannedReps: '10–12' }],
  });
  expect(result).toEqual([{
    exerciseId: 'slot-1', name: 'Goblet Squat', completed: true, plannedSets: '3', plannedReps: '10–12',
    sets: [{ setNumber: '1', reps: '8', weight: '35', durationSec: '42' }],
  }]);
});

it('includes recorded partial sets but never invents sets for completed or untouched movements', () => {
  const result = buildCompletedExercises([
    movement(), movement({ exerciseId: 'partial' }), movement({ exerciseId: 'untouched' }),
  ], new Set(['slot-1']), { partial: [{ setNumber: 1, reps: '', weight: '' }] });
  expect(result).toHaveLength(2);
  expect(result[0].sets).toEqual([]);
  expect(result[1]).toMatchObject({ completed: false, sets: [{ setNumber: '1', reps: '', weight: '' }] });
});

it('keeps quick fallback identity and measured time without turning seconds into repetitions', () => {
  const result = buildCompletedExercises([
    movement({ exerciseId: 'quick_bodyweight_1_1', exerciseName: 'Plank', sets: '2', reps: '30 sec' }),
  ], new Set(['quick_bodyweight_1_1']), {
    quick_bodyweight_1_1: [{ setNumber: 1, reps: '30', weight: '', durationSec: 26 }],
  });
  expect(result[0]).toMatchObject({
    exerciseId: 'quick_bodyweight_1_1', name: 'Plank',
    sets: [{ setNumber: '1', reps: '', weight: '', durationSec: '26' }],
  });
});
