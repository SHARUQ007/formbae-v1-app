import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const LEGACY_STORAGE_KEY = 'formbae_seen_ready_plan';
const KEYCHAIN_SERVICE = 'formbae_seen_ready_plans';
const MAX_REMEMBERED_PLANS = 20;
let rememberedPlanIdsCache: string[] | null = null;
let rememberedPlanIdsRequest: Promise<string[]> | null = null;

function parsePlanIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch {
    // The original value was a single raw plan id, not JSON.
  }
  return [value];
}

async function readRememberedPlanIds(): Promise<string[]> {
  if (rememberedPlanIdsCache) return rememberedPlanIdsCache;
  if (!rememberedPlanIdsRequest) {
    rememberedPlanIdsRequest = Promise.all([
      AsyncStorage.getItem(LEGACY_STORAGE_KEY).catch(() => null),
      Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => false as const),
    ]).then(([localValue, secureValue]) => {
      rememberedPlanIdsCache = Array.from(new Set([
        ...parsePlanIds(localValue),
        ...parsePlanIds(secureValue ? secureValue.password : null),
      ])).slice(-MAX_REMEMBERED_PLANS);
      return rememberedPlanIdsCache;
    }).finally(() => {
      rememberedPlanIdsRequest = null;
    });
  }
  return rememberedPlanIdsRequest;
}

export async function hasSeenReadyPlan(planId: string): Promise<boolean> {
  if (!planId) return false;
  return (await readRememberedPlanIds()).includes(planId);
}

export async function markReadyPlanSeen(planId: string): Promise<void> {
  if (!planId) return;
  const remembered = (await readRememberedPlanIds()).filter((value) => value !== planId);
  rememberedPlanIdsCache = [...remembered, planId].slice(-MAX_REMEMBERED_PLANS);
  const serialized = JSON.stringify(rememberedPlanIdsCache);
  await Promise.all([
    AsyncStorage.setItem(LEGACY_STORAGE_KEY, serialized).catch(() => undefined),
    Keychain.setGenericPassword('ready-plans', serialized, { service: KEYCHAIN_SERVICE }).catch(() => undefined),
  ]);
}
