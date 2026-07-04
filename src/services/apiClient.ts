import { API_PREFIX, getApiBaseUrl } from '../constants/config';

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

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function getApiUrl(path: string) {
  return `${getApiBaseUrl()}${API_PREFIX}${path}`;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

async function doFetch(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.onabort = () => {
        controller.abort();
      };
    }
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = getApiUrl(path);
  const method = options.method || 'GET';
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
    let response: Response;
    try {
      response = await doFetch(url, init, timeoutMs, options.signal);
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = new ApiError(
        aborted ? 'Request timed out. Check your connection.' : 'Network error. Check your connection and API URL.',
        0,
        undefined,
        true,
      );
      if (attempt < maxRetries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.status === 401) {
      onUnauthorized?.();
      throw new ApiError('Session expired. Please log in again.', 401, payload);
    }

    if (response.status >= 500 && attempt < maxRetries) {
      lastError = new ApiError(`Server error (${response.status})`, response.status, payload);
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Request failed (${response.status})`;
      throw new ApiError(message, response.status, payload);
    }

    return payload as T;
  }

  throw lastError ?? new ApiError('Request failed', 0, undefined, true);
}
