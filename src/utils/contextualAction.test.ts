import type { DietDiaryEntry } from '../store/dietDiaryStore';
import {
  resolveTargetFromSnapshot,
  shouldOfferAccountabilityFoodShortcut,
  shouldOfferMealTask,
  suggestedMealToLog,
} from './contextualAction';

function entry(overrides: Partial<DietDiaryEntry> = {}): DietDiaryEntry {
  return {
    id: 'entry-1',
    kind: 'text',
    createdAt: '2026-09-07T12:00:00.000Z',
    mealType: 'Lunch',
    storedLocally: false,
    ...overrides,
  };
}

describe('contextual first-use states', () => {
  afterEach(() => jest.useRealTimers());

  it('offers a first meal even outside the normal meal window', () => {
    expect(shouldOfferMealTask([], new Date(2026, 8, 7, 2, 0))).toBe(true);
  });

  it('does not treat a skipped meal as diary history', () => {
    expect(shouldOfferMealTask([
      entry({ kind: 'skip', status: 'skipped' }),
    ], new Date(2026, 8, 7, 2, 0))).toBe(true);
  });

  it('does not add a second food shortcut while a diet commitment is active', () => {
    expect(shouldOfferAccountabilityFoodShortcut(
      [],
      'diet',
      new Date(2026, 8, 7, 13, 0),
    )).toBe(false);
  });

  it('keeps one food shortcut available when the active commitment is unrelated', () => {
    expect(shouldOfferAccountabilityFoodShortcut(
      [],
      'workout',
      new Date(2026, 8, 7, 13, 0),
    )).toBe(true);
  });

  it('offers dinner late at night even with diary history and no plan', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 7, 23, 30));
    const target = resolveTargetFromSnapshot({
      workoutData: null,
      dietEntries: [entry({ createdAt: new Date(2026, 8, 6, 12, 0).toISOString() })],
    });
    expect(target).toMatchObject({ kind: 'diet', mealType: 'Dinner' });
  });

  it('offers breakfast before 5 a.m. regardless of historical food logs', () => {
    expect(suggestedMealToLog([entry({ createdAt: new Date(2026, 8, 6, 12).toISOString() })], new Date(2026, 8, 7, 4, 17))).toBe('Breakfast');
  });

  it('suggests the most recent earlier gap when the current meal is logged', () => {
    const now = new Date(2026, 8, 7, 20);
    const logged = ['Dinner', 'Lunch'].map(mealType => entry({ mealType: mealType as DietDiaryEntry['mealType'], createdAt: now.toISOString() }));
    expect(suggestedMealToLog(logged, now)).toBe('Evening');
    expect(suggestedMealToLog([...logged, entry({ mealType: 'Evening', createdAt: now.toISOString() })], now)).toBe('Breakfast');
  });

  it('waits for the next meal once all elapsed slots are logged and resets on a new day', () => {
    const morning = new Date(2026, 8, 7, 10, 59);
    const breakfast = entry({ mealType: 'Breakfast', createdAt: morning.toISOString() });
    expect(suggestedMealToLog([breakfast], morning)).toBeUndefined();
    expect(suggestedMealToLog([breakfast], new Date(2026, 8, 7, 11))).toBe('Lunch');
    const fullDay = ['Breakfast', 'Lunch', 'Evening', 'Dinner'].map(mealType => entry({ mealType: mealType as DietDiaryEntry['mealType'], createdAt: morning.toISOString() }));
    expect(shouldOfferMealTask(fullDay, new Date(2026, 8, 7, 23, 30))).toBe(false);
    expect(suggestedMealToLog(fullDay, new Date(2026, 8, 8, 0, 1))).toBe('Breakfast');
  });
});
