import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { Asset } from 'react-native-image-picker';
import { getActiveCacheSessionId } from '../services/appCache';
import { timestampValue, validTimestamp } from '../utils/dietDiaryTime';

const KEY = 'formbae_diet_diary_entries_v1';
const MEAL_TIME_KEY = 'formbae_food_memory_times_v1';
const DIR = `${RNFS.DocumentDirectoryPath}/diet-diary`;
let memoryEntries: DietDiaryEntry[] | null = null;
let memoryEntriesSession = '';
const reclaimedAssetSessions = new Set<string>();

export type DietDiaryEntry = {
  id: string;
  kind?: 'photo' | 'text' | 'skip';
  status?: 'logged' | 'skipped';
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
export type RememberedMealTimes = Partial<Record<MealType, { hour: number; minute: number }>>;

function scopedStorageKey(baseKey: string) {
  return `${baseKey}:${getActiveCacheSessionId()}`;
}

async function readScopedStorage(baseKey: string) {
  const scopedKey = scopedStorageKey(baseKey);
  const scopedValue = await AsyncStorage.getItem(scopedKey);
  if (scopedValue !== null) return scopedValue;

  // Migrate the pre-namespaced value once for existing installations. Removing
  // the legacy key prevents it from being inherited by a later account.
  const legacyValue = await AsyncStorage.getItem(baseKey);
  if (legacyValue === null) return null;
  await AsyncStorage.setItem(scopedKey, legacyValue);
  await AsyncStorage.removeItem(baseKey);
  return legacyValue;
}

function setMemoryEntries(entries: DietDiaryEntry[]) {
  memoryEntriesSession = getActiveCacheSessionId();
  memoryEntries = entries;
}

export async function loadRememberedMealTimes(): Promise<RememberedMealTimes> {
  const raw = await readScopedStorage(MEAL_TIME_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as RememberedMealTimes;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) =>
        value
        && Number.isInteger(value.hour)
        && value.hour >= 0
        && value.hour <= 23
        && Number.isInteger(value.minute)
        && value.minute >= 0
        && value.minute <= 59,
      ),
    ) as RememberedMealTimes;
  } catch {
    return {};
  }
}

export async function rememberMealTime(mealType: MealType, value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return loadRememberedMealTimes();
  await AsyncStorage.mergeItem(
    scopedStorageKey(MEAL_TIME_KEY),
    JSON.stringify({
      [mealType]: { hour: date.getHours(), minute: date.getMinutes() },
    }),
  );
  return loadRememberedMealTimes();
}

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
  const raw = await readScopedStorage(KEY);
  if (!raw) {
    setMemoryEntries([]);
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as DietDiaryEntry[];
    if (!Array.isArray(parsed)) {
      setMemoryEntries([]);
      return [];
    }
    const entries = parsed
      .filter((entry) => entry && typeof entry.id === 'string')
      .map((entry) => ({
        ...entry,
        mealType: normalizeMealType(entry.mealType),
        createdAt: validTimestamp(entry.createdAt) || validTimestamp(entry.loggedAt) || new Date(0).toISOString(),
        loggedAt: validTimestamp(entry.loggedAt),
      }))
      .sort(compareEntriesNewestFirst);
    setMemoryEntries(entries);
    return entries;
  } catch {
    setMemoryEntries([]);
    return [];
  }
}

async function writeEntries(entries: DietDiaryEntry[]) {
  const sortedEntries = [...entries].sort(compareEntriesNewestFirst);
  setMemoryEntries(sortedEntries);
  await AsyncStorage.setItem(scopedStorageKey(KEY), JSON.stringify(sortedEntries));
}

function compareEntriesNewestFirst(a: DietDiaryEntry, b: DietDiaryEntry) {
  const occurrenceDifference = timestampValue(b.createdAt) - timestampValue(a.createdAt);
  if (occurrenceDifference) return occurrenceDifference;
  const loggedDifference = timestampValue(b.loggedAt) - timestampValue(a.loggedAt);
  if (loggedDifference) return loggedDifference;
  return b.id.localeCompare(a.id);
}

async function ensureDir(directory: string) {
  const exists = await RNFS.exists(directory);
  if (!exists) await RNFS.mkdir(directory);
}

