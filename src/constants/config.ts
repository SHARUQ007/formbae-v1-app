import Config from 'react-native-config';
import { Platform } from 'react-native';

// For a physical device set API_BASE_URL in .env to your machine LAN IP,
// e.g. API_BASE_URL=http://192.168.1.10:3000
// Android emulator maps host localhost to 10.0.2.2.
// iOS simulator can reach host via 127.0.0.1.
const DEFAULT_DEV = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';

export function getApiBaseUrl(): string {
  const raw = Config.API_BASE_URL || DEFAULT_DEV;
  return raw.replace(/\/$/, '');
}

export function getSiteUrl(): string {
  return (Config.SITE_URL || 'https://formbae.in').replace(/\/$/, '');
}

export function getRazorpayKeyId(): string {
  return Config.RAZORPAY_KEY_ID || '';
}

export const API_PREFIX = '/api/mobile';
