import {
  isMealSlotInFuture,
  mealForCurrentTime,
  nextMealSlot,
  previousMealSlot,
  previousUnloggedMealSlot,
  timestampForMealSlot,
} from './dietDiaryTime';

describe('diet diary meal timing', () => {
  const now = new Date(2026, 7, 8, 14, 42, 18, 0);

  it('uses breakfast, lunch, evening, then dinner through the day', () => {
    expect(mealForCurrentTime(new Date(2026, 7, 8, 8))).toBe('Breakfast');
    expect(mealForCurrentTime(new Date(2026, 7, 8, 13))).toBe('Lunch');
    expect(mealForCurrentTime(new Date(2026, 7, 8, 17))).toBe('Evening');
    expect(mealForCurrentTime(new Date(2026, 7, 8, 20))).toBe('Dinner');
  });

  it('uses the real clock time for the current meal', () => {
    const occurrence = new Date(timestampForMealSlot(now, 'Lunch', now));

    expect(occurrence.getFullYear()).toBe(2026);
    expect(occurrence.getMonth()).toBe(7);
    expect(occurrence.getDate()).toBe(8);
    expect(occurrence.getHours()).toBe(14);
    expect(occurrence.getMinutes()).toBe(42);
    expect(occurrence.getSeconds()).toBe(18);
  });

  it('uses a predictable local meal time when backfilling an older slot', () => {
    const yesterday = new Date(2026, 7, 7, 14, 42);
    const occurrence = new Date(timestampForMealSlot(yesterday, 'Breakfast', now));

    expect(occurrence.getFullYear()).toBe(2026);
    expect(occurrence.getMonth()).toBe(7);
    expect(occurrence.getDate()).toBe(7);
    expect(occurrence.getHours()).toBe(8);
    expect(occurrence.getMinutes()).toBe(30);
  });

  it('starts at the current meal and does not navigate into a later meal', () => {
    expect(isMealSlotInFuture(now, 'Dinner', now)).toBe(true);
    expect(nextMealSlot(now, 'Lunch', now)).toBeNull();

    const previous = previousMealSlot(now, 'Lunch');
    expect(previous.mealType).toBe('Breakfast');
    expect(previous.date.getDate()).toBe(8);
  });

  it('moves from breakfast to the previous day dinner', () => {
    const previous = previousMealSlot(now, 'Breakfast');

    expect(previous.mealType).toBe('Dinner');
    expect(previous.date.getDate()).toBe(7);
  });

  it('keeps backward navigation chronological after midnight', () => {
    const afterMidnight = new Date(2026, 7, 8, 1, 15);

    expect(isMealSlotInFuture(afterMidnight, 'Lunch', afterMidnight)).toBe(true);
    const previous = previousMealSlot(afterMidnight, 'Breakfast');
    expect(previous.mealType).toBe('Dinner');
    expect(previous.date.getDate()).toBe(7);
  });

  it('moves to the closest earlier meal that has not been logged', () => {
    const dinner = new Date(2026, 7, 8, 22, 16);
    const previousMissed = previousUnloggedMealSlot(
      dinner,
      'Dinner',
      (slot) => slot.mealType === 'Evening',
    );

    expect(previousMissed.mealType).toBe('Lunch');
    expect(previousMissed.date.getDate()).toBe(8);
  });

  it('moves across midnight when every earlier meal today is logged', () => {
    const breakfast = new Date(2026, 7, 8, 8, 30);
    const previousMissed = previousUnloggedMealSlot(
      breakfast,
      'Breakfast',
      () => false,
    );

    expect(previousMissed.mealType).toBe('Dinner');
    expect(previousMissed.date.getDate()).toBe(7);
  });
});
