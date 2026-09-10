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
let invalidationVersion = 0;
let storageWrites: Promise<unknown> = Promise.resolve();

function enqueueStorage(operation: () => Promise<unknown>) {
  storageWrites = storageWrites.then(operation, operation).catch(() => undefined);
}

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
    if (!parsed || parsed.data === undefined || (!Number.isFinite(parsed.updatedAt) || parsed.updatedAt <= 0 || parsed.updatedAt > Date.now())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistResource<T>(key: string, entry: CacheEntry<T>, session = cacheSession) {
  const memoryKey = scopedKey(key, session);
  enqueueStorage(async () => {
    if (cache.get(memoryKey) !== entry) return;
    await AsyncStorage.setItem(
      `${STORAGE_PREFIX}${memoryKey}`,
      JSON.stringify({ data: entry.data, updatedAt: entry.updatedAt }),
    );
  });
}

export function setCachedResource<T>(key: string, data: T) {
  const session = cacheSession;
  const entry = { data, updatedAt: Date.now() };
  cache.set(scopedKey(key, session), entry);
  persistResource(key, entry, session);
}

export function invalidateCachedResource(keyPrefix?: string) {
  invalidationVersion += 1;
  const prefix = keyPrefix ? scopedKey(keyPrefix) : null;
  const matches = (key: string) => !prefix || key === prefix || key.startsWith(`${prefix}:`);
  for (const key of cache.keys()) {
    if (matches(key)) cache.delete(key);
  }
  // Serialize deletion with writes, so a slow invalidation cannot erase fresh data.
  enqueueStorage(async () => {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(STORAGE_PREFIX)
      && matches(key.slice(STORAGE_PREFIX.length))));
  });
}

export async function getCachedResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const session = cacheSession;
  const memoryKey = scopedKey(key, session);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const existing = cache.get(memoryKey) as CacheEntry<T> | undefined;
  if (!options.force && existing?.data !== undefined && Date.now() - existing.updatedAt < ttlMs) {
    return existing.data;
  }
  if (!options.force && existing?.promise) return existing.promise;

  const entry: CacheEntry<T> = { data: existing?.data, updatedAt: existing?.updatedAt ?? 0 };
  // Own the slot before disk hydration or network work: cold reads also deduplicate.
  cache.set(memoryKey, entry);
  const refresh = async () => {
    try {
      const data = await loader();
      if (cache.get(memoryKey) === entry) {
        const next = { data, updatedAt: Date.now() };
        cache.set(memoryKey, next);
        persistResource(key, next, session);
      }
      return data;
    } catch (error) {
      if (cache.get(memoryKey) === entry) {
        cache.set(memoryKey, { data: entry.data, updatedAt: entry.updatedAt, error });
      }
      throw error;
    }
  };
  const load = async () => {
    if (!options.force && entry.data === undefined) {
      await storageWrites;
      const persisted = await readPersistedResource<T>(key, session);
      if (persisted) {
        entry.data = persisted.data;
        entry.updatedAt = persisted.updatedAt;
      }
    }
    if (!options.force && entry.data !== undefined) {
      const age = Date.now() - entry.updatedAt;
      if (age < ttlMs) {
        entry.promise = undefined;
        return entry.data;
      }
      if (age < STALE_TTL_MS) {
        entry.promise = refresh();
        entry.promise.catch(() => undefined);
        return entry.data;
      }
    }
    return refresh();
  };
  entry.promise = Promise.resolve().then(load);
  return entry.promise;
}

export async function getStaleCachedResource<T>(key: string, maxAgeMs = STALE_TTL_MS): Promise<T | null> {
  const session = cacheSession;
  const memoryKey = scopedKey(key, session);
  const now = Date.now();
  const version = invalidationVersion;
  const existing = cache.get(memoryKey) as CacheEntry<T> | undefined;
  if (existing?.data !== undefined && now - existing.updatedAt < maxAgeMs) return existing.data;
  await storageWrites;
  const persisted = await readPersistedResource<T>(key, session);
  if (version !== invalidationVersion) return null;
  if (cache.get(memoryKey) !== existing) return (cache.get(memoryKey)?.data as T | undefined) ?? null;
  if (persisted?.data !== undefined && now - persisted.updatedAt < maxAgeMs) {
    cache.set(memoryKey, persisted);
    return persisted.data;
  }
  return null;
}
