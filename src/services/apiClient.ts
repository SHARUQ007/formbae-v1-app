import { configureMonitoring, observeApiResult } from './monitoringService';
import { API_PREFIX, getBackendApiBaseUrl } from '../constants/config';

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  isNetwork: boolean;

  constructor(message: string, status: number, payload?: unknown, isNetwork = false) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.isNetwork = isNetwork;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const inflightGetRequests = new Map<string, Promise<unknown>>();
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  configureMonitoring(token);
}

export function getAuthToken() {
  return authToken;
}

export function getApiUrl(path: string) {
  return `${getBackendApiBaseUrl()}${API_PREFIX}${path}`;
}

export function getDirectApiUrl(path: string) {
  return `${getBackendApiBaseUrl()}${API_PREFIX}${path}`;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function cancellationError() {
  const error = new Error('Request cancelled.');
  error.name = 'AbortError';
  return error;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw cancellationError();
}

function sleep(ms: number, signal?: AbortSignal) {
  throwIfCancelled(signal);
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(cancellationError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function doFetch(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal) {
  throwIfCancelled(externalSignal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  externalSignal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    throwIfCancelled(externalSignal);
    return { response, text };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

async function performApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = getApiUrl(path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = options.token !== undefined ? options.token : authToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  };

  const maxRetries = options.retries ?? (method === 'GET' ? DEFAULT_RETRIES : 0);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfCancelled(options.signal);
    let response: Response;
    let text: string;
    try {
      ({ response, text } = await doFetch(url, init, timeoutMs, options.signal));
    } catch (error) {
      throwIfCancelled(options.signal);
      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = new ApiError(
        aborted ? 'Request timed out. Check your connection.' : 'Network error. Check your connection and API URL.',
        0,
        undefined,
        true,
      );
      if (attempt < maxRetries) {
        await sleep(400 * (attempt + 1), options.signal);
        continue;
      }
      throw lastError;
    }

    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.status === 401) {
      if (token && token === authToken) onUnauthorized?.();
      throw new ApiError('Session expired. Please log in again.', 401, payload);
    }

    if (response.status >= 500 && attempt < maxRetries) {
      lastError = new ApiError(`Server error (${response.status})`, response.status, payload);
      await sleep(400 * (attempt + 1), options.signal);
      continue;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : payload && typeof payload === 'object' && 'detail' in payload
            ? String((payload as { detail: unknown }).detail)
          : response.status === 404
            ? 'App connection is using an old API URL. Please update and try again.'
          : `Request failed (${response.status})`;
      throw new ApiError(message, response.status, payload);
    }

    return payload as T;
  }

  throw lastError ?? new ApiError('Request failed', 0, undefined, true);
}

async function measuredRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const started = Date.now();
  const owner = options.token !== undefined ? options.token : authToken;
  try {
    const result = await performApiRequest<T>(path, options);
    observeApiResult(path, Date.now() - started, 200, owner);
    return result;
  } catch (error) {
    if (!options.signal?.aborted) observeApiResult(path, Date.now() - started, error instanceof ApiError ? error.status : 0, owner);
    throw error;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const token = options.token !== undefined ? options.token : authToken;
  const canDedupe = method === 'GET' && !options.signal;
  const dedupeKey = canDedupe
    ? JSON.stringify([token, getApiUrl(path), options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.retries ?? DEFAULT_RETRIES])
    : '';
  if (dedupeKey) {
    const existing = inflightGetRequests.get(dedupeKey);
    if (existing) return existing as Promise<T>;
    const promise = measuredRequest<T>(path, options).finally(() => {
      inflightGetRequests.delete(dedupeKey);
    });
    inflightGetRequests.set(dedupeKey, promise);
    return promise;
  }
  return measuredRequest<T>(path, options);
}
