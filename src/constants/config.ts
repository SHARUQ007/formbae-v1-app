import Config from 'react-native-config';
import { Platform } from 'react-native';

const DEFAULT_BACKEND_DEV = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export function getBackendApiBaseUrl(): string {
  const raw = Config.BACKEND_API_BASE_URL || DEFAULT_BACKEND_DEV;
  return raw.replace(/\/$/, '');
}

export function getSiteUrl(): string {
  return (Config.SITE_URL || 'https://formbae.in').replace(/\/$/, '');
}

export const API_PREFIX = '/api/mobile';
