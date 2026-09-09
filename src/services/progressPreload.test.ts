import { loadProgressBundleCached } from './preloadService';
import * as progressService from './progressService';
import { setCacheSession } from './appCache';
import type { ProgressSummary } from '../types/api';

test('slow pending measurement uploads do not block the Progress dashboard', async () => {
  setCacheSession('progress-loading', 'progress-loading');
  let finish!: (value: { synced: number; remaining: number }) => void;
  const upload = jest.spyOn(progressService, 'flushPendingProgressLogs').mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const progress: ProgressSummary = { userId: 'progress-loading', completed: 2, planned: 3, adherencePct: 67, currentStreak: 1, bestStreak: 1 };
  const fetch = jest.spyOn(progressService, 'fetchProgress').mockResolvedValue(progress);
  try {
    const result = await loadProgressBundleCached({ force: true });
    expect(result.progress).toBe(progress);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    finish({ synced: 0, remaining: 1 });
    jest.restoreAllMocks();
    setCacheSession(null);
  }
});
