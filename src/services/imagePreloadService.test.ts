import { Image } from 'react-native';
import { preloadImageSources } from './imagePreloadService';

afterEach(() => jest.restoreAllMocks());

test('limits concurrent downloads across batches and shares duplicate pending images', async () => {
  jest.spyOn(Image, 'resolveAssetSource').mockImplementation(source => source as ReturnType<typeof Image.resolveAssetSource>);
  let active = 0;
  let peak = 0;
  const finish: Array<() => void> = [];
  const prefetch = jest.spyOn(Image, 'prefetch').mockImplementation(() => new Promise(resolve => {
    active += 1;
    peak = Math.max(peak, active);
    finish.push(() => { active -= 1; resolve(true); });
  }));
  const sources = Array.from({ length: 8 }, (_, index) => ({ uri: `https://example.com/${index}.jpg` }));
  const first = preloadImageSources(sources.slice(0, 6));
  const second = preloadImageSources(sources.slice(4));
  expect(prefetch).toHaveBeenCalledTimes(4);
  for (let index = 0; index < 8; index += 1) {
    finish[index]();
    // Allow each completion to release its slot and start the next queued source.
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  const results = await Promise.all([first, second]);
  expect(prefetch).toHaveBeenCalledTimes(8);
  expect(peak).toBe(4);
  expect(results.flat().every(result => result.status === 'fulfilled')).toBe(true);
});

test('a failed image releases its slot and can be retried', async () => {
  jest.spyOn(Image, 'resolveAssetSource').mockImplementation(source => source as ReturnType<typeof Image.resolveAssetSource>);
  const prefetch = jest.spyOn(Image, 'prefetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  jest.spyOn(Image, 'getSize').mockImplementationOnce(() => { throw new Error('offline'); });
  const sources = Array.from({ length: 6 }, (_, index) => ({ uri: `https://example.com/retry-${index}.jpg` }));
  const results = await preloadImageSources(sources);
  expect(results[0].status).toBe('rejected');
  expect(results.slice(1).every(result => result.status === 'fulfilled')).toBe(true);
  await expect(preloadImageSources([sources[0]])).resolves.toEqual([{ status: 'fulfilled', value: true }]);
  expect(prefetch).toHaveBeenCalledTimes(7);
});
