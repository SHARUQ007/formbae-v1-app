import type { WorkoutDayDetail, WorkoutExerciseAlternative, WorkoutExerciseDetail } from '../types/api';

const EQUIPMENT_PATTERN = /\b(?:dumbbells?|barbells?|kettlebells?|weights?|weighted|plates?|resistance bands?|bands?|cables?|machines?|bench(?:es)?|boxes?|pull[ -]?up bars?|treadmills?|stationary bikes?|exercise bikes?|rowing machines?|rowers?|ellipticals?|smith machines?|medicine balls?|stability balls?|bosu|trx|suspension trainers?|towels?|chairs?|tables?|sofas?|leg press|leg extensions?|leg curls?|lat pulldowns?|chest press|shoulder press|triceps pressdowns?|biceps curls?|goblet squats?|deadlifts?|hip thrusts?|hanging knee raises?|back extensions?|face pulls?|pec deck|hack squats?|landmine|battle ropes?|sleds?|farmer carries|jump ropes?|step[ -]?ups?|aerobic steps?)\b|incline push[ -]?ups?|supported split squats?/i;

type BodyweightFallback = Pick<WorkoutExerciseDetail, 'exerciseName' | 'sets' | 'reps' | 'restSec' | 'notes'>;

const FALLBACK_DAYS: BodyweightFallback[][] = [
  [
    {exerciseName: 'Bodyweight Squat', sets: '2', reps: '12 reps', restSec: '30', notes: 'Controlled pace.'},
    {exerciseName: 'Knee Push Up', sets: '2', reps: '8 reps', restSec: '30', notes: 'Keep your core braced.'},
    {exerciseName: 'Glute Bridge', sets: '2', reps: '12 reps', restSec: '30', notes: 'Pause at the top.'},
  ],
  [
    {exerciseName: 'Step Jack', sets: '2', reps: '40 sec', restSec: '30', notes: 'Keep it low impact if needed.'},
    {exerciseName: 'Reverse Lunge', sets: '2', reps: '8 reps each side', restSec: '30', notes: 'Shorten the range if balance is challenging.'},
    {exerciseName: 'Plank', sets: '2', reps: '20 sec', restSec: '30', notes: 'Brace gently.'},
  ],
  [
    {exerciseName: 'Knee Push Up', sets: '2', reps: '10 reps', restSec: '30', notes: 'Move with control.'},
    {exerciseName: 'Superman Hold', sets: '2', reps: '20 sec', restSec: '30', notes: 'Lift gently without straining your neck.'},
    {exerciseName: 'Side Plank', sets: '2', reps: '15 sec each side', restSec: '30', notes: 'Use knees down if needed.'},
  ],
  [
    {exerciseName: 'Cat Cow', sets: '1', reps: '10 reps', restSec: '20', notes: 'Move at an easy pace.'},
    {exerciseName: 'Thoracic Rotation', sets: '1', reps: '6 reps each side', restSec: '20', notes: 'Stay in a comfortable range.'},
    {exerciseName: "Child's Pose Breathing", sets: '1', reps: '60 sec', restSec: '20', notes: 'Relax your shoulders.'},
  ],
  [
    {exerciseName: 'Reverse Lunge', sets: '2', reps: '8 reps each side', restSec: '30', notes: 'Use a shorter step and range if needed.'},
    {exerciseName: 'Static Squat Hold', sets: '2', reps: '25 sec', restSec: '30', notes: 'Hold a comfortable depth with your chest tall.'},
    {exerciseName: 'Mountain Climber', sets: '2', reps: '25 sec', restSec: '30', notes: 'Slow and controlled is fine.'},
  ],
  [
    {exerciseName: 'Squat to Reach', sets: '2', reps: '12 reps', restSec: '30', notes: 'Reach tall at the top.'},
    {exerciseName: 'Knee Push Up', sets: '2', reps: '8 reps', restSec: '30', notes: 'Keep your core braced.'},
    {exerciseName: 'Plank Shoulder Tap', sets: '2', reps: '8 reps each side', restSec: '30', notes: 'Minimize hip rotation.'},
  ],
  [
    {exerciseName: 'Easy Walk', sets: '1', reps: '10 min', restSec: '0', notes: 'Keep the pace comfortable.'},
    {exerciseName: 'Cat Cow', sets: '1', reps: '10 reps', restSec: '15', notes: 'Move slowly.'},
    {exerciseName: 'Standing Hamstring Stretch', sets: '1', reps: '30 sec each side', restSec: '15', notes: 'Keep the stretch gentle.'},
  ],
];

export function isEquipmentFreeQuickMovement(name: string, notes = '') {
  return !EQUIPMENT_PATTERN.test(`${name} ${notes}`);
}

function fallbacksForDay(dayNumber: string) {
  const parsed = Number.parseInt(dayNumber, 10);
  const index = Number.isFinite(parsed) ? Math.max(0, Math.min(6, parsed - 1)) : 0;
  return FALLBACK_DAYS[index];
}

function safeAlternatives(alternatives: WorkoutExerciseAlternative[] | undefined) {
  return (alternatives ?? []).filter(alternative =>
    isEquipmentFreeQuickMovement(alternative.exerciseName, alternative.notes),
  );
}

function fallbackExercise(fallback: BodyweightFallback, dayNumber: string, index: number): WorkoutExerciseDetail {
  return {
    ...fallback,
    exerciseId: `quick_bodyweight_${dayNumber || '1'}_${index + 1}`,
    order: String(index + 1),
    videoUrl: '',
    alternatives: [],
  };
}

export function ensureEquipmentFreeQuickWorkout(detail: WorkoutDayDetail, replaceAll = false): WorkoutDayDetail {
  const fallbacks = fallbacksForDay(detail.dayNumber);
  const source = replaceAll ? [] : detail.exercises.slice(0, 3);
  const targetCount = Math.min(3, Math.max(2, source.length));
  const exercises = Array.from({length: targetCount}, (_, index) => {
    const exercise = source[index];
    const fallback = fallbacks[index];
    if (!exercise || !isEquipmentFreeQuickMovement(exercise.exerciseName, exercise.notes)) {
      return fallbackExercise(fallback, detail.dayNumber, index);
    }
    return {...exercise, alternatives: safeAlternatives(exercise.alternatives)};
  });

  return {...detail, workoutMode: 'quick', exercises};
}
