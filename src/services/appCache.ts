import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = {
  data?: T;
  error?: unknown;
  promise?: Promise<T>;
  updatedAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'formbae_cache_v2:';
const cache = new Map<string, CacheEntry<unknown>>();
let cacheSession = 'signed-out';

function hashSession(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) + value.charCodeAt(index)) % 2147483647;
  }
  return hash.toString(36);
}

export function getCacheSessionId(token: string | null | undefined, userId?: string | null) {
  const stableIdentity = String(userId || '').trim();
  const identity = stableIdentity || token;
  return identity ? `user-${hashSession(identity)}` : 'signed-out';
}

export function setCacheSession(token: string | null | undefined, userId?: string | null) {
  cacheSession = getCacheSessionId(token, userId);
}

/**
 * Identifies the cache namespace currently in use without exposing the token.
 * Startup warm-up uses this to ensure a new login can never inherit another
 * user's in-flight preload.
 */
export function getActiveCacheSessionId() {
  return cacheSession;
}

function scopedKey(key: string, session = cacheSession) {
  return `${session}:${key}`;
}

export function peekCachedResource<T>(key: string): T | null {
  const entry = cache.get(scopedKey(key));
  return entry?.data !== undefined ? (entry.data as T) : null;
}

async function readPersistedResource<T>(key: string, session = cacheSession): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${scopedKey(key, session)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || parsed.data === undefined || !parsed.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistResource<T>(key: string, entry: CacheEntry<T>, session = cacheSession) {
  AsyncStorage.setItem(
    `${STORAGE_PREFIX}${scopedKey(key, session)}`,
    JSON.stringify({ data: entry.data, updatedAt: entry.updatedAt }),
  ).catch(() => undefined);
}

export function setCachedResource<T>(key: string, data: T) {
  const session = cacheSession;
  const entry = { data, updatedAt: Date.now() };
  cache.set(scopedKey(key, session), entry);
  persistResource(key, entry, session);
}

export function invalidateCachedResource(keyPrefix?: string) {
  if (!keyPrefix) {
    cache.clear();
    AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(STORAGE_PREFIX))))
      .catch(() => undefined);
    return;
  }
  const scopedPrefix = scopedKey(keyPrefix);
  Array.from(cache.keys()).forEach((key) => {
    if (key === scopedPrefix || key.startsWith(`${scopedPrefix}:`)) {
      cache.delete(key);
    }
  });
  AsyncStorage.getAllKeys()
    .then((keys) =>
      AsyncStorage.multiRemove(
        keys.filter((key) => key === `${STORAGE_PREFIX}${scopedPrefix}` || key.startsWith(`${STORAGE_PREFIX}${scopedPrefix}:`)),
      ),
    )
    .catch(() => undefined);
}

export async function getCachedResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const session = cacheSession;
  const memoryKey = scopedKey(key, session);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const existing = cache.get(memoryKey) as CacheEntry<T> | undefined;

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
        cache.set(memoryKey, next);
        persistResource(key, next, session);
        return data;
      })
      .catch((error) => {
        cache.set(memoryKey, { data: existing.data, error, updatedAt: existing.updatedAt });
        throw error;
      });
    cache.set(memoryKey, { data: existing.data, promise, updatedAt: existing.updatedAt });
    promise.catch(() => undefined);
    return existing.data;
  }

  const persisted = !options.force && existing?.data === undefined ? await readPersistedResource<T>(key, session) : null;
  if (persisted?.data !== undefined) {
    cache.set(memoryKey, { data: persisted.data, updatedAt: persisted.updatedAt });
    if (now - persisted.updatedAt < ttlMs) return persisted.data;
    if (now - persisted.updatedAt < STALE_TTL_MS) {
      const promise = loader()
        .then((data) => {
          const next = { data, updatedAt: Date.now() };
          cache.set(memoryKey, next);
          persistResource(key, next, session);
          return data;
        })
        .catch((error) => {
          cache.set(memoryKey, { data: persisted.data, error, updatedAt: persisted.updatedAt });
          throw error;
        });
      cache.set(memoryKey, { data: persisted.data, promise, updatedAt: persisted.updatedAt });
      promise.catch(() => undefined);
      return persisted.data;
    }
  }

  const promise = loader()
    .then((data) => {
      const next = { data, updatedAt: Date.now() };
      cache.set(memoryKey, next);
      persistResource(key, next, session);
      return data;
    })
    .catch((error) => {
      cache.set(memoryKey, { error, updatedAt: Date.now() });
      throw error;
    });

  cache.set(memoryKey, { data: existing?.data ?? persisted?.data, promise, updatedAt: existing?.updatedAt ?? persisted?.updatedAt ?? 0 });
  return promise;
}

export async function getStaleCachedResource<T>(key: string, maxAgeMs = STALE_TTL_MS): Promise<T | null> {
  const session = cacheSession;
  const memoryKey = scopedKey(key, session);
  const now = Date.now();
  const existing = cache.get(memoryKey) as CacheEntry<T> | undefined;
  if (existing?.data !== undefined && now - existing.updatedAt < maxAgeMs) return existing.data;
  const persisted = await readPersistedResource<T>(key, session);
  if (persisted?.data !== undefined && now - persisted.updatedAt < maxAgeMs) {
    cache.set(memoryKey, persisted);
    return persisted.data;
  }
  return null;
}