function managedLocalAssetPath(entry?: Pick<DietDiaryEntry, 'storedLocally' | 'uri'>) {
  if (!entry?.storedLocally || !entry.uri?.startsWith('file://')) return null;
  const path = entry.uri.replace(/^file:\/\//, '');
  const sessionDirectory = `${DIR}/${getActiveCacheSessionId()}/`;
  return path.startsWith(sessionDirectory) ? path : null;
}

async function unlinkManagedAssets(paths: Iterable<string>) {
  await Promise.all(
    [...new Set(paths)].map(async path => {
      const exists = await RNFS.exists(path).catch(() => false);
      if (exists) await RNFS.unlink(path).catch(() => undefined);
    }),
  );
}

/**
 * Older app versions could replace a synced entry's local URI without deleting
 * the copied photo. Reclaim only files whose entry now has a confirmed remote
 * image; pending/offline photos are never touched.
 */
async function reclaimPreviouslySyncedAssets(entries: DietDiaryEntry[]) {
  const sessionId = getActiveCacheSessionId();
  if (reclaimedAssetSessions.has(sessionId) || typeof RNFS.readDir !== 'function') return;
  reclaimedAssetSessions.add(sessionId);

  const syncedEntryIds = entries
    .filter(entry => Boolean(entry.remoteImageUrl?.trim()))
    .map(entry => `${entry.id}.`);
  if (!syncedEntryIds.length) return;

  const directory = `${DIR}/${sessionId}`;
  const exists = await RNFS.exists(directory).catch(() => false);
  if (!exists) return;
  const files = await RNFS.readDir(directory).catch(() => []);
  const stalePaths = files
    .filter(file => syncedEntryIds.some(prefix => file.name.startsWith(prefix)))
    .map(file => file.path);
  await unlinkManagedAssets(stalePaths);
}

async function persistAsset(asset: Asset, id: string): Promise<{ uri: string; storedLocally: boolean }> {
  const sourceUri = asset.uri;
  if (!sourceUri) throw new Error('No image selected');

  try {
    const directory = `${DIR}/${getActiveCacheSessionId()}`;
    await ensureDir(directory);
    const destination = `${directory}/${id}.${extensionFor(asset)}`;
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
  // Keep first paint fast; cleanup is best-effort and runs once per account.
  reclaimPreviouslySyncedAssets(entries).catch(() => undefined);
  return [...entries];
}

/** Synchronous first-paint data populated by the startup warm-up. */
export function peekDietDiaryEntries() {
  if (memoryEntriesSession !== getActiveCacheSessionId()) return null;
  return memoryEntries ? [...memoryEntries] : null;
}

export async function saveDietDiaryEntries(entries: DietDiaryEntry[]) {
  await writeEntries(entries);
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

export async function addSkippedDietDiaryEntry(mealType: MealType, createdAt = new Date().toISOString()) {
  const loggedAt = new Date().toISOString();
  const entry: DietDiaryEntry = {
    id: makeId(),
    kind: 'skip',
    status: 'skipped',
    mealType,
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
  const localPath = managedLocalAssetPath(entries.find(entry => entry.id === entryId));
  const remoteImageUrl = patch.remoteImageUrl?.trim();
  const next = entries.map(entry => {
    if (entry.id !== entryId) return entry;
    return {
      ...entry,
      ...patch,
      ...(remoteImageUrl
        ? {
            uri: remoteImageUrl,
            originalUri: undefined,
            storedLocally: false,
          }
        : null),
    };
  });
  await writeEntries(next);
  if (remoteImageUrl && localPath) await unlinkManagedAssets([localPath]);
}

export async function mergeRemoteDietDiaryEntries(
  remoteEntries: Array<{
    entryId: string;
    clientId?: string;
    imageUrl: string;
    mealType: MealType | 'Snack';
    note?: string;
    status?: 'logged' | 'skipped';
    createdAt: string;
    loggedAt?: string;
  }>,
) {
  const local = await readEntries();
  const byLocalId = new Map(local.map((entry) => [entry.id, entry]));
  const byRemoteId = new Map(local.filter((entry) => entry.remoteId).map((entry) => [entry.remoteId, entry]));

  const merged = [...local];
  const syncedLocalPaths: string[] = [];
  for (const remote of remoteEntries) {
    const existing = byRemoteId.get(remote.entryId) || (remote.clientId ? byLocalId.get(remote.clientId) : undefined);
    if (existing) {
      const remoteImageUrl = remote.imageUrl.trim();
      const localPath = remoteImageUrl ? managedLocalAssetPath(existing) : null;
      if (localPath) syncedLocalPaths.push(localPath);
      Object.assign(existing, {
        kind: remote.status === 'skipped' ? 'skip' : remoteImageUrl ? 'photo' : existing.kind || 'text',
        status: remote.status || existing.status || 'logged',
        remoteId: remote.entryId,
        remoteImageUrl,
        uri: remoteImageUrl || existing.uri,
        ...(remoteImageUrl
          ? { originalUri: undefined, storedLocally: false }
          : null),
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
        kind: remote.status === 'skipped' ? 'skip' : remote.imageUrl ? 'photo' : 'text',
        status: remote.status || 'logged',
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
  await unlinkManagedAssets(syncedLocalPaths);
  return loadDietDiaryEntries();
}

export async function deleteDietDiaryEntry(entryId: string) {
  const entries = await readEntries();
  const entry = entries.find((item) => item.id === entryId);
  const next = entries.filter((item) => item.id !== entryId);
  await writeEntries(next);

  const path = managedLocalAssetPath(entry);
  if (path) await unlinkManagedAssets([path]);
}
