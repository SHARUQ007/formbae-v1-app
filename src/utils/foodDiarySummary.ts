import type { DietDiaryEntry } from '../store/dietDiaryStore';

/** Count distinct meals within one calendar day. Skipped slots are not logged meals. */
export function loggedMealCount(entries: DietDiaryEntry[]): number {
  return new Set(entries.filter(entry => entry.kind !== 'skip' && entry.status !== 'skipped').map(entry => entry.mealType)).size;
}
