import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedResource, getStaleCachedResource, invalidateCachedResource, peekCachedResource, setCachedResource, setCacheSession } from './appCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  setCacheSession('token', expect.getState().currentTestName);
  invalidateCachedResource();
});

test('cold concurrent reads use one loader', async () => {
  const pending = deferred<string>();
  const loader = jest.fn(() => pending.promise);
  const first = getCachedResource('profile', loader);
  const second = getCachedResource('profile', loader);
  pending.resolve('ready');
  expect(await Promise.all([first, second])).toEqual(['ready', 'ready']);
  expect(loader).toHaveBeenCalledTimes(1);
});
test('older response cannot overwrite a forced refresh', async () => {
  const pending = deferred<string>();
  const old = getCachedResource('profile', () => pending.promise, { force: true });
  await getCachedResource('profile', async () => 'new', { force: true });
  pending.resolve('old');
  await old;
  expect(peekCachedResource('profile')).toBe('new');
});
test('invalidation during fetch cannot resurrect cached data', async () => {
  const pending = deferred<string>();
  const old = getCachedResource('profile', () => pending.promise, { force: true });
  invalidateCachedResource('profile');
  pending.resolve('old');
  await old;
  expect(peekCachedResource('profile')).toBeNull();
  expect(await getStaleCachedResource('profile')).toBeNull();
});
test('session switch isolates in-flight results', async () => {
  const pending = deferred<string>();
  const old = getCachedResource('profile', () => pending.promise, { force: true });
  setCacheSession('second', 'other-account');
  pending.resolve('private-first-account');
  await old;
  expect(peekCachedResource('profile')).toBeNull();
});
test('failed refresh preserves previous usable data', async () => {
  setCachedResource('profile', 'saved');
  await expect(getCachedResource('profile', async () => { throw new Error('offline'); }, { force: true })).rejects.toThrow('offline');
  expect(peekCachedResource('profile')).toBe('saved');
});
test('invalidation cannot repopulate from an older disk read', async () => {
  // Drain pending storage work before holding a disk read open.
  await getStaleCachedResource('unused');
  const disk = deferred<string>();
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => disk.promise);
  const old = getStaleCachedResource('profile');
  await Promise.resolve();
  invalidateCachedResource('profile');
  disk.resolve(JSON.stringify({ data: 'old', updatedAt: Date.now() }));
  expect(await old).toBeNull();
  expect(peekCachedResource('profile')).toBeNull();
});
