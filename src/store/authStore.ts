import { useCallback, useEffect, useState } from 'react';
import { loadToken, login as loginRequest, logout as logoutRequest } from '../services/authService';
import { fetchUserStatus } from '../services/statusService';
import { setUnauthorizedHandler } from '../services/apiClient';
import { registerForRemotePush, syncReminders } from '../services/notificationService';
import { flushWorkoutQueue } from '../store/workoutStore';
import type { SessionUser, UserStatus } from '../types/api';

function runPostAuthInit() {
  // Fire-and-forget; never blocks or breaks the UI.
  flushWorkoutQueue().catch(() => undefined);
  registerForRemotePush().catch(() => undefined);
  syncReminders({
    workoutReminders: true,
    weeklyCheckInReminders: true,
    trainerMessageReminders: true,
  }).catch(() => undefined);
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
    try {
      const token = await loadToken();
      if (!token) {
        setState({ ready: true, token: null, user: null, status: null, loading: false });
        return;
      }
      const status = await fetchUserStatus();
      setState({ ready: true, token, status, loading: false });
      runPostAuthInit();
    } catch {
      await logoutRequest();
      setState({ ready: true, token: null, user: null, status: null, loading: false });
    }
  }, []);

  const login = useCallback(async (mobile: string, name?: string, createIfMissing = false) => {
    setState({ loading: true, error: null });
    try {
      const response = await loginRequest(mobile, name, createIfMissing);
      setState({
        ready: true,
        token: response.token,
        user: response.user,
        status: response.status,
        loading: false,
      });
      runPostAuthInit();
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      setState({ loading: false, error: message });
      throw error;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await fetchUserStatus();
    setState({ status });
    return status;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setState({ token: null, user: null, status: null });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logoutRequest().finally(() => setState({ token: null, user: null, status: null }));
    });
  }, []);

  return { ...state, bootstrap, login, logout, refreshStatus };
}
