import { fetchDietDiary } from './dietDiaryService';
import { fetchProgress } from './progressService';

function response(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

const reportLoaders = [
  { name: 'progress dashboard', load: fetchProgress, payload: { trophies: { score: 0 } }, timeout: 30000 },
  { name: 'diet report', load: fetchDietDiary, payload: { entries: [], feedback: undefined }, timeout: 420000 },
];

describe.each(reportLoaders)('$name loading', ({ load, payload, timeout }) => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('accepts a response within its loading deadline', async () => {
    let finish!: (result: Response) => void;
    let signal!: AbortSignal;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((resolve, reject) => {
      finish = resolve;
      signal = options!.signal!;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }));
    const outcome = load().then(value => ({ value }), error => ({ error }));

    await jest.advanceTimersByTimeAsync(timeout - 1000);

    expect(signal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(response(payload));
    expect(await outcome).toEqual({ value: payload });
  });

  it('times out at its deadline without starting another request', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }));
    const outcome = load().then(value => ({ value }), error => ({ error }));

    await jest.advanceTimersByTimeAsync(timeout);

    expect(await outcome).toEqual({ error: expect.objectContaining({ isNetwork: true, message: 'Request timed out. Check your connection.' }) });
    await jest.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
