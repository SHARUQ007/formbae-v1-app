import {
  Image,
  type ImageSourcePropType,
  type ImageURISource,
} from 'react-native';
import { getAuthToken } from './apiClient';
import {
  resolveDietDiaryImageUrl,
  shouldAuthenticateDietDiaryImage,
} from './dietDiaryService';
import type { DietDiaryEntry } from '../store/dietDiaryStore';
import type { AccountabilityBaeSummary, CoachHubPayload, TrainerInfo } from '../types/api';
import { getAccountabilityBaeArtwork } from '../utils/accountabilityBaeArtwork';
import { getAccountabilityTaskArtwork } from '../utils/accountabilityArtwork';
import { getCoachArtworkSource } from '../utils/coachArtwork';
import { REPORT_IMAGE_POOLS } from '../utils/reportArtworkLibrary';
import { WEEKLY_GOAL_ARTWORK } from '../utils/weeklyGoalArtwork';
import {
  getBodyProfileArtwork,
  getGymProfileArtwork,
  getPlanProfileArtwork,
} from '../utils/profileArtwork';
import {
  getDietReportEmptyArtwork,
  getProgressReportArtwork,
} from '../utils/reportArtwork';

const APP_ICON = require('../assets/app-icon.png') as ImageSourcePropType;
const BRAND_MARK = require('../assets/formbae-mark-transparent.png') as ImageSourcePropType;
const COACH_DISCOVERY_ART = require('../assets/editorial/coach-discovery.jpg') as ImageSourcePropType;

const MEMBERSHIP_ARTWORK = {
  female: [
    require('../assets/membership/training-female.jpg'),
    require('../assets/membership/nutrition-female.jpg'),
    require('../assets/membership/progress-female.jpg'),
  ],
  male: [
    require('../assets/membership/training-male.jpg'),
    require('../assets/membership/nutrition-male.jpg'),
    require('../assets/membership/progress-male.jpg'),
  ],
} satisfies Record<'female' | 'male', ImageSourcePropType[]>;

function resolvedSource(source: ImageSourcePropType) {
  const resolved = Image.resolveAssetSource(source);
  const uriSource = typeof source === 'object' && !Array.isArray(source)
    ? source as ImageURISource
    : undefined;
  return resolved
    ? { ...resolved, headers: uriSource?.headers }
    : undefined;
}

function sourceKey(source: ImageSourcePropType) {
  const resolved = resolvedSource(source);
  if (!resolved?.uri) return '';
  const headers = resolved.headers
    ? Object.entries(resolved.headers).sort(([a], [b]) => a.localeCompare(b))
    : [];
  return `${resolved.uri}:${JSON.stringify(headers)}`;
}

