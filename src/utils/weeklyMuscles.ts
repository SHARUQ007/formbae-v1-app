import type { PlanDay, ProgressSummary } from '../types/api';
import { readStoredWorkoutSummary } from './workoutSummary';

export type BodyGender = 'male' | 'female' | 'neutral';
export type BodyMuscle = 'Chest' | 'Shoulders' | 'Back' | 'Biceps' | 'Triceps' | 'Core' | 'Glutes' | 'Quads' | 'Hamstrings' | 'Calves';

const BODY_MUSCLES = new Set<BodyMuscle>([
  'Chest',
  'Shoulders',
  'Back',
  'Biceps',
  'Triceps',
  'Core',
  'Glutes',
  'Quads',
  'Hamstrings',
  'Calves',
]);

const FULL_BODY_MUSCLES: BodyMuscle[] = ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Glutes', 'Quads', 'Hamstrings', 'Calves'];

// Selected alternatives keep the original plan-slot ID, so their displayed name
// is the reliable identity available to the mobile player.
const CANONICAL_EXERCISE_MUSCLES = new Map<string, BodyMuscle[]>([
  ['goblet squat', ['Quads', 'Glutes', 'Core']],
  ['leg press', ['Quads', 'Glutes', 'Hamstrings']],
  ['machine leg press', ['Quads', 'Glutes', 'Hamstrings']],
  ['split squat', ['Quads', 'Glutes', 'Hamstrings']],
  ['stationary lunge', ['Quads', 'Glutes', 'Hamstrings']],
]);

const EXERCISE_MUSCLE_RULES: Array<{ muscles: BodyMuscle[]; re: RegExp }> = [
  { muscles: ['Chest'], re: /\b(chest|bench|push[- ]?up|pec|fly|press[- ]?up)\b/i },
  { muscles: ['Shoulders'], re: /\b(shoulder|deltoid|overhead press|military press|lateral raise|front raise|bench press|chest press|push[- ]?up)\b/i },
  { muscles: ['Back'], re: /\b(back|row|pull[- ]?up|pulldown|lat pull|reverse fly|superman)\b/i },
  { muscles: ['Biceps'], re: /\b(biceps?|curl|chin[- ]?up)\b/i },
  { muscles: ['Triceps'], re: /\b(triceps?|pushdown|skull crusher|dip|bench press|chest press|push[- ]?up)\b/i },
  { muscles: ['Core'], re: /\b(core|abs?|abdominal|plank|crunch|sit[- ]?up|dead bug|hollow|woodchop|woodchopper|rotation|russian twist|mountain climber)\b/i },
  { muscles: ['Glutes'], re: /\b(glutes?|hip thrust|glute bridge|kickback|abduction|squat|lunge|leg press|step[- ]?up|deadlift)\b/i },
  { muscles: ['Quads'], re: /\b(quads?|quadriceps|squat|lunge|leg press|leg extension|step[- ]?up|wall sit|bike|cycling|treadmill|run|walk)\b/i },
  { muscles: ['Hamstrings'], re: /\b(hamstrings?|romanian deadlift|rdl|deadlift|leg curl|good morning|hinge|lunge|split squat|leg press|step[- ]?up|bike|cycling)\b/i },
  { muscles: ['Calves'], re: /\b(calves?|calf|heel raise|bike|cycling|treadmill|run|walk|jump rope)\b/i },
];

function normalizeMuscleLabels(values: string[]) {
  const muscles = new Set<BodyMuscle>();
  values.forEach((value) => {
    const match = Array.from(BODY_MUSCLES).find((muscle) => muscle.toLowerCase() === value.trim().toLowerCase());
    if (match) muscles.add(match);
  });
  return Array.from(muscles);
}

export function resolveBodyGender(value?: string): BodyGender {
  const normalized = String(value || '').trim().toLowerCase();
  if (/female|woman|girl/.test(normalized)) return 'female';
  if (/male|man|boy/.test(normalized)) return 'male';
  return 'neutral';
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentWeekDateRange(now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: dateKey(monday), end: dateKey(sunday) };
}

export function isDateInCurrentWeek(value: Date | string, now = new Date()) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const parsed = value instanceof Date ? new Date(value) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return false;
  const key = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dateKey(parsed);
  const range = currentWeekDateRange(now);
  return key >= range.start && key <= range.end;
}

export function deriveCurrentWeekStreak(
  completionHistory: NonNullable<ProgressSummary['completionHistory']>,
  now = new Date(),
) {
  const completedDates = Array.from(new Set(
    completionHistory
      .map((entry) => String(entry.date || '').slice(0, 10))
      .filter((entryDate) => isDateInCurrentWeek(entryDate, now)),
  )).sort((first, second) => second.localeCompare(first));

  if (!completedDates.length) return 0;
  const today = dateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const latest = completedDates[0];
  if (latest !== today && latest !== dateKey(yesterday)) return 0;

  let streak = 1;
  for (let index = 1; index < completedDates.length; index += 1) {
    const previous = new Date(`${completedDates[index - 1]}T12:00:00`);
    const current = new Date(`${completedDates[index]}T12:00:00`);
    const daysApart = Math.round((previous.getTime() - current.getTime()) / 86_400_000);
    if (daysApart !== 1) break;
    streak += 1;
  }
  return streak;
}

