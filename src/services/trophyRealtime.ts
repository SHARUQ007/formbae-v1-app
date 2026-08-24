import type { TrophySummary } from '../types/api';
import { apiRequest } from './apiClient';

type TrophyListener = (summary: TrophySummary) => void;

const listeners = new Set<TrophyListener>();
let latestSummary: TrophySummary | null = null;

export function publishTrophySummary(summary?: TrophySummary | null) {
  if (!summary) return;
  latestSummary = summary;
  listeners.forEach((listener) => listener(summary));
}

export function publishOrRefreshTrophySummary(summary?: TrophySummary | null) {
  if (summary) {
    publishTrophySummary(summary);
    return;
  }
  // Keeps realtime behavior compatible with an API deployment that predates
  // trophy-bearing mutation responses.
  apiRequest<{ trophies?: TrophySummary }>('/progress')
    .then((progress) => publishTrophySummary(progress.trophies))
    .catch(() => undefined);
}

export function subscribeToTrophySummary(listener: TrophyListener) {
  listeners.add(listener);
  if (latestSummary) listener(latestSummary);
  return () => {
    listeners.delete(listener);
  };
}
