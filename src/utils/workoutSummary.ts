import type { PlanDay, PlanExercise, WorkoutDayDetail, WorkoutExerciseDetail } from '../types/api';

export type WorkoutSummary = {
  muscles: string[];
  benefits: string[];
  calories: string;
  muscleGain: string;
  duration: string;
  intensity: string;
  overview: string;
};

type ExerciseLike = Pick<PlanExercise | WorkoutExerciseDetail, 'exerciseName' | 'sets' | 'reps' | 'restSec' | 'notes'>;
type DayLike = Pick<PlanDay | WorkoutDayDetail, 'focus' | 'notes'> & { exercises?: ExerciseLike[]; workoutMode?: 'standard' | 'quick' | string };

const SUMMARY_RE = /(?:WorkoutSummary|Summary)\s*:\s*(\{[\s\S]*?\})(?:\s*$|\s*\|)/i;

const MUSCLE_RULES: Array<{ muscle: string; re: RegExp }> = [
  { muscle: 'Chest', re: /\b(bench|push[- ]?up|chest|press)\b/i },
  { muscle: 'Shoulders', re: /\b(shoulder|overhead|lateral raise|front raise|press)\b/i },
  { muscle: 'Back', re: /\b(row|pull[- ]?up|pulldown|lat|back|deadlift)\b/i },
  { muscle: 'Biceps', re: /\b(curl|bicep)\b/i },
  { muscle: 'Triceps', re: /\b(tricep|dip|extension|skull)\b/i },
  { muscle: 'Core', re: /\b(core|plank|crunch|dead bug|mountain climber|hollow)\b/i },
  { muscle: 'Glutes', re: /\b(glute|hip thrust|bridge|squat|lunge|deadlift)\b/i },
  { muscle: 'Quads', re: /\b(squat|lunge|leg press|split squat|step[- ]?up)\b/i },
  { muscle: 'Hamstrings', re: /\b(hamstring|deadlift|rdl|leg curl|hinge)\b/i },
  { muscle: 'Calves', re: /\b(calf|calves|raise)\b/i },
  { muscle: 'Cardio system', re: /\b(cardio|treadmill|interval|jumping jack|march|run|walk|cycling)\b/i },
  { muscle: 'Mobility', re: /\b(stretch|mobility|warm[- ]?up|cool[- ]?down|yoga)\b/i },
];

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function parseSummary(notes?: string): Partial<WorkoutSummary> {
  const match = String(notes || '').match(SUMMARY_RE);
  if (!match?.[1]) return {};
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    return {
      muscles: Array.isArray(parsed.muscles) ? parsed.muscles.map(String) : undefined,
      benefits: Array.isArray(parsed.benefits) ? parsed.benefits.map(String) : undefined,
      calories: typeof parsed.calories === 'string' ? parsed.calories : undefined,
      muscleGain: typeof parsed.muscleGain === 'string' ? parsed.muscleGain : undefined,
      duration: typeof parsed.duration === 'string' ? parsed.duration : undefined,
      intensity: typeof parsed.intensity === 'string' ? parsed.intensity : undefined,
      overview: typeof parsed.overview === 'string' ? parsed.overview : undefined,
    };
  } catch {
    return {};
  }
}

function estimateMinutes(exercises: ExerciseLike[]) {
  const total = exercises.reduce((sum, exercise) => {
    const sets = Math.max(1, Number(exercise.sets || 1));
    const rest = Math.max(0, Number(exercise.restSec || 0));
    return sum + sets * 2.5 + (sets - 1) * (rest / 60);
  }, 0);
  return Math.max(8, Math.round(total || exercises.length * 4));
}

function estimateCalories(minutes: number, mode?: string) {
  const low = Math.round(minutes * (mode === 'quick' ? 5 : 6));
  const high = Math.round(minutes * (mode === 'quick' ? 8 : 10));
  return `${low}-${high} kcal`;
}

function deriveMuscles(day: DayLike, exercises: ExerciseLike[]) {
  const haystack = [day.focus, day.notes, ...exercises.flatMap((exercise) => [exercise.exerciseName, exercise.notes])].join(' ');
  const muscles = MUSCLE_RULES.filter((rule) => rule.re.test(haystack)).map((rule) => rule.muscle);
  if (muscles.length) return unique(muscles, 5);
  return day.workoutMode === 'quick' ? ['Full body', 'Cardio system'] : ['Full body', 'Core'];
}

function deriveBenefits(day: DayLike, muscles: string[]) {
  const focus = String(day.focus || '').toLowerCase();
  const benefits = [];
  if (focus.includes('strength') || focus.includes('push') || focus.includes('pull')) benefits.push('Builds practical strength and movement control');
  if (focus.includes('conditioning') || muscles.includes('Cardio system')) benefits.push('Improves stamina and keeps the session efficient');
  if (focus.includes('mobility') || muscles.includes('Mobility')) benefits.push('Improves range of motion and recovery quality');
  if (muscles.some((muscle) => ['Chest', 'Back', 'Shoulders', 'Glutes', 'Quads', 'Hamstrings'].includes(muscle))) {
    benefits.push('Creates a clear hypertrophy stimulus for the main muscle groups');
  }
  benefits.push('Keeps today aligned with your current plan progression');
  return unique(benefits, 4);
}

export function cleanWorkoutNotes(notes?: string) {
  return String(notes || '')
    .replace(SUMMARY_RE, '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

export function buildWorkoutSummary(day: DayLike): WorkoutSummary {
  const exercises = day.exercises ?? [];
  const ai = parseSummary(day.notes);
  const minutes = estimateMinutes(exercises);
  const muscles = unique(ai.muscles ?? deriveMuscles(day, exercises), 5);
  const benefits = unique(ai.benefits ?? deriveBenefits(day, muscles), 4);
  return {
    muscles,
    benefits,
    calories: ai.calories || estimateCalories(minutes, day.workoutMode),
    muscleGain: ai.muscleGain || (day.workoutMode === 'quick' ? 'Maintenance stimulus' : 'Moderate muscle-building stimulus'),
    duration: ai.duration || `${Math.max(10, minutes - 4)}-${minutes + 4} min`,
    intensity: ai.intensity || (day.workoutMode === 'quick' ? 'Efficient' : 'Moderate'),
    overview: ai.overview || cleanWorkoutNotes(day.notes) || `${day.focus || 'Today'} is built to move well, train the right muscles, and keep progress realistic.`,
  };
}
