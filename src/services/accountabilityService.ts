import type { Asset } from 'react-native-image-picker';
import { apiRequest, getApiUrl, getAuthToken } from './apiClient';
import { getCachedResource, peekCachedResource, setCachedResource } from './appCache';
import type { AccountabilityBaeSummary, AccountabilitySummary } from '../types/api';
import { formatWorkoutTitle } from '../utils/workoutTitle';

const ACCOUNTABILITY_CACHE_KEY = 'accountability:summary:v1';
const ACCOUNTABILITY_BAE_CACHE_KEY = 'accountability:bae:v2';
const DEFAULT_BAE_TROPHY_THRESHOLD = 50;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNonNegative(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Keeps cached or partially deployed Partner payloads safe for the UI. */
export function normalizeAccountabilityBaeSummary(value: unknown): AccountabilityBaeSummary | null {
  const raw = recordValue(value);
  if (!raw) return null;

  const rawAccess = recordValue(raw.access);
  const suppliedThreshold = finiteNonNegative(rawAccess?.trophyThreshold, DEFAULT_BAE_TROPHY_THRESHOLD);
  const threshold = suppliedThreshold > 0 ? suppliedThreshold : DEFAULT_BAE_TROPHY_THRESHOLD;
  const score = finiteNonNegative(rawAccess?.trophyScore, 0);
  const remainingFallback = Math.max(0, threshold - score);
  const override = rawAccess?.override === 'locked' || rawAccess?.override === 'unlocked'
    ? rawAccess.override
    : 'default';
  const access = {
    unlocked: rawAccess?.unlocked === true || override === 'unlocked',
    override,
    trophyScore: score,
    trophyThreshold: threshold,
    trophiesRemaining: finiteNonNegative(rawAccess?.trophiesRemaining, remainingFallback),
  } as NonNullable<AccountabilityBaeSummary['access']>;

  const validStatus = raw.status === 'locked' || raw.status === 'inactive' || raw.status === 'waiting' || raw.status === 'matched';
  const status: AccountabilityBaeSummary['status'] = validStatus
    ? raw.status as AccountabilityBaeSummary['status']
    : rawAccess && !access.unlocked
      ? 'locked'
      : 'inactive';
  const preference = raw.preference === 'male' || raw.preference === 'female' || raw.preference === 'friend'
    ? raw.preference
    : '';
  const rawPartner = recordValue(raw.partner);
  const partnerName = stringValue(rawPartner?.displayName);
  const rawChallenge = recordValue(raw.challenge);
  const challengeTitle = stringValue(rawChallenge?.title);
  const youSubmitted = raw.youSubmitted === true;
  const partnerSubmitted = raw.partnerSubmitted === true;

  return {
    status,
    preference,
    inviteCode: stringValue(raw.inviteCode),
    access,
    partner: partnerName
      ? { userId: stringValue(rawPartner?.userId), displayName: partnerName, trophyCount: finiteNonNegative(rawPartner?.trophyCount, 0) }
      : null,
    challenge: challengeTitle
      ? {
          id: stringValue(rawChallenge?.id),
          title: challengeTitle,
          prompt: stringValue(rawChallenge?.prompt),
          icon: stringValue(rawChallenge?.icon) || 'walk',
          date: stringValue(rawChallenge?.date),
          dueLabel: stringValue(rawChallenge?.dueLabel) || 'Today',
          assignmentId: stringValue(rawChallenge?.assignmentId),
          revealAt: stringValue(rawChallenge?.revealAt),
          minutes: finiteNonNegative(rawChallenge?.minutes, 0),
        }
      : null,
    youSubmitted,
    partnerSubmitted,
    bothSubmitted: raw.bothSubmitted === true && youSubmitted && partnerSubmitted,
    photosRevealed: raw.photosRevealed === true && youSubmitted && partnerSubmitted,
    revealAt: stringValue(raw.revealAt),
    timezone: stringValue(raw.timezone),
    reason: stringValue(raw.reason),
    state: stringValue(raw.state),
    history: Array.isArray(raw.history) ? raw.history.slice(0, 31).flatMap(entry => {
      const day = recordValue(entry);
      if (!day || !stringValue(day.date)) return [];
      const task = recordValue(day.challenge);
      const revealed = day.photosRevealed === true && day.youSubmitted === true && day.partnerSubmitted === true;
      return [{ date: stringValue(day.date), challenge: task ? { id: stringValue(task.id), title: stringValue(task.title), prompt: stringValue(task.prompt) } : null, state: stringValue(day.state), revealAt: stringValue(day.revealAt), timezone: stringValue(day.timezone), youSubmitted: day.youSubmitted === true, partnerSubmitted: day.partnerSubmitted === true, photosRevealed: revealed, yourProofUrl: revealed ? stringValue(day.yourProofUrl) : undefined, partnerProofUrl: revealed ? stringValue(day.partnerProofUrl) : undefined }];
    }) : [],
    yourProofUrl: raw.photosRevealed === true && youSubmitted && partnerSubmitted ? stringValue(raw.yourProofUrl) || undefined : undefined,
    partnerProofUrl: raw.photosRevealed === true && youSubmitted && partnerSubmitted ? stringValue(raw.partnerProofUrl) || undefined : undefined,
  };
}

function requireBaeSummary(value: unknown) {
  const summary = normalizeAccountabilityBaeSummary(value);
  if (!summary) throw new Error('Partner mode returned an invalid response.');
  return summary;
}

function normalizeAccountabilitySummary(summary: AccountabilitySummary): AccountabilitySummary {
  if (summary.today?.targetKind !== 'workout') return summary;
  return { ...summary, today: { ...summary.today, title: formatWorkoutTitle(summary.today.title) } };
}

export function fetchAccountability(options?: { force?: boolean }) {
  return getCachedResource(
    ACCOUNTABILITY_CACHE_KEY,
    () => apiRequest<AccountabilitySummary>('/accountability'),
    { force: options?.force },
  ).then(normalizeAccountabilitySummary);
}

export function peekAccountability() {
  const summary = peekCachedResource<AccountabilitySummary>(ACCOUNTABILITY_CACHE_KEY);
  return summary ? normalizeAccountabilitySummary(summary) : null;
}

export function updateAccountability(body: {
  action: 'commit' | 'complete' | 'skip';
  targetKind?: string;
  targetId?: string;
  title?: string;
}) {
  const requestBody = body.targetKind === 'workout' && typeof body.title === 'string'
    ? { ...body, title: formatWorkoutTitle(body.title) }
    : body;
  return apiRequest<AccountabilitySummary>('/accountability', { method: 'POST', body: requestBody }).then(normalizeAccountabilitySummary).then((summary) => {
    setCachedResource(ACCOUNTABILITY_CACHE_KEY, summary);
    return summary;
  });
}

export function fetchAccountabilityBae(options?: { force?: boolean }) {
  return getCachedResource(
    ACCOUNTABILITY_BAE_CACHE_KEY,
    () => apiRequest<unknown>('/accountability/bae').then(requireBaeSummary),
    { force: options?.force },
  ).then(requireBaeSummary);
}

export function peekAccountabilityBae() {
  return normalizeAccountabilityBaeSummary(
    peekCachedResource<unknown>(ACCOUNTABILITY_BAE_CACHE_KEY),
  );
}

function cacheBae(value: unknown) {
  const summary = requireBaeSummary(value);
  setCachedResource(ACCOUNTABILITY_BAE_CACHE_KEY, summary);
  return summary;
}

export function startAccountabilityBaeMatch(preference: 'male' | 'female' | 'friend') {
  return apiRequest<unknown>('/accountability/bae/match', { method: 'POST', body: { preference } }).then(cacheBae);
}

export function joinAccountabilityBaeFriend(inviteCode: string) {
  return apiRequest<unknown>('/accountability/bae/friend/join', { method: 'POST', body: { inviteCode } }).then(cacheBae);
}

export function leaveAccountabilityBae() {
  return apiRequest<unknown>('/accountability/bae/leave', { method: 'POST' }).then(cacheBae);
}

export function uploadAccountabilityBaeProof(asset: Asset, assignment: { assignmentId: string; date: string }) {
  if (!asset.base64) throw new Error('Photo data is unavailable.');
  return apiRequest<unknown>('/accountability/bae/proof', {
    method: 'POST',
    timeoutMs: 30000,
    body: { imageBase64: asset.base64, imageMime: asset.type || 'image/jpeg', ...assignment },
  }).then(cacheBae);
}

export function accountabilityBaeProofSource(path?: string) {
  if (!path) return undefined;
  const token = getAuthToken();
  return { uri: getApiUrl(path), headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}
