import { Image } from 'react-native';
import RNFS from 'react-native-fs';
import { cacheBundledImage, cachedBundledImage, invalidateBundledImage } from './bundledImageCache';

jest.mock('@react-native/assets-registry/registry', () => ({ getAssetByID: (id: number) => ({ hash: `asset${id}`, type: 'jpg' }) }));
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache', mkdir: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]), exists: jest.fn().mockResolvedValue(false),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200, bytesWritten: 100 }) })),
  moveFile: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Image, 'resolveAssetSource').mockImplementation(source => ({ uri: `http://localhost:8081/${source}.jpg`, width: 800, height: 600, scale: 2 }));
});
afterEach(() => jest.restoreAllMocks());
test('shares bundled downloads and renders a content-addressed local file after warmup', async () => {
  const [first, second] = await Promise.all([cacheBundledImage(100), cacheBundledImage(100)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ uri: 'file:///cache/bundled-artwork-v1/asset100-2.jpg' });
  expect(RNFS.downloadFile).toHaveBeenCalledTimes(1);
  expect(cachedBundledImage(100)).toEqual(first);
  invalidateBundledImage(100);
  expect(cachedBundledImage(100)).toBe(100);
});
test('leaves private and public remote URLs and packaged file assets alone', async () => {
  const remote = { uri: 'https://api.test/photo', headers: { Authorization: 'Bearer test' } };
  expect(await cacheBundledImage(remote)).toBe(remote);
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({uri:'file:///bundle/art.jpg',width:100,height:100,scale:1});
  expect(await cacheBundledImage(101)).toBe(101);
  expect(RNFS.downloadFile).not.toHaveBeenCalled();
});
test('falls back on download failure and allows a later retry', async () => {
  jest.mocked(RNFS.downloadFile).mockReturnValueOnce({jobId:1,promise:Promise.resolve({jobId:1,statusCode:503,bytesWritten:0})});
  expect(await cacheBundledImage(102)).toBe(102);
  expect(cachedBundledImage(102)).toBe(102);
  expect(RNFS.unlink).toHaveBeenCalledWith('/cache/bundled-artwork-v1/asset102-2.jpg.download');
  expect(await cacheBundledImage(102)).toMatchObject({uri:'file:///cache/bundled-artwork-v1/asset102-2.jpg'});
});
test('reuses a file from a previous launch without downloading it again', async () => {
  jest.mocked(RNFS.exists).mockResolvedValueOnce(true);
  expect(await cacheBundledImage(103)).toMatchObject({uri:'file:///cache/bundled-artwork-v1/asset103-2.jpg'});
  expect(RNFS.downloadFile).not.toHaveBeenCalled();
});
