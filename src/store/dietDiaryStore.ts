import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { Asset } from 'react-native-image-picker';

const KEY = 'formbae_diet_diary_entries_v1';
const DIR = `${RNFS.DocumentDirectoryPath}/diet-diary`;

export type DietDiaryEntry = {
  id: string;
  uri: string;
  createdAt: string;
  mealType: MealType;
  note?: string;
  originalUri?: string;
  storedLocally: boolean;
  remoteId?: string;
  remoteImageUrl?: string;
  syncedAt?: string;
  syncError?: string;
};

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

function makeId() {
  return `diet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extensionFor(asset: Asset) {
  const fromName = asset.fileName?.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (asset.type?.includes('png')) return 'png';
  if (asset.type?.includes('heic')) return 'heic';
  return 'jpg';
}

async function readEntries(): Promise<DietDiaryEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DietDiaryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries: DietDiaryEntry[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

async function ensureDir() {
  const exists = await RNFS.exists(DIR);
  if (!exists) await RNFS.mkdir(DIR);
}

async function persistAsset(asset: Asset, id: string): Promise<{ uri: string; storedLocally: boolean }> {
  const sourceUri = asset.uri;
  if (!sourceUri) throw new Error('No image selected');

  try {
    await ensureDir();
    const destination = `${DIR}/${id}.${extensionFor(asset)}`;
    if (asset.base64) {
      await RNFS.writeFile(destination, asset.base64, 'base64');
      return { uri: `file://${destination}`, storedLocally: true };
    }

    const sourcePath = asset.originalPath || sourceUri.replace(/^file:\/\//, '');
    await RNFS.copyFile(sourcePath, destination);
    return { uri: `file://${destination}`, storedLocally: true };
  } catch {
    // Some Android content:// providers cannot be copied by RNFS. Keep the original
    // URI as a fallback so the user can still see the diary entry.
    return { uri: sourceUri, storedLocally: false };
  }
}

export async function loadDietDiaryEntries() {
  const entries = await readEntries();
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveDietDiaryEntries(entries: DietDiaryEntry[]) {
  await writeEntries(entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function addDietDiaryEntry(asset: Asset, mealType: MealType, note?: string) {
  const id = makeId();
  const persisted = await persistAsset(asset, id);
  const entry: DietDiaryEntry = {
    id,
    uri: persisted.uri,
    originalUri: asset.uri,
    mealType,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    storedLocally: persisted.storedLocally,
  };
  const entries = await readEntries();
  await writeEntries([entry, ...entries]);
  return entry;
}

export async function updateDietDiaryEntry(entryId: string, patch: Partial<DietDiaryEntry>) {
  const entries = await readEntries();
  const next = entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
  await writeEntries(next);
}

export async function mergeRemoteDietDiaryEntries(
  remoteEntries: Array<{
    entryId: string;
    clientId?: string;
    imageUrl: string;
    mealType: MealType;
    note?: string;
    createdAt: string;
  }>,
) {
  const local = await readEntries();
  const byLocalId = new Map(local.map((entry) => [entry.id, entry]));
  const byRemoteId = new Map(local.filter((entry) => entry.remoteId).map((entry) => [entry.remoteId, entry]));

  const merged = [...local];
  for (const remote of remoteEntries) {
    const existing = byRemoteId.get(remote.entryId) || (remote.clientId ? byLocalId.get(remote.clientId) : undefined);
    if (existing) {
      Object.assign(existing, {
        remoteId: remote.entryId,
        remoteImageUrl: remote.imageUrl,
        mealType: remote.mealType,
        note: remote.note,
        createdAt: remote.createdAt || existing.createdAt,
        syncedAt: new Date().toISOString(),
        syncError: undefined,
      });
    } else {
      merged.push({
        id: remote.clientId || remote.entryId,
        uri: remote.imageUrl,
        remoteId: remote.entryId,
        remoteImageUrl: remote.imageUrl,
        mealType: remote.mealType,
        note: remote.note,
        createdAt: remote.createdAt,
        storedLocally: false,
        syncedAt: new Date().toISOString(),
      });
    }
  }

  await writeEntries(merged);
  return loadDietDiaryEntries();
}

export async function deleteDietDiaryEntry(entryId: string) {
  const entries = await readEntries();
  const entry = entries.find((item) => item.id === entryId);
  const next = entries.filter((item) => item.id !== entryId);
  await writeEntries(next);

  if (entry?.storedLocally && entry.uri.startsWith('file://')) {
    const path = entry.uri.replace(/^file:\/\//, '');
    const exists = await RNFS.exists(path).catch(() => false);
    if (exists) await RNFS.unlink(path).catch(() => undefined);
  }
}
