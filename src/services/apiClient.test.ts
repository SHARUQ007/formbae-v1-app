import { apiRequest, setAuthToken, setUnauthorizedHandler } from './apiClient';
import { observeApiResult } from './monitoringService';

jest.mock('./monitoringService', () => ({ configureMonitoring: jest.fn(), observeApiResult: jest.fn() }));

const originalFetch = globalThis.fetch;
const response = (status = 200, data: unknown = { ok: true }) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(data) } as Response);
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setAuthToken('current');
  globalThis.fetch = jest.fn();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

it('never sends an already cancelled request or records it as a network failure', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(apiRequest('/cancelled', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
  expect(observeApiResult).not.toHaveBeenCalled();
});

it('cancels every request sharing a signal without overwriting existing listeners or retrying', async () => {
  const controller = new AbortController();
  const existing = jest.fn();
  controller.signal.onabort = existing;
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  jest.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  }));
  const first = apiRequest('/one', { signal: controller.signal });
  const second = apiRequest('/two', { signal: controller.signal });
  const result = Promise.allSettled([first, second]);
  controller.abort();
  expect(await result).toEqual([
    { status: 'rejected', reason: expect.objectContaining({ name: 'AbortError' }) },
    { status: 'rejected', reason: expect.objectContaining({ name: 'AbortError' }) },
  ]);
  expect(existing).toHaveBeenCalledTimes(1);
  expect(controller.signal.onabort).toBe(existing);
  expect(remove).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

it('stops retry backoff immediately when cancelled', async () => {
  const controller = new AbortController();
  jest.mocked(fetch).mockResolvedValue(response(503));
  const request = apiRequest('/backoff', { signal: controller.signal });
  const rejected = request.catch(error => error);
  await jest.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  controller.abort();
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  await jest.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('keeps the timeout active while the response body is downloading', async () => {
  jest.mocked(fetch).mockImplementation(async (_url, init) => ({
    ...response(),
    text: () => new Promise<string>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
    }),
  }));
  const rejected = apiRequest('/slow-body', { timeoutMs: 100, retries: 0 }).catch(error => error);
  await jest.advanceTimersByTimeAsync(100);
  expect(await rejected).toMatchObject({ isNetwork: true, message: 'Request timed out. Check your connection.' });
  expect(jest.getTimerCount()).toBe(0);
});

it('retries a transient server failure and cleans up signal listeners on success', async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  jest.mocked(fetch).mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response());
  const request = apiRequest('/recover', { signal: controller.signal });
  await jest.advanceTimersByTimeAsync(400);
  await expect(request).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(3); // Both attempts and the backoff listener.
  expect(jest.getTimerCount()).toBe(0);
});

it('deduplicates identical GET requests without merging different retry policies', async () => {
  const finishes: ((value: Response) => void)[] = [];
  jest.mocked(fetch).mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
  const reads = [apiRequest('/shared'), apiRequest('/shared', { method: 'get' }), apiRequest('/shared', { retries: 0 })];
  expect(fetch).toHaveBeenCalledTimes(2);
  finishes.forEach(finish => finish(response()));
  await expect(Promise.all(reads)).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
});

it('does not sign out a new account when an earlier account request returns 401', async () => {
  const logout = jest.fn();
  setUnauthorizedHandler(logout);
  let finish!: (value: Response) => void;
  jest.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const old = apiRequest('/late-unauthorized');
  setAuthToken('new-account');
  finish(response(401));
  await expect(old).rejects.toMatchObject({ status: 401 });
  expect(logout).not.toHaveBeenCalled();
  jest.mocked(fetch).mockResolvedValue(response(401));
  await expect(apiRequest('/current-unauthorized')).rejects.toMatchObject({ status: 401 });
  expect(logout).toHaveBeenCalledTimes(1);
  await expect(apiRequest('/public-unauthorized', { token: null })).rejects.toMatchObject({ status: 401 });
  expect(logout).toHaveBeenCalledTimes(1);
});
