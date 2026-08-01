import Config from 'react-native-config';
import { Platform } from 'react-native';

// Frontend remains available for compatibility-only routes such as payments.
// Direct mobile app data should use the backend to avoid app -> frontend -> backend hops.
const DEFAULT_FRONTEND_DEV = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
const DEFAULT_BACKEND_DEV = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export function getApiBaseUrl(): string {
  const raw = Config.API_BASE_URL || DEFAULT_FRONTEND_DEV;
  return raw.replace(/\/$/, '');
}

export function getBackendApiBaseUrl(): string {
  const raw = Config.BACKEND_API_BASE_URL || Config.MOBILE_API_BASE_URL || Config.API_BASE_URL || DEFAULT_BACKEND_DEV;
  return raw.replace(/\/$/, '');
}

export function getSiteUrl(): string {
  return (Config.SITE_URL || 'https://formbae.in').replace(/\/$/, '');
}

export function getRazorpayKeyId(): string {
  return Config.RAZORPAY_KEY_ID || '';
}

export const API_PREFIX = '/api/mobile';
