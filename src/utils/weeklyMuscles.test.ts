import type { PlanDay, ProgressSummary } from '../types/api';
import {
  currentWeekDateRange,
  deriveCurrentWeekStreak,
  deriveExerciseMuscles,
  haveCompatibleMuscleTargets,
  deriveWeeklyMuscles,
  deriveWorkoutMuscles,
  isDateInCurrentWeek,
  resolveBodyGender,
} from './weeklyMuscles';

describe('weekly body map', () => {
  it('resolves the profile gender without treating female as male', () => {
    expect(resolveBodyGender('Female')).toBe('female');
    expect(resolveBodyGender('male')).toBe('male');
    expect(resolveBodyGender('non-binary')).toBe('neutral');
    expect(resolveBodyGender()).toBe('neutral');
  });

  it('uses a local Monday to Sunday week', () => {
    expect(currentWeekDateRange(new Date(2026, 7, 9, 12))).toEqual({
      start: '2026-08-03',
      end: '2026-08-09',
    });
    expect(isDateInCurrentWeek('2026-08-03', new Date(2026, 7, 9, 12))).toBe(true);
    expect(isDateInCurrentWeek('2026-08-02', new Date(2026, 7, 9, 12))).toBe(false);
  });

  it('keeps the workout streak inside the current week', () => {
    const history: NonNullable<ProgressSummary['completionHistory']> = [
      { date: '2026-08-10', planId: 'current', planDayId: 'day-3', workoutMode: 'standard' },
      { date: '2026-08-09', planId: 'past', planDayId: 'day-2', workoutMode: 'standard' },
      { date: '2026-08-08', planId: 'past', planDayId: 'day-1', workoutMode: 'standard' },
    ];

    expect(deriveCurrentWeekStreak(history, new Date(2026, 7, 10, 12))).toBe(1);
  });

  it('counts consecutive workout days without double-counting one date', () => {
    const history: NonNullable<ProgressSummary['completionHistory']> = [
      { date: '2026-08-12', planId: 'current', planDayId: 'day-3', workoutMode: 'standard' },
      { date: '2026-08-12', planId: 'current', planDayId: 'day-3', workoutMode: 'quick' },
      { date: '2026-08-11', planId: 'current', planDayId: 'day-2', workoutMode: 'standard' },
      { date: '2026-08-10', planId: 'current', planDayId: 'day-1', workoutMode: 'standard' },
    ];

    expect(deriveCurrentWeekStreak(history, new Date(2026, 7, 12, 12))).toBe(3);
  });

  it('highlights only muscles from workouts completed this week', () => {
    const days: PlanDay[] = [
      {
        planDayId: 'day-chest',
        dayNumber: '1',
        focus: 'Chest strength',
        notes: 'WorkoutSummary:{"muscles":["Chest","Shoulders"],"benefits":[]}',
        exercises: [
          { exerciseId: 'press', exerciseName: 'Bench Press', sets: '3', reps: '10', restSec: '60', notes: '', workoutMode: 'standard' },
        ],
      },
      {
        planDayId: 'day-legs',
        dayNumber: '2',
        focus: 'Posterior chain',
        notes: 'WorkoutSummary:{"muscles":["Back","Glutes","Hamstrings"],"benefits":[]}',
        exercises: [
          { exerciseId: 'rdl', exerciseName: 'Romanian Deadlift', sets: '3', reps: '8', restSec: '60', notes: '', workoutMode: 'standard' },
        ],
      },
      {
        planDayId: 'day-core',
        dayNumber: '3',
        focus: 'Core',
        notes: 'WorkoutSummary:{"muscles":["Core"],"benefits":[]}',
        exercises: [
          { exerciseId: 'plank', exerciseName: 'Plank', sets: '3', reps: '30 sec', restSec: '30', notes: '', workoutMode: 'standard' },
        ],
      },
    ];
    const history: NonNullable<ProgressSummary['completionHistory']> = [
      { date: '2026-08-05', planId: 'current-plan', planDayId: 'day-chest', workoutMode: 'standard' },
      { date: '2026-08-06', planId: 'past-plan', planDayId: 'day-legs', workoutMode: 'standard' },
      { date: '2026-07-31', planId: 'past-plan', planDayId: 'day-core', workoutMode: 'standard' },
    ];

    const muscles = deriveWeeklyMuscles(history, days, new Date(2026, 7, 9, 12));

    expect(muscles).toEqual(expect.arrayContaining(['Chest', 'Shoulders', 'Back', 'Glutes', 'Hamstrings']));
    expect(muscles).not.toContain('Core');
  });

  it('derives target muscles for the selected workout', () => {
    const workout: PlanDay = {
      planDayId: 'day-push',
      dayNumber: '4',
      focus: 'Upper Body Push',
      notes: 'WorkoutSummary:{"muscles":["Chest","Shoulders","Triceps"],"benefits":[]}',
      exercises: [
        { exerciseId: 'bench', exerciseName: 'Bench Press', sets: '3', reps: '10', restSec: '60', notes: '', workoutMode: 'standard' },
        { exerciseId: 'dip', exerciseName: 'Tricep Dips', sets: '3', reps: '8', restSec: '60', notes: '', workoutMode: 'standard' },
      ],
    };

    expect(deriveWorkoutMuscles(workout)).toEqual(expect.arrayContaining(['Chest', 'Shoulders', 'Triceps']));
  });

  it('does not invent target muscles when AI metadata is missing', () => {
    const workout: PlanDay = {
      planDayId: 'legacy-day',
      dayNumber: '1',
      focus: 'Chest strength',
      notes: '',
      exercises: [
        { exerciseId: 'bench', exerciseName: 'Bench Press', sets: '3', reps: '10', restSec: '60', notes: '', workoutMode: 'standard' },
      ],
    };

    expect(deriveWorkoutMuscles(workout)).toEqual([]);
  });

  it('uses AI exercise metadata for the active movement body map', () => {
    expect(deriveExerciseMuscles({
      exerciseName: 'Cable Woodchopper',
      notes: 'Target Muscles: Core, Back | Rotate through the torso.',
    }, ['Core', 'Back', 'Shoulders'])).toEqual(['Core', 'Back']);
  });

  it('narrows day-level AI muscles for existing exercise rows', () => {
    expect(deriveExerciseMuscles({
      exerciseName: 'Cable Woodchopper',
      notes: 'Rotate through the torso.',
    }, ['Core', 'Quads', 'Calves'])).toEqual(['Core']);
    expect(deriveExerciseMuscles({ exerciseName: 'Legacy movement', notes: '' })).toEqual([]);
  });

  it('keeps movement-level inference authoritative when day metadata conflicts', () => {
    expect(deriveExerciseMuscles({
      exerciseName: 'Leg Press',
      notes: '',
    }, ['Chest', 'Shoulders', 'Triceps'])).toEqual(['Quads', 'Glutes', 'Hamstrings']);
  });

  it('does not let incorrect generated notes override a canonical exercise', () => {
    expect(deriveExerciseMuscles({
      exerciseName: 'Leg Press',
      notes: 'Target Muscles: Chest, Shoulders, Triceps | Generated incorrectly.',
    }, ['Chest', 'Shoulders', 'Triceps'])).toEqual(['Quads', 'Glutes', 'Hamstrings']);
  });

  it('rejects cross-muscle alternatives', () => {
    expect(haveCompatibleMuscleTargets(
      ['Quads', 'Glutes', 'Hamstrings'],
      ['Chest', 'Shoulders', 'Triceps'],
    )).toBe(false);
    expect(haveCompatibleMuscleTargets(
      ['Quads', 'Glutes', 'Core'],
      ['Quads', 'Glutes', 'Hamstrings'],
    )).toBe(true);
  });
});
