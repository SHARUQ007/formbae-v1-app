import type { PlanDay, WorkoutDayDetail } from '../types/api';

export type WorkoutSummary = {
  muscles: string[];
  benefits: string[];
  calories: string;
  muscleGain: string;
  duration: string;
  intensity: string;
  overview: string;
};

type DayLike = Pick<PlanDay | WorkoutDayDetail, 'notes'>;

const SUMMARY_RE = /(?:WorkoutSummary|Summary)\s*:\s*(\{[\s\S]*?\})(?:\s*$|\s*\|)/i;

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export function readStoredWorkoutSummary(notes?: string): Partial<WorkoutSummary> | null {
  const match = String(notes || '').match(SUMMARY_RE);
  if (!match?.[1]) return null;
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
    return null;
  }
}

export function buildWorkoutSummary(day: DayLike): WorkoutSummary | null {
  const ai = readStoredWorkoutSummary(day.notes);
  if (!ai?.muscles?.length || !ai.benefits?.length || !ai.calories || !ai.muscleGain || !ai.duration || !ai.intensity || !ai.overview) {
    return null;
  }

  return {
    muscles: unique(ai.muscles, 6),
    benefits: unique(ai.benefits, 4),
    calories: ai.calories,
    muscleGain: ai.muscleGain,
    duration: ai.duration,
    intensity: ai.intensity,
    overview: ai.overview,
  };
}
