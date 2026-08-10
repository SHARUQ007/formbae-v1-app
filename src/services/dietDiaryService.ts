import type { Asset } from 'react-native-image-picker';
import { apiRequest, getDirectApiUrl } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { MealType } from '../store/dietDiaryStore';

export type RemoteDietDiaryEntry = {
  entryId: string;
  clientId?: string;
  mealType: MealType | 'Snack';
  note: string;
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
  if (!params.asset.base64) {
    throw new Error('Photo data is unavailable for upload.');
  }

  const response = await apiRequest<{ ok: boolean; entry: RemoteDietDiaryEntry }>('/diet/diary', {
    method: 'POST',
    timeoutMs: 30000,
    body: {
      clientId: params.clientId,
      mealType: params.mealType,
      note: params.note || '',
      createdAt: params.createdAt,
      imageMime: params.asset.type || 'image/jpeg',
      imageBase64: params.asset.base64,
    },
  });
  invalidateCachedResource('dietDiary');
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
  return response;
}

export async function deleteRemoteDietDiaryEntry(entryId: string) {
  const response = await apiRequest<{ ok: boolean }>(`/diet/diary/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  invalidateCachedResource('dietDiary');
  return response;
}

export function resolveDietDiaryImageUrl(imageUrl: string) {
  if (!imageUrl || imageUrl.startsWith('file:') || imageUrl.startsWith('content:') || imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return getDirectApiUrl(imageUrl.replace(/^\/api\/mobile/, ''));
}
