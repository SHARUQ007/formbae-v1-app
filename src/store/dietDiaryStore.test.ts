import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCacheSession } from '../services/appCache';
import {
  addTextDietDiaryEntry,
  addSkippedDietDiaryEntry,
  loadDietDiaryEntries,
  loadRememberedMealTimes,
  mergeRemoteDietDiaryEntries,
  rememberMealTime,
} from './dietDiaryStore';

describe('diet diary persistence', () => {
  beforeEach(async () => {
    setCacheSession(null);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    setCacheSession(null);
  });

  it('keeps multiple foods logged for the same meal and timestamp', async () => {
    const occurrence = '2026-08-08T09:12:00.000Z';

    const first = await addTextDietDiaryEntry('Breakfast', 'Two eggs', occurrence);
    const second = await addTextDietDiaryEntry('Breakfast', 'Two eggs', occurrence);
    const entries = await loadDietDiaryEntries();

    expect(first.id).not.toBe(second.id);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.createdAt === occurrence)).toBe(true);
  });

  it('merges sync retries by record id without collapsing separate foods', async () => {
    const occurrence = '2026-08-08T09:12:00.000Z';
    const first = await addTextDietDiaryEntry('Lunch', 'Rice', occurrence);
    const second = await addTextDietDiaryEntry('Lunch', 'Rice', occurrence);
    const remoteEntries = [
      {
        entryId: 'remote-first',
        clientId: first.id,
        imageUrl: '',
        mealType: 'Lunch' as const,
        note: 'Rice',
        createdAt: occurrence,
      },
      {
        entryId: 'remote-second',
        clientId: second.id,
        imageUrl: '',
        mealType: 'Lunch' as const,
        note: 'Rice',
        createdAt: occurrence,
      },
    ];

    await mergeRemoteDietDiaryEntries(remoteEntries);
    const afterRetry = await mergeRemoteDietDiaryEntries(remoteEntries);

    expect(afterRetry).toHaveLength(2);
    expect(afterRetry.map((entry) => entry.remoteId).sort()).toEqual(['remote-first', 'remote-second']);
  });

  it('keeps legacy snack records visible in the evening section', async () => {
    const entries = await mergeRemoteDietDiaryEntries([
      {
        entryId: 'legacy-snack',
        imageUrl: '',
        mealType: 'Snack',
        note: 'Fruit',
        createdAt: '2026-08-08T12:00:00.000Z',
      },
    ]);

    expect(entries[0].mealType).toBe('Evening');
  });

  it('persists a skipped meal as a separate non-food status', async () => {
    const skipped = await addSkippedDietDiaryEntry('Dinner', '2026-08-08T14:30:00.000Z');
    const entries = await loadDietDiaryEntries();

    expect(skipped.kind).toBe('skip');
    expect(entries[0]).toMatchObject({ mealType: 'Dinner', status: 'skipped' });
    expect(entries[0].note).toBeUndefined();
  });

  it('remembers a meal time for future days', async () => {
    const selected = new Date(2026, 7, 23, 19, 15, 0, 0);

    await rememberMealTime('Dinner', selected);

    await expect(loadRememberedMealTimes()).resolves.toEqual({
      Dinner: { hour: 19, minute: 15 },
    });
  });

  it('keeps local entries isolated when accounts change', async () => {
    setCacheSession('token-a', 'user-a');
    await addTextDietDiaryEntry('Breakfast', 'Oats');
    await rememberMealTime('Breakfast', new Date(2026, 7, 23, 8, 15));

    setCacheSession('token-b', 'user-b');
    await expect(loadDietDiaryEntries()).resolves.toEqual([]);
    await expect(loadRememberedMealTimes()).resolves.toEqual({});

    await addTextDietDiaryEntry('Dinner', 'Rice');
    setCacheSession('new-token-a', 'user-a');
    await expect(loadDietDiaryEntries()).resolves.toEqual([
      expect.objectContaining({ mealType: 'Breakfast', note: 'Oats' }),
    ]);
    await expect(loadRememberedMealTimes()).resolves.toEqual({
      Breakfast: { hour: 8, minute: 15 },
    });
  });
});
