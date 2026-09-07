import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadToken, login as loginRequest, logout as logoutRequest } from '../services/authService';
import { fetchUserStatus } from '../services/statusService';
import { setUnauthorizedHandler } from '../services/apiClient';
import { registerForRemotePush, syncReminders } from '../services/notificationService';
import { getCacheSessionId, invalidateCachedResource, setCacheSession } from '../services/appCache';
import { preloadMainAppData } from '../services/preloadService';
import { flushWorkoutQueue } from '../store/workoutStore';
import type { SessionUser, UserStatus } from '../types/api';

const STATUS_CACHE_PREFIX = 'formbae_auth_status_v2:';
let initializedUserId = '';
let mainPreloadedUserId = '';
let statusRefreshInFlight: { token: string; promise: Promise<UserStatus> } | null = null;

function statusCacheKey(token: string) {
  return `${STATUS_CACHE_PREFIX}${getCacheSessionId(token)}`;
}

function runPostAuthInit(status: UserStatus) {
  if (initializedUserId !== status.userId) {
    initializedUserId = status.userId;
    // Fire-and-forget; never blocks or breaks the UI.
    flushWorkoutQueue().catch(() => undefined);
    registerForRemotePush().catch(() => undefined);
    syncReminders({
      workoutReminders: true,
      weeklyCheckInReminders: true,
      trainerMessageReminders: true,
    }).catch(() => undefined);
  }
  // A user can move from setup to home without passing through Splash. Warm
  // main data exactly once when that transition becomes visible.
  if (status.recommendedNextScreen === 'home' && mainPreloadedUserId !== status.userId) {
    mainPreloadedUserId = status.userId;
    preloadMainAppData();
  }
}

function resetPostAuthInit() {
  initializedUserId = '';
  mainPreloadedUserId = '';
  statusRefreshInFlight = null;
}

async function loadCachedStatus(token: string): Promise<UserStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(statusCacheKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { status?: UserStatus; updatedAt?: number };
    if (!parsed.status || !parsed.updatedAt) return null;
    if (Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000) return null;
    return parsed.status;
  } catch {
    return null;
  }
}

function saveCachedStatus(token: string, status: UserStatus) {
  AsyncStorage.setItem(statusCacheKey(token), JSON.stringify({ status, updatedAt: Date.now() })).catch(() => undefined);
}

function clearCachedStatus(token?: string | null) {
  if (token) {
    AsyncStorage.removeItem(statusCacheKey(token)).catch(() => undefined);
    return;
  }
  AsyncStorage.getAllKeys()
    .then(keys => AsyncStorage.multiRemove(keys.filter(key => key.startsWith(STATUS_CACHE_PREFIX))))
    .catch(() => undefined);
}

type AuthState = {
  ready: boolean;
  token: string | null;
  user: SessionUser | null;
  status: UserStatus | null;
  loading: boolean;
  error: string | null;
};

let listeners: Array<() => void> = [];
let state: AuthState = {
  ready: false,
  token: null,
  user: null,
  status: null,
  loading: false,
  error: null,
};

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  emit();
}

export function useAuthStore() {
  const [, tick] = useState(0);
  useEffect(() => {
    const listener = () => tick((n) => n + 1);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const bootstrap = useCallback(async () => {
    setState({ loading: true, error: null });
    let bootstrapToken: string | null = null;
    try {
      const token = await loadToken();
      bootstrapToken = token;
      if (!token) {
        resetPostAuthInit();
        setCacheSession(null);
        setState({ ready: true, token: null, user: null, status: null, loading: false });
        return;
      }
      setCacheSession(token);
      const cachedStatus = await loadCachedStatus(token);
      if (cachedStatus) {
        setCacheSession(token, cachedStatus.userId);
        setState({ ready: true, token, status: cachedStatus, loading: false });
        runPostAuthInit(cachedStatus);
        fetchUserStatus()
          .then((freshStatus) => {
            if (state.token !== token) return;
            setCacheSession(token, freshStatus.userId);
            saveCachedStatus(token, freshStatus);
            setState({ status: freshStatus });
            runPostAuthInit(freshStatus);
          })
          .catch(() => undefined);
        return;
      }
      const status = await fetchUserStatus();
      setCacheSession(token, status.userId);
      saveCachedStatus(token, status);
      setState({ ready: true, token, status, loading: false });
      runPostAuthInit(status);
    } catch {
      await logoutRequest();
      resetPostAuthInit();
      invalidateCachedResource();
      clearCachedStatus(bootstrapToken);
      setCacheSession(null);
      setState({ ready: true, token: null, user: null, status: null, loading: false });
    }
  }, []);

  const login = useCallback(async (mobile: string, name?: string, createIfMissing = true) => {
    setState({ loading: true, error: null });
    try {
      const response = await loginRequest(mobile, name, createIfMissing);
      setCacheSession(response.token, response.user.userId);
      setState({
        ready: true,
        token: response.token,
        user: response.user,
        status: response.status,
        loading: false,
      });
      saveCachedStatus(response.token, response.status);
      runPostAuthInit(response.status);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      setState({ loading: false, error: message });
      throw error;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const refreshToken = state.token;
    if (!refreshToken) throw new Error('Your session has ended. Please sign in again.');
    const promise = statusRefreshInFlight?.token === refreshToken
      ? statusRefreshInFlight.promise
      : fetchUserStatus();
    statusRefreshInFlight = { token: refreshToken, promise };
    let status: UserStatus;
    try {
      status = await promise;
    } finally {
      if (statusRefreshInFlight?.promise === promise) statusRefreshInFlight = null;
    }
    if (state.token !== refreshToken) throw new Error('Your session changed while refreshing.');
    setCacheSession(refreshToken, status.userId);
    saveCachedStatus(refreshToken, status);
    setState({ status });
    runPostAuthInit(status);
    return status;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      resetPostAuthInit();
      invalidateCachedResource();
      clearCachedStatus(state.token);
      setCacheSession(null);
      setState({ ready: true, token: null, user: null, status: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logoutRequest().finally(() => {
        resetPostAuthInit();
        invalidateCachedResource();
        clearCachedStatus(state.token);
        setCacheSession(null);
        setState({ ready: true, token: null, user: null, status: null, loading: false, error: null });
      });
    });
  }, []);

  return { ...state, bootstrap, login, logout, refreshStatus };
}