function uniqueSources(sources: Array<ImageSourcePropType | null | undefined>) {
  const seen = new Set<string>();
  return sources.filter((source): source is ImageSourcePropType => {
    if (!source) return false;
    const key = sourceKey(source);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function preloadImageSource(source: ImageSourcePropType) {
  const resolved = resolvedSource(source);
  if (!resolved?.uri) return false;

  if (resolved.headers && Object.keys(resolved.headers).length) {
    await Image.getSizeWithHeaders(resolved.uri, resolved.headers);
    return true;
  }

  // Inline and content-provider images cannot be downloaded separately; asking
  // the native loader for their dimensions still warms its decode path.
  if (/^(?:data|content):/i.test(resolved.uri)) {
    await Image.getSize(resolved.uri);
    return true;
  }

  // Prefetch bundled file/resource URIs too. getSize alone can resolve metadata
  // without decoding pixels, which caused blank first frames after fresh login.
  const cached = await Image.prefetch(resolved.uri).catch(() => false);
  if (!cached) await Image.getSize(resolved.uri);
  return true;
}

const MAX_IMAGE_LOADS = 4;
const pendingImages = new Map<string, Promise<boolean>>();
const imageQueue: Array<() => void> = [];
let activeImages = 0;

function drainImageQueue() {
  while (activeImages < MAX_IMAGE_LOADS && imageQueue.length) imageQueue.shift()!();
}

function scheduleImage(source: ImageSourcePropType) {
  const key = sourceKey(source);
  const pending = pendingImages.get(key);
  if (pending) return pending;
  const promise = new Promise<boolean>((resolve, reject) => {
    imageQueue.push(() => {
      activeImages += 1;
      preloadImageSource(source).then(resolve, reject).finally(() => {
        pendingImages.delete(key);
        activeImages -= 1;
        drainImageQueue();
      });
    });
  });
  pendingImages.set(key, promise);
  drainImageQueue();
  return promise;
}

/**
 * Warms sources independently: one unavailable photo must never prevent the
 * rest of the app artwork from reaching the native image cache. Share pending
 * sources across callers and bound concurrent native loads to avoid startup spikes.
 */
export async function preloadImageSources(
  sources: Array<ImageSourcePropType | null | undefined>,
) {
  return Promise.allSettled(uniqueSources(sources).map(scheduleImage));
}

/** Above-the-fold artwork must not wait for profile or remote image requests. */
export function getAccountabilityArtworkSources() {
  return uniqueSources([
    getAccountabilityTaskArtwork('workout'),
    getAccountabilityTaskArtwork('diet'),
    getAccountabilityBaeArtwork('inactive'),
    getAccountabilityBaeArtwork('matched'),
    getAccountabilityTaskArtwork('refresh'),
    getAccountabilityTaskArtwork('progress'),
  ]);
}

/** Decode a useful card-sized bitmap instead of a 2px thumbnail. Bound memory on tablets. */
export function imageWarmupSize(source: ImageSourcePropType, screenWidth: number) {
  const resolved = Image.resolveAssetSource(source);
  const width = Math.min(400, Math.max(1, screenWidth - 48));
  const aspect = resolved?.width && resolved?.height ? resolved.width / resolved.height : 1.5;
  return { width, height: Math.min(280, width / aspect) };
}

/** Every bundled image a signed-in user can encounter across the main tabs. */
export function getMainAppArtworkSources(profileGender?: string) {
  const gender = String(profileGender || '').trim().toLowerCase();
  const membershipGender = gender === 'female' ? 'female' : 'male';

  return uniqueSources([
    ...getAccountabilityArtworkSources(),
    APP_ICON,
    BRAND_MARK,
    COACH_DISCOVERY_ART,
    getCoachArtworkSource({ name: 'Ava' }),
    getAccountabilityTaskArtwork('diet'),
    getAccountabilityTaskArtwork('workout'),
    getAccountabilityTaskArtwork('refresh'),
    getAccountabilityTaskArtwork('progress'),
    getAccountabilityBaeArtwork('inactive'),
    getAccountabilityBaeArtwork('matched'),
    getBodyProfileArtwork(profileGender),
    getPlanProfileArtwork(profileGender),
    getGymProfileArtwork(profileGender),
    getProgressReportArtwork(profileGender),
    REPORT_IMAGE_POOLS.weeklyCover[0].source,
    WEEKLY_GOAL_ARTWORK.training,
    WEEKLY_GOAL_ARTWORK.nutrition,
    getDietReportEmptyArtwork(profileGender),
    ...MEMBERSHIP_ARTWORK[membershipGender],
  ]);
}

export function getCoachImageSources(
  coachHub: CoachHubPayload,
  assignedTrainer?: TrainerInfo,
) {
  const coaches = [
    ...(coachHub.currentTrainer ? [coachHub.currentTrainer] : []),
    ...coachHub.trainers,
  ];
  return uniqueSources([
    getCoachArtworkSource({
      name: assignedTrainer?.name,
      photoUrl: assignedTrainer?.trainerPhotoUrl,
    }),
    ...coaches.map(coach =>
      getCoachArtworkSource({ name: coach.name, photoUrl: coach.photoUrl }),
    ),
  ]);
}

export function getDietDiaryImageSources(entries: DietDiaryEntry[]) {
  const token = getAuthToken();
  return uniqueSources(
    entries.map(entry => {
      const uri = resolveDietDiaryImageUrl(
        entry.remoteImageUrl || entry.uri || '',
      );
      if (!uri) return null;
      if (token && shouldAuthenticateDietDiaryImage(uri)) {
        return { uri, headers: { Authorization: `Bearer ${token}` } };
      }
      return { uri };
    }),
  );
}

export function getAccountabilityProofSources(summary: AccountabilityBaeSummary) {
  const token = getAuthToken();
  return uniqueSources(
    [summary.yourProofUrl, summary.partnerProofUrl].map(path => {
      if (!path) return null;
      const uri = resolveDietDiaryImageUrl(path);
      if (token && shouldAuthenticateDietDiaryImage(uri)) {
        return { uri, headers: { Authorization: `Bearer ${token}` } };
      }
      return { uri };
    }),
  );
}

export function dedupeImageSources(
  sources: Array<ImageSourcePropType | null | undefined>,
) {
  return uniqueSources(sources);
}
