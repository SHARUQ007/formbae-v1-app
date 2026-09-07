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

/**
 * Warms sources independently: one unavailable photo must never prevent the
 * rest of the app artwork from reaching the native image cache.
 */
export async function preloadImageSources(
  sources: Array<ImageSourcePropType | null | undefined>,
) {
  return Promise.allSettled(uniqueSources(sources).map(preloadImageSource));
}

/** Every bundled image a signed-in user can encounter across the main tabs. */
export function getMainAppArtworkSources(profileGender?: string) {
  const gender = String(profileGender || '').trim().toLowerCase();
  const membershipGender = gender === 'female' ? 'female' : 'male';

  return uniqueSources([
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
