import type { Asset } from 'react-native-image-picker';
import { apiRequest, getApiUrl } from './apiClient';
import { invalidateCachedResource } from './appCache';
import type { MealType } from '../store/dietDiaryStore';

export type RemoteDietDiaryEntry = {
  entryId: string;
  clientId?: string;
  mealType: MealType;
  note: string;
  createdAt: string;
  imageMime: string;
  imageUrl: string;
};

export async function fetchDietDiary() {
  return apiRequest<{ entries: RemoteDietDiaryEntry[] }>('/diet/diary');
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

export async function deleteRemoteDietDiaryEntry(entryId: string) {
  const response = await apiRequest<{ ok: boolean }>(`/diet/diary/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  invalidateCachedResource('dietDiary');
  return response;
}

export function resolveDietDiaryImageUrl(imageUrl: string) {
  if (!imageUrl || imageUrl.startsWith('file:') || imageUrl.startsWith('content:') || imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return getApiUrl(imageUrl.replace(/^\/api\/mobile/, ''));
}
