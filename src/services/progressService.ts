import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './apiClient';
import { ApiError } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { ProgressSummary, TrophyInvite, TrophyLeaderboard } from '../types/api';

const PENDING_BODY_LOGS_KEY = 'formbae_pending_body_logs_v1';

type BodyMeasurementInput = {
  weight?: string;
  chest?: string;
  waist?: string;
  biceps?: string;
  notes?: string;
};

type PendingBodyLog = BodyMeasurementInput & {
  clientId: string;
  date: string;
};

export type SavedBodyLog = {
  entryId: string;
  date: string;
  weight: string;
  chest: string;
  waist: string;
  biceps: string;
};

function makeClientId() {
  return `body_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeMeasurements(body: BodyMeasurementInput): BodyMeasurementInput {
  const limits: Record<'weight' | 'chest' | 'waist' | 'biceps', [number, number]> = {
    weight: [20, 500],
    chest: [20, 300],
    waist: [20, 300],
    biceps: [5, 150],
  };
  const normalized: BodyMeasurementInput = { notes: body.notes?.trim() };
  let populated = 0;
  for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
    const raw = body[key]?.trim().replace(',', '.') || '';
    if (!raw) {
      normalized[key] = '';
      continue;
    }
    const value = Number(raw);
    const [minimum, maximum] = limits[key];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${key[0].toUpperCase()}${key.slice(1)} must be between ${minimum} and ${maximum}.`);
    }
    normalized[key] = `${Math.round(value * 100) / 100}`;
    populated += 1;
  }
  if (!populated) throw new Error('Add at least one measurement.');
  return normalized;
}

async function readPendingBodyLogs(): Promise<PendingBodyLog[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_BODY_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is PendingBodyLog => Boolean(item && typeof item === 'object' && 'clientId' in item)) : [];
  } catch {
    return [];
  }
}

async function writePendingBodyLogs(logs: PendingBodyLog[]) {
  await AsyncStorage.setItem(PENDING_BODY_LOGS_KEY, JSON.stringify(logs));
}

async function postBodyLog(log: PendingBodyLog) {
  return apiRequest<{ ok: boolean; entry: SavedBodyLog }>('/progress', {
    method: 'POST',
    body: log,
  });
}

let flushPromise: Promise<{ synced: number; remaining: number }> | null = null;

export function flushPendingProgressLogs() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const pending = await readPendingBodyLogs();
    if (!pending.length) return { synced: 0, remaining: 0 };

    const remaining: PendingBodyLog[] = [];
    let synced = 0;
    for (const log of pending) {
      try {
        await postBodyLog(log);
        synced += 1;
      } catch (error) {
        // Invalid old queue items cannot succeed later. Network and server
        // failures remain durable on-device and retry on the next load.
        if (!(error instanceof ApiError) || error.isNetwork || error.status >= 500) {
          remaining.push(log);
        }
      }
    }
    const processedIds = new Set(pending.map((item) => item.clientId));
    const retainedIds = new Set(remaining.map((item) => item.clientId));
    const latestQueue = await readPendingBodyLogs();
    const nextQueue = latestQueue.filter((item) => !processedIds.has(item.clientId) || retainedIds.has(item.clientId));
    await writePendingBodyLogs(nextQueue);
    if (synced) invalidateCachedResource('progressBundle');
    return { synced, remaining: nextQueue.length };
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

export async function fetchProgress() {
  const progress = await apiRequest<ProgressSummary>('/progress');
  if (progress.trophies) return progress;

  // Compatibility for older API deployments and cached accounts: trophy
  // presentation can always be reconstructed from the durable activity data.
  const workoutCount = progress.completionHistory?.length ?? progress.completed ?? 0;
  const mealCount = progress.weeklyReview?.stats?.mealsLogged ?? 0;
  const currentStreak = Math.max(0, progress.currentStreak || 0);
  const workoutPoints = workoutCount * 3;
  const starPoints = Math.floor(mealCount / 3);
  const streakPoints = currentStreak * 2;
  const score = Math.max(0, workoutPoints + starPoints + streakPoints);
  const safeZone = Math.floor(score / 25) * 25;
  const nextMilestone = safeZone + 25;
  return {
    ...progress,
    trophies: {
      score,
      change: 0,
      safeZone,
      nextMilestone,
      pointsToNext: Math.max(0, nextMilestone - score),
      workoutCount,
      starCount: mealCount,
      currentStreak,
      breakdown: {
        workouts: workoutPoints,
        stars: starPoints,
        streakAchievement: 0,
        streakMomentum: streakPoints,
        weeklyPace: 0,
        foodPace: 0,
      },
    },
  };
}

export async function logProgress(body: BodyMeasurementInput) {
  const normalized = normalizeMeasurements(body);
  const pending: PendingBodyLog = {
    ...normalized,
    clientId: makeClientId(),
    date: localDateKey(),
  };

  // Write locally first. A terminated app or dropped request cannot discard
  // measurements the user already submitted.
  const queue = await readPendingBodyLogs();
  await writePendingBodyLogs([...queue, pending]);

  try {
    const response = await postBodyLog(pending);
    const latestQueue = await readPendingBodyLogs();
    await writePendingBodyLogs(latestQueue.filter((item) => item.clientId !== pending.clientId));
    invalidateCachedResource('progressBundle');
    return { ...response, synced: true as const };
  } catch (error) {
    if (error instanceof ApiError && !error.isNetwork && error.status < 500) {
      const latestQueue = await readPendingBodyLogs();
      await writePendingBodyLogs(latestQueue.filter((item) => item.clientId !== pending.clientId));
      throw error;
    }
    return { ok: true as const, synced: false as const };
  }
}

export function fetchTrophyLeaderboard() {
  return apiRequest<TrophyLeaderboard>('/trophies/leaderboard');
}

export function fetchTrophyInvite() {
  return apiRequest<TrophyInvite>('/trophies/invite');
}

export function acceptTrophyInvite(code: string) {
  return apiRequest<{ ok: boolean; connectedUserId: string }>('/trophies/invite/accept', {
    method: 'POST',
    body: { code },
  });
}
