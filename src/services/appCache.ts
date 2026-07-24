type CacheEntry<T> = {
  data?: T;
  error?: unknown;
  promise?: Promise<T>;
  updatedAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry<unknown>>();

export function peekCachedResource<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry?.data !== undefined ? (entry.data as T) : null;
}

export function setCachedResource<T>(key: string, data: T) {
  cache.set(key, { data, updatedAt: Date.now() });
}

export function invalidateCachedResource(keyPrefix?: string) {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  Array.from(cache.keys()).forEach((key) => {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      cache.delete(key);
    }
  });
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

  const promise = loader()
    .then((data) => {
      cache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      cache.set(key, { error, updatedAt: Date.now() });
      throw error;
    });

  cache.set(key, { data: existing?.data, promise, updatedAt: existing?.updatedAt ?? 0 });
  return promise;
}
