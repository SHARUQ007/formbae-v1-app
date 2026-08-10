import {ensureEquipmentFreeQuickWorkout, isEquipmentFreeQuickMovement} from './quickWorkout';
import type {WorkoutDayDetail} from '../types/api';

const detail: WorkoutDayDetail = {
  planId: 'plan',
  planTitle: 'Ava plan',
  planDayId: 'day-1',
  dayNumber: '1',
  focus: 'Full body',
  notes: '',
  workoutMode: 'quick',
  dayComplete: false,
  exercises: [
    {
      exerciseId: 'dumbbell',
      exerciseName: 'Dumbbell Thruster',
      sets: '2',
      reps: '10 reps',
      restSec: '30',
      notes: 'Use two dumbbells',
      videoUrl: 'https://example.com/dumbbell.mp4',
      order: '1',
      alternatives: [{exerciseName: 'Kettlebell Swing'}],
    },
    {
      exerciseId: 'plank',
      exerciseName: 'Plank',
      sets: '2',
      reps: '20 sec',
      restSec: '30',
      notes: 'Brace gently',
      videoUrl: '',
      order: '2',
      alternatives: [{exerciseName: 'Cable Crunch'}, {exerciseName: 'Dead Bug'}],
    },
  ],
};

describe('equipment-free Short on time workouts', () => {
  it('distinguishes a bodyweight Step Jack from gym step equipment', () => {
    expect(isEquipmentFreeQuickMovement('Step Jack')).toBe(true);
    expect(isEquipmentFreeQuickMovement('Step Up')).toBe(false);
    expect(isEquipmentFreeQuickMovement('Leg Press')).toBe(false);
  });

  it('replaces unsafe exercises and removes equipment alternatives', () => {
    const result = ensureEquipmentFreeQuickWorkout(detail);

    expect(result.exercises.map(exercise => exercise.exerciseName)).toEqual(['Bodyweight Squat', 'Plank']);
    expect(result.exercises[0].videoUrl).toBe('');
    expect(result.exercises.every(exercise => isEquipmentFreeQuickMovement(exercise.exerciseName, exercise.notes))).toBe(true);
    expect(result.exercises[1].alternatives).toEqual([{exerciseName: 'Dead Bug'}]);
  });

  it('never relabels the standard equipment workout as quick during an API fallback', () => {
    const result = ensureEquipmentFreeQuickWorkout({...detail, workoutMode: 'standard'}, true);

    expect(result.workoutMode).toBe('quick');
    expect(result.exercises.map(exercise => exercise.exerciseName)).toEqual(['Bodyweight Squat', 'Knee Push Up']);
  });
});