export function deriveWorkoutMuscles(day?: Pick<PlanDay, 'notes'> | null): BodyMuscle[] {
  if (!day) return [];

  const muscles = new Set<BodyMuscle>();
  const storedSummary = readStoredWorkoutSummary(day.notes);
  if (!storedSummary?.muscles?.length) return [];

  storedSummary.muscles.forEach((muscle) => {
    if (BODY_MUSCLES.has(muscle as BodyMuscle)) {
      muscles.add(muscle as BodyMuscle);
      return;
    }

    const normalized = muscle.trim().toLowerCase();
    if (normalized.includes('full body')) FULL_BODY_MUSCLES.forEach((item) => muscles.add(item));
    if (normalized.includes('upper body')) ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps'].forEach((item) => muscles.add(item as BodyMuscle));
    if (normalized.includes('lower body') || normalized.includes('legs')) ['Glutes', 'Quads', 'Hamstrings', 'Calves'].forEach((item) => muscles.add(item as BodyMuscle));
    if (normalized.includes('cardio')) ['Core', 'Quads', 'Calves'].forEach((item) => muscles.add(item as BodyMuscle));
    if (normalized.includes('mobility')) ['Shoulders', 'Back', 'Core', 'Glutes', 'Hamstrings'].forEach((item) => muscles.add(item as BodyMuscle));
  });

  return Array.from(muscles);
}

export function deriveExerciseMuscles(
  exercise?: { exerciseName?: string; notes?: string } | null,
  aiDayMuscles: BodyMuscle[] = [],
): BodyMuscle[] {
  if (!exercise) return [];
  const notes = String(exercise.notes || '');
  const normalizedName = String(exercise.exerciseName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const canonical = CANONICAL_EXERCISE_MUSCLES.get(normalizedName);
  if (canonical) return canonical.slice(0, 4);
  const explicit = notes.match(/(?:^|[|\n])\s*(?:Target Muscles?|Muscles?)\s*:\s*([^|\n]+)/i)?.[1] || '';
  const generated = normalizeMuscleLabels(explicit.split(/[,/·]/));
  if (generated.length) return generated.slice(0, 4);
  if (!aiDayMuscles.length) return [];

  const haystack = `${exercise.exerciseName || ''} ${notes}`;
  const likely = new Set(
    EXERCISE_MUSCLE_RULES
      .filter((rule) => rule.re.test(haystack))
      .flatMap((rule) => rule.muscles),
  );
  const narrowed = aiDayMuscles.filter((muscle) => likely.has(muscle));
  // A movement-level match is more specific than the day summary. Falling back
  // to unrelated day muscles here can turn a canonical lower-body alternative
  // (for example Leg Press) into an upper-body body map.
  if (likely.size) {
    const inferred = Array.from(likely);
    const remaining = inferred.filter((muscle) => !narrowed.includes(muscle));
    return [...narrowed, ...remaining].slice(0, 4);
  }
  return aiDayMuscles.slice(0, 4);
}

export function haveCompatibleMuscleTargets(source: BodyMuscle[], candidate: BodyMuscle[]) {
  const sourceSet = new Set(source);
  const candidateSet = new Set(candidate);
  const sourcePrimary = source[0];
  const candidatePrimary = candidate[0];
  if (!sourcePrimary || !candidatePrimary) return false;
  const sharedCount = source.filter((muscle) => candidateSet.has(muscle)).length;
  const requiredShared = Math.ceil(Math.min(sourceSet.size, candidateSet.size) / 2);
  return candidateSet.has(sourcePrimary)
    && sourceSet.has(candidatePrimary)
    && sharedCount >= requiredShared;
}

export function deriveWeeklyMuscles(
  completionHistory: NonNullable<ProgressSummary['completionHistory']>,
  days: PlanDay[],
  now = new Date(),
): BodyMuscle[] {
  const range = currentWeekDateRange(now);
  const completedDayIds = new Set(
    completionHistory
      .filter((entry) => {
        const entryDate = String(entry.date || '').slice(0, 10);
        return entryDate >= range.start && entryDate <= range.end;
      })
      .map((entry) => entry.planDayId),
  );

  const muscles = new Set<BodyMuscle>();
  days
    .filter((day) => completedDayIds.has(day.planDayId))
    .forEach((day) => {
      deriveWorkoutMuscles(day).forEach((muscle) => muscles.add(muscle));
    });

  return Array.from(muscles);
}
