import type { Asset } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { apiRequest, getDirectApiUrl } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { MealType } from '../store/dietDiaryStore';

export type RemoteDietDiaryEntry = {
  entryId: string;
  clientId?: string;
  mealType: MealType | 'Snack';
  note: string;
  status?: 'logged' | 'skipped';
  createdAt: string;
  loggedAt?: string;
  imageMime: string;
  imageUrl: string;
};

export type DietCoachFeedback = {
  weekStartDate: string;
  generatedAt: string;
  title: string;
  summary: string;
  nextFocus: string;
  highlights: string[];
  status?: 'pending' | 'ready';
  nextInDays?: number;
  stats: {
    loggedItems: number;
    daysLogged: number;
    memoryEntries: number;
    photoEntries: number;
    mealCounts: Record<string, number>;
    recentFoods: string[];
  };
};

export async function fetchDietDiary() {
  return apiRequest<{ entries: RemoteDietDiaryEntry[]; feedback?: DietCoachFeedback }>('/diet/diary');
}

export async function uploadDietDiaryEntry(params: {
  clientId: string;
  mealType: MealType;
  note?: string;
  createdAt: string;
  asset: Asset;
}) {
  let imageBase64 = params.asset.base64;
  if (!imageBase64 && params.asset.uri) {
    const path = params.asset.originalPath || params.asset.uri.replace(/^file:\/\//, '');
    imageBase64 = await RNFS.readFile(path, 'base64').catch(() => undefined);
  }
  if (!imageBase64) throw new Error('The saved photo could not be read for upload.');

  const response = await apiRequest<{ ok: boolean; entry: RemoteDietDiaryEntry }>('/diet/diary', {
    method: 'POST',
    timeoutMs: 30000,
    body: {
      clientId: params.clientId,
      mealType: params.mealType,
      note: params.note || '',
      createdAt: params.createdAt,
      imageMime: params.asset.type || 'image/jpeg',
      imageBase64,
    },
  });
  invalidateCachedResource('dietDiary');
  invalidateCachedResource('progressBundle');
  return response;
}

export async function uploadTextDietDiaryEntry(params: {
  clientId: string;
  mealType: MealType;
  note: string;
  createdAt: string;
}) {
  const response = await apiRequest<{ ok: boolean; entry: RemoteDietDiaryEntry }>('/diet/diary', {
    method: 'POST',
    body: {
      clientId: params.clientId,
      mealType: params.mealType,
      note: params.note,
      createdAt: params.createdAt,
    },
  });
  invalidateCachedResource('dietDiary');
  invalidateCachedResource('progressBundle');
  return response;
}

export async function uploadSkippedDietMeal(params: {
  clientId: string;
  mealType: MealType;
  createdAt: string;
}) {
  const response = await apiRequest<{ ok: boolean; entry: RemoteDietDiaryEntry }>('/diet/diary', {
    method: 'POST',
    body: { ...params, status: 'skipped' },
  });
  invalidateCachedResource('dietDiary');
  return response;
}

export async function deleteRemoteDietDiaryEntry(entryId: string) {
  const response = await apiRequest<{ ok: boolean }>(`/diet/diary/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  invalidateCachedResource('dietDiary');
  invalidateCachedResource('progressBundle');
  return response;
}

export function resolveDietDiaryImageUrl(imageUrl: string) {
  if (!imageUrl || imageUrl.startsWith('file:') || imageUrl.startsWith('content:') || imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return getDirectApiUrl(imageUrl.replace(/^\/api\/mobile/, ''));
}
