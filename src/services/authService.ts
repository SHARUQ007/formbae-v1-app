import * as Keychain from 'react-native-keychain';
import { apiRequest, setAuthToken } from './apiClient';
import type { LoginResponse } from '../types/api';

const SERVICE = 'formbae_mobile_auth';

export async function saveToken(token: string) {
  setAuthToken(token);
  await Keychain.setGenericPassword('token', token, { service: SERVICE });
}

export async function loadToken(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    const token = creds ? creds.password : null;
    setAuthToken(token);
    return token;
  } catch {
    // Secure storage can be temporarily unavailable after restore, an OS
    // upgrade, or in unsigned simulator builds. Treat that as signed out so
    // bootstrap never strands the user on the loading screen.
    setAuthToken(null);
    return null;
  }
}

export async function clearToken() {
  setAuthToken(null);
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // The in-memory session is already cleared; unavailable secure storage
    // must not prevent logout or auth recovery.
  }
}

export async function login(mobile: string, name?: string, createIfMissing = true) {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { mobile, name, createIfMissing },
    token: null,
  });
  await saveToken(response.token);
  return response;
}

export async function logout() {
  await clearToken();
}
