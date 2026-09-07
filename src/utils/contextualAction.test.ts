import type { DietDiaryEntry } from '../store/dietDiaryStore';
import { resolveTargetFromSnapshot, shouldOfferMealTask } from './contextualAction';

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

  it('routes a user with diary history but no plan to their first workout', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 7, 23, 30));
    const target = resolveTargetFromSnapshot({
      workoutData: null,
      dietEntries: [entry({ createdAt: new Date(2026, 8, 6, 12, 0).toISOString() })],
    });
    expect(target).toMatchObject({ kind: 'workout', detail: 'First workout' });
  });
});
