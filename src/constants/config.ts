import Config from 'react-native-config';
import { Platform } from 'react-native';

const PRODUCTION_BACKEND = 'https://formbae-v1-backend.onrender.com';
const DEAD_BACKEND_SLUGS = new Set([
  'https://formbae-backend.onrender.com',
  'http://formbae-backend.onrender.com',
]);
const DEFAULT_BACKEND_DEV = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export function getBackendApiBaseUrl(): string {
  const configured = (Config.BACKEND_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (DEAD_BACKEND_SLUGS.has(configured)) {
    return PRODUCTION_BACKEND;
  }
  if (configured) {
    return configured;
  }
  return __DEV__ ? DEFAULT_BACKEND_DEV : PRODUCTION_BACKEND;
}

export function getSiteUrl(): string {
  return (Config.SITE_URL || 'https://formbae.in').replace(/\/$/, '');
}

export const API_PREFIX = '/api/mobile';
