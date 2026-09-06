import { apiRequest } from './apiClient';

export type GymPlace = {
  placeId: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
};

export async function searchGyms(query: string, signal?: AbortSignal) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 3) return [];
  const response = await apiRequest<{ places: GymPlace[] }>(`/gyms/search?q=${encodeURIComponent(cleanQuery)}`, {
    signal,
    timeoutMs: 10000,
    retries: 0,
  });
  return Array.isArray(response.places) ? response.places : [];
}

export async function fetchGym(placeId: string, signal?: AbortSignal) {
  const cleanPlaceId = placeId.trim();
  if (!cleanPlaceId) return null;
  const response = await apiRequest<{ place: GymPlace }>(`/gyms/${encodeURIComponent(cleanPlaceId)}`, {
    signal,
    timeoutMs: 10000,
    retries: 0,
  });
  return response.place || null;
}
