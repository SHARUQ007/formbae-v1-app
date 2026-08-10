import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { Asset } from 'react-native-image-picker';
import { timestampValue, validTimestamp } from '../utils/dietDiaryTime';

const KEY = 'formbae_diet_diary_entries_v1';
const DIR = `${RNFS.DocumentDirectoryPath}/diet-diary`;

export type DietDiaryEntry = {
  id: string;
  kind?: 'photo' | 'text';
  uri?: string;
  /** When the food was eaten. Kept as createdAt for API compatibility. */
  createdAt: string;
  /** When the diary record was actually saved on this device/server. */
  loggedAt?: string;
  mealType: MealType;
  note?: string;
  originalUri?: string;
  storedLocally: boolean;
  remoteId?: string;
  remoteImageUrl?: string;
  syncedAt?: string;
  syncError?: string;
};

export type MealType = 'Breakfast' | 'Lunch' | 'Evening' | 'Dinner';

export function normalizeMealType(value?: string): MealType {
  if (value === 'Breakfast' || value === 'Lunch' || value === 'Evening' || value === 'Dinner') return value;
  // Older app versions used Snack as the fourth diary slot.
  if (value === 'Snack') return 'Evening';
  return 'Evening';
}

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
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === 'string')
      .map((entry) => ({
        ...entry,
        mealType: normalizeMealType(entry.mealType),
        createdAt: validTimestamp(entry.createdAt) || validTimestamp(entry.loggedAt) || new Date(0).toISOString(),
        loggedAt: validTimestamp(entry.loggedAt),
      }));
  } catch {
    return [];
  }
}

async function writeEntries(entries: DietDiaryEntry[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

function compareEntriesNewestFirst(a: DietDiaryEntry, b: DietDiaryEntry) {
  const occurrenceDifference = timestampValue(b.createdAt) - timestampValue(a.createdAt);
  if (occurrenceDifference) return occurrenceDifference;
  const loggedDifference = timestampValue(b.loggedAt) - timestampValue(a.loggedAt);
  if (loggedDifference) return loggedDifference;
  return b.id.localeCompare(a.id);
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
  return entries.sort(compareEntriesNewestFirst);
}

export async function saveDietDiaryEntries(entries: DietDiaryEntry[]) {
  await writeEntries([...entries].sort(compareEntriesNewestFirst));
}

export async function addDietDiaryEntry(asset: Asset, mealType: MealType, note?: string, createdAt = new Date().toISOString()) {
  const id = makeId();
  const loggedAt = new Date().toISOString();
  const persisted = await persistAsset(asset, id);
  const entry: DietDiaryEntry = {
    id,
    uri: persisted.uri,
    originalUri: asset.uri,
    mealType,
    note: note?.trim() || undefined,
    createdAt: validTimestamp(createdAt) || loggedAt,
    loggedAt,
    storedLocally: persisted.storedLocally,
  };
  const entries = await readEntries();
  await writeEntries([entry, ...entries]);
  return entry;
}

export async function addTextDietDiaryEntry(mealType: MealType, note: string, createdAt = new Date().toISOString()) {
  const text = note.trim();
  if (!text) throw new Error('Add what you ate first.');
  const loggedAt = new Date().toISOString();
  const entry: DietDiaryEntry = {
    id: makeId(),
    kind: 'text',
    mealType,
    note: text,
    createdAt: validTimestamp(createdAt) || loggedAt,
    loggedAt,
    storedLocally: false,
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
    mealType: MealType | 'Snack';
    note?: string;
    createdAt: string;
    loggedAt?: string;
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
        kind: remote.imageUrl ? 'photo' : existing.kind || 'text',
        remoteId: remote.entryId,
        remoteImageUrl: remote.imageUrl,
        uri: remote.imageUrl || existing.uri,
        mealType: normalizeMealType(remote.mealType),
        note: remote.note,
        createdAt: validTimestamp(remote.createdAt) || existing.createdAt,
        loggedAt: validTimestamp(remote.loggedAt) || existing.loggedAt,
        syncedAt: new Date().toISOString(),
        syncError: undefined,
      });
    } else {
      merged.push({
        id: remote.clientId || remote.entryId,
        kind: remote.imageUrl ? 'photo' : 'text',
        uri: remote.imageUrl,
        remoteId: remote.entryId,
        remoteImageUrl: remote.imageUrl,
        mealType: normalizeMealType(remote.mealType),
        note: remote.note,
        createdAt: validTimestamp(remote.createdAt) || validTimestamp(remote.loggedAt) || new Date().toISOString(),
        loggedAt: validTimestamp(remote.loggedAt),
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

  if (entry?.storedLocally && entry.uri?.startsWith('file://')) {
    const path = entry.uri.replace(/^file:\/\//, '');
    const exists = await RNFS.exists(path).catch(() => false);
    if (exists) await RNFS.unlink(path).catch(() => undefined);
  }
}
