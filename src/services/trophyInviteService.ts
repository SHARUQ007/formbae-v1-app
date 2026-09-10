import AsyncStorage from '@react-native-async-storage/async-storage';
import { invalidateCachedResource } from './appCache';
import { apiRequest } from './apiClient';

export type InvitePreview = {
  code: string; displayName: string; trophies: number; isOwnInvite: boolean; alreadyConnected: boolean;
};
export type PendingInvite = { code: string; savedAt: number; userId?: string };
const STORAGE_KEY = 'formbae_pending_trophy_invite_v1';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// Restrict incoming navigation to our invite contract, never arbitrary screens/URLs.
export function trophyInviteCodeFromUrl(url: string): string | null {
  const match = /^(?:https:\/\/formbae\.in\/invite\/trophy\/|formbae:\/\/invite\/trophy\/)([a-z0-9]{6,32})\/?(?:[?#].*)?$/i.exec(url);
  return match?.[1].toUpperCase() ?? null;
}

export function parseStoredInvite(raw: string | null, now = Date.now()): PendingInvite | null {
  try {
    const value = JSON.parse(raw || 'null') as PendingInvite | null;
    if (!value || !/^[A-Z0-9]{6,32}$/.test(value.code) || !Number.isFinite(value.savedAt)
      || value.savedAt > now || now - value.savedAt > MAX_AGE
      || (value.userId !== undefined && typeof value.userId !== 'string')) return null;
    return value;
  } catch { return null; }
}

let storageQueue: Promise<unknown> = Promise.resolve();
export function saveLocalInvite(invite: PendingInvite | null) {
  // Serialize warm-link writes and dismissal so a slow disk write cannot revive an invite.
  storageQueue = storageQueue.catch(() => undefined).then(() => invite
    ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(invite)) : AsyncStorage.removeItem(STORAGE_KEY));
  return storageQueue;
}
export async function readLocalInvite() {
  await storageQueue.catch(() => undefined);
  return parseStoredInvite(await AsyncStorage.getItem(STORAGE_KEY));
}
export const previewTrophyInvite = (code: string, token: string) =>
  apiRequest<InvitePreview>(`/trophies/invite/${encodeURIComponent(code)}/preview`, { token });
const dismissedInMemory = new Set<string>();
const dismissalKey = (userId: string, code: string) => `formbae_dismissed_invite:${userId}:${code}`;
const dismissOnServer = (code: string, token: string) =>
  apiRequest(`/trophies/invite/${encodeURIComponent(code)}/pending`, { method: 'DELETE', token });

export async function fetchPendingTrophyInvite(token: string, userId: string) {
  const result = await apiRequest<{ invite: InvitePreview | null }>('/trophies/invite/pending', { token });
  if (!result.invite) return result;
  const key = dismissalKey(userId, result.invite.code);
  const dismissed = dismissedInMemory.has(key) || Boolean(await AsyncStorage.getItem(key).catch(() => null));
  if (!dismissed) return result;
  // Complete an offline dismissal when the account next comes online.
  dismissOnServer(result.invite.code, token).catch(() => undefined);
  return { invite: null };
}
export async function dismissPendingTrophyInvite(code: string, token: string, userId: string) {
  const key = dismissalKey(userId, code);
  dismissedInMemory.add(key);
  await AsyncStorage.setItem(key, '1').catch(() => undefined);
  // Closing a popup must work offline; the durable tombstone above prevents
  // a later foreground check or repeated checkout from reopening it.
  dismissOnServer(code, token).catch(() => undefined);
}

export const confirmTrophyInvite = (code: string, token: string) =>
  apiRequest('/trophies/invite/accept', { method: 'POST', body: { code }, token });

const leaderboardListeners = new Set<() => void>();
export function publishInviteAccepted() {
  invalidateCachedResource('trophyLeaderboard');
  leaderboardListeners.forEach(listener => listener());
}
export function subscribeToInviteAccepted(listener: () => void) {
  leaderboardListeners.add(listener);
  return () => { leaderboardListeners.delete(listener); };
}
