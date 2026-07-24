import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = {
  data?: T;
  error?: unknown;
  promise?: Promise<T>;
  updatedAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'formbae_cache_v1:';
const cache = new Map<string, CacheEntry<unknown>>();

export function peekCachedResource<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry?.data !== undefined ? (entry.data as T) : null;
}

async function readPersistedResource<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || parsed.data === undefined || !parsed.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistResource<T>(key: string, entry: CacheEntry<T>) {
  AsyncStorage.setItem(
    `${STORAGE_PREFIX}${key}`,
    JSON.stringify({ data: entry.data, updatedAt: entry.updatedAt }),
  ).catch(() => undefined);
}

function removePersistedResource(key: string) {
  AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`).catch(() => undefined);
}

export function setCachedResource<T>(key: string, data: T) {
  const entry = { data, updatedAt: Date.now() };
  cache.set(key, entry);
  persistResource(key, entry);
}

export function invalidateCachedResource(keyPrefix?: string) {
  if (!keyPrefix) {
    cache.clear();
    AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(STORAGE_PREFIX))))
      .catch(() => undefined);
    return;
  }
  Array.from(cache.keys()).forEach((key) => {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      cache.delete(key);
      removePersistedResource(key);
    }
  });
  AsyncStorage.getAllKeys()
    .then((keys) =>
      AsyncStorage.multiRemove(
        keys.filter((key) => key === `${STORAGE_PREFIX}${keyPrefix}` || key.startsWith(`${STORAGE_PREFIX}${keyPrefix}:`)),
      ),
    )
    .catch(() => undefined);
}

export async function getCachedResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (!options.force && existing?.data !== undefined && now - existing.updatedAt < ttlMs) {
    return existing.data;
  }
  if (!options.force && existing?.promise) {
    return existing.promise;
  }
  if (!options.force && existing?.data !== undefined && now - existing.updatedAt < STALE_TTL_MS) {
    const promise = loader()
      .then((data) => {
        const next = { data, updatedAt: Date.now() };
        cache.set(key, next);
        persistResource(key, next);
        return data;
      })
      .catch((error) => {
        cache.set(key, { data: existing.data, error, updatedAt: existing.updatedAt });
        throw error;
      });
    cache.set(key, { data: existing.data, promise, updatedAt: existing.updatedAt });
    promise.catch(() => undefined);
    return existing.data;
  }

  const persisted = !options.force && existing?.data === undefined ? await readPersistedResource<T>(key) : null;
  if (persisted?.data !== undefined) {
    cache.set(key, { data: persisted.data, updatedAt: persisted.updatedAt });
    if (now - persisted.updatedAt < ttlMs) return persisted.data;
    if (now - persisted.updatedAt < STALE_TTL_MS) {
      const promise = loader()
        .then((data) => {
          const next = { data, updatedAt: Date.now() };
          cache.set(key, next);
          persistResource(key, next);
          return data;
        })
        .catch((error) => {
          cache.set(key, { data: persisted.data, error, updatedAt: persisted.updatedAt });
          throw error;
        });
      cache.set(key, { data: persisted.data, promise, updatedAt: persisted.updatedAt });
      promise.catch(() => undefined);
      return persisted.data;
    }
  }

  const promise = loader()
    .then((data) => {
      const next = { data, updatedAt: Date.now() };
      cache.set(key, next);
      persistResource(key, next);
      return data;
    })
    .catch((error) => {
      cache.set(key, { error, updatedAt: Date.now() });
      throw error;
    });

  cache.set(key, { data: existing?.data ?? persisted?.data, promise, updatedAt: existing?.updatedAt ?? persisted?.updatedAt ?? 0 });
  return promise;
}

export async function getStaleCachedResource<T>(key: string, maxAgeMs = STALE_TTL_MS): Promise<T | null> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing?.data !== undefined && now - existing.updatedAt < maxAgeMs) return existing.data;
  const persisted = await readPersistedResource<T>(key);
  if (persisted?.data !== undefined && now - persisted.updatedAt < maxAgeMs) {
    cache.set(key, persisted);
    return persisted.data;
  }
  return null;
}
