import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchProgress, logProgress } from './progressService';

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('progress measurement persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('removes the durable queue item only after the server confirms the record', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      ok: true,
      entry: { entryId: 'body-1', date: '2026-08-14', weight: '80', chest: '', waist: '', biceps: '' },
    }));

    const result = await logProgress({ weight: '80' });

    expect(result.synced).toBe(true);
    expect(await AsyncStorage.getItem('formbae_pending_body_logs_v1')).toBe('[]');
  });

  it('keeps a measurement on-device when the network request fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));

    const result = await logProgress({ waist: '90.5' });
    const queued = JSON.parse((await AsyncStorage.getItem('formbae_pending_body_logs_v1')) || '[]') as Array<{ waist: string }>;

    expect(result.synced).toBe(false);
    expect(queued).toHaveLength(1);
    expect(queued[0].waist).toBe('90.5');
  });

  it('rejects invalid measurements before they enter the queue', async () => {
    await expect(logProgress({ weight: 'not-a-number' })).rejects.toThrow('Weight must be between 20 and 500.');
    expect(await AsyncStorage.getItem('formbae_pending_body_logs_v1')).toBeNull();
  });

  it('reconstructs trophies from durable activity when an older API omits them', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      adherencePct: 67,
      completed: 2,
      planned: 3,
      currentStreak: 2,
      bestStreak: 2,
      completionHistory: [{ date: '2026-08-13' }, { date: '2026-08-14' }],
      bodyTrend: [],
      weeklyReview: { stats: { mealsLogged: 8 } },
    }));

    const progress = await fetchProgress();

    expect(progress.trophies?.score).toBe(12);
    expect(progress.trophies?.workoutCount).toBe(2);
    expect(progress.trophies?.starCount).toBe(8);
  });
});
