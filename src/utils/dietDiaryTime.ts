import type { MealType } from '../store/dietDiaryStore';

export const mealOrder: MealType[] = ['Breakfast', 'Lunch', 'Evening', 'Dinner'];

const defaultMealTimes: Record<MealType, { hour: number; minute: number }> = {
  Breakfast: { hour: 8, minute: 30 },
  Lunch: { hour: 13, minute: 30 },
  Evening: { hour: 17, minute: 30 },
  Dinner: { hour: 20, minute: 30 },
};

export function mealForCurrentTime(now = new Date()): MealType {
  const hour = now.getHours();
  // Starting a new calendar day at breakfast keeps every backward slot truly
  // earlier than the current one, including shortly after midnight.
  if (hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 16 && hour < 19) return 'Evening';
  return 'Dinner';
}

export function isSameLocalDay(a: Date | string, b: Date | string) {
  const first = new Date(a);
  const second = new Date(b);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;
  return (
    first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate()
  );
}

export function shiftLocalDate(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function isFutureLocalDay(value: Date, now = new Date()) {
  const candidate = new Date(value);
  const today = new Date(now);
  candidate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return candidate.getTime() > today.getTime();
}

export function mealIndex(type: MealType) {
  const index = mealOrder.indexOf(type);
  return index >= 0 ? index : 0;
}

export function isMealSlotInFuture(date: Date, mealType: MealType, now = new Date()) {
  if (isFutureLocalDay(date, now)) return true;
  if (!isSameLocalDay(date, now)) return false;
  return mealIndex(mealType) > mealIndex(mealForCurrentTime(now));
}

export function occurrenceTimeForMealSlot(date: Date, mealType: MealType, now = new Date()) {
  if (isSameLocalDay(date, now) && mealType === mealForCurrentTime(now)) {
    return new Date(now);
  }

  const slot = defaultMealTimes[mealType];
  const occurrence = new Date(date);
  occurrence.setHours(slot.hour, slot.minute, 0, 0);
  return occurrence;
}

export function timestampForMealSlot(date: Date, mealType: MealType, now = new Date()) {
  return occurrenceTimeForMealSlot(date, mealType, now).toISOString();
}

export function previousMealSlot(date: Date, mealType: MealType) {
  const index = mealIndex(mealType);
  if (index > 0) {
    return { date: new Date(date), mealType: mealOrder[index - 1] };
  }
  return { date: shiftLocalDate(date, -1), mealType: mealOrder[mealOrder.length - 1] };
}

export function previousUnloggedMealSlot(
  date: Date,
  mealType: MealType,
  isLogged: (slot: { date: Date; mealType: MealType }) => boolean,
  maxLookbackSlots = mealOrder.length * 7,
) {
  const immediatePrevious = previousMealSlot(date, mealType);
  let candidate = immediatePrevious;

  for (let index = 0; index < maxLookbackSlots; index += 1) {
    if (!isLogged(candidate)) return candidate;
    candidate = previousMealSlot(candidate.date, candidate.mealType);
  }

  // If the recent week is fully logged, keep the flow moving backward one
  // slot so the user can still add another item to an existing meal.
  return immediatePrevious;
}

export function nextMealSlot(date: Date, mealType: MealType, now = new Date()) {
  const index = mealIndex(mealType);
  const candidate = index < mealOrder.length - 1
    ? { date: new Date(date), mealType: mealOrder[index + 1] }
    : { date: shiftLocalDate(date, 1), mealType: mealOrder[0] };

  return isMealSlotInFuture(candidate.date, candidate.mealType, now) ? null : candidate;
}

export function validTimestamp(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function timestampValue(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
