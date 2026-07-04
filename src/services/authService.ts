import * as Keychain from 'react-native-keychain';
import { apiRequest, setAuthToken } from './apiClient';
import type { LoginResponse } from '../types/api';

const SERVICE = 'formbae_mobile_auth';

export async function saveToken(token: string) {
  setAuthToken(token);
  await Keychain.setGenericPassword('token', token, { service: SERVICE });
}

export async function loadToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  const token = creds ? creds.password : null;
  setAuthToken(token);
  return token;
}

export async function clearToken() {
  setAuthToken(null);
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function login(mobile: string, name?: string, createIfMissing = false) {
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
