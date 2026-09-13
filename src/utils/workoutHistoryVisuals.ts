import type { WorkoutHistoryEntry } from '../types/api';
import { historyMuscleGroups, isGenericHistoryTitle } from './workoutHistory';
import { workoutOverviewVisuals } from './workoutOverviewVisuals';

/** Resolve the workout's bundled cover using its historical date and day,
 * never today's date or the current plan. Unknown sessions use journal SVGs. */
export function workoutHistoryVisuals(session: WorkoutHistoryEntry) {
  if (isGenericHistoryTitle(session.title) && !session.exercises?.length && !historyMuscleGroups(session).length) return null;
  return workoutOverviewVisuals(session.planDayId, session.workoutMode, session.date, session.title);
}
