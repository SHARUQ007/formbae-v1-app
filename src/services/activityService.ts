import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';

type ActivityType = 'page_view' | 'interaction';

const STORAGE_PREFIX = 'formbae:mobile-activity';
const INTERACTION_COOLDOWN_MS = 60 * 1000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePath(path: string) {
  const safe = path.trim().replace(/\s+/g, '-').toLowerCase();
  return safe.startsWith('/mobile') ? safe.slice(0, 160) : `/mobile/${safe.replace(/^\/+/, '')}`.slice(0, 160);
}

async function shouldSkip(path: string, activityType: ActivityType) {
  const storageKey = `${STORAGE_PREFIX}:${todayKey()}:${activityType}:${path}`;
  const now = Date.now();
  const previous = await AsyncStorage.getItem(storageKey);
  if (!previous) {
    await AsyncStorage.setItem(storageKey, String(now));
    return false;
  }
  if (activityType === 'page_view') return true;
  const previousTimestamp = Number(previous);
  if (Number.isFinite(previousTimestamp) && now - previousTimestamp < INTERACTION_COOLDOWN_MS) return true;
  await AsyncStorage.setItem(storageKey, String(now));
  return false;
}

export async function trackMobileActivity(activityType: ActivityType, path: string) {
  const safePath = normalizePath(path);
  if (await shouldSkip(safePath, activityType)) return;
  await apiRequest('/activity', {
    method: 'POST',
    body: { activityType, path: safePath },
    retries: 0,
    timeoutMs: 5000,
  }).catch(() => undefined);
}

export function trackMobileInteraction(path: string) {
  trackMobileActivity('interaction', path).catch(() => undefined);
}
