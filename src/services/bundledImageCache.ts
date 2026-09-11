import { Image, type ImageSourcePropType, type ImageURISource } from 'react-native';
import RNFS from 'react-native-fs';

// Metro serves require() assets over HTTP in development. Keep those immutable,
// content-addressed assets on device, just as a Release build already does.
const registry = require('@react-native/assets-registry/registry') as {
  getAssetByID(id: number): { hash: string; type: string } | undefined;
};
const directory = `${RNFS.CachesDirectoryPath}/bundled-artwork-v1`;
const ready = new Map<number, ImageURISource>();
const pending = new Map<number, Promise<ImageSourcePropType>>();
let setup: Promise<void> | undefined;

function prepareDirectory() {
  if (!setup) setup = RNFS.mkdir(directory).then(async () => {
    // Old Metro asset revisions need not accumulate between development builds.
    const files = await RNFS.readDir(directory);
    let bytes = files.reduce((sum, file) => sum + Number(file.size), 0);
    for (const file of files.sort((a, b) => Number(a.mtime) - Number(b.mtime))) {
      if (bytes <= 20 * 1024 * 1024) break;
      await RNFS.unlink(file.path);
      bytes -= Number(file.size);
    }
  }).catch(error => { setup = undefined; throw error; });
  return setup;
}

/** Synchronous lookup avoids changing the URI after an image is already visible. */
export function cachedBundledImage(source: ImageSourcePropType | undefined) {
  return typeof source === 'number' ? ready.get(source) || source : source;
}

export async function cacheBundledImage(source: ImageSourcePropType): Promise<ImageSourcePropType> {
  if (typeof source !== 'number') return source;
  if (ready.has(source)) return ready.get(source)!;
  const inFlight = pending.get(source);
  if (inFlight) return inFlight;
  const asset = registry.getAssetByID(source);
  const resolved = Image.resolveAssetSource(source);
  if (!asset || !/^[a-zA-Z0-9_-]+$/.test(asset.hash) || !/^[a-zA-Z0-9]+$/.test(asset.type) || !/^https?:\/\//.test(resolved?.uri || '')) return source;
  // Include density: the same asset hash can have @2x and @3x variants.
  const path = `${directory}/${asset.hash}-${resolved.scale}.${asset.type}`;
  const work = (async () => {
    try {
      await prepareDirectory();
      if (!await RNFS.exists(path)) {
        const temporary = `${path}.download`;
        try {
          const response = await RNFS.downloadFile({ fromUrl: resolved.uri, toFile: temporary, connectionTimeout: 8000, readTimeout: 15000 }).promise;
          if (response.statusCode !== 200 || response.bytesWritten <= 0) throw new Error('Artwork download failed');
          await RNFS.moveFile(temporary, path);
        } catch (error) {
          await RNFS.unlink(temporary).catch(() => undefined);
          throw error;
        }
      }
      const local = { ...resolved, uri: `file://${path}` };
      ready.set(source, local);
      return local;
    } catch {
      // Keep native loading functional if storage or Metro is unavailable.
      return source;
    } finally { pending.delete(source); }
  })();
  pending.set(source, work);
  return work;
}

export function invalidateBundledImage(source: ImageSourcePropType | undefined) {
  if (typeof source !== 'number') return;
  const cached = ready.get(source);
  ready.delete(source);
  if (cached?.uri?.startsWith(`file://${directory}/`)) {
    RNFS.unlink(cached.uri.slice('file://'.length)).catch(() => undefined);
  }
}
