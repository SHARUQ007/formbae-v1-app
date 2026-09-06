import type { ImageSourcePropType } from 'react-native';
import { getBackendApiBaseUrl, getSiteUrl } from '../constants/config';

const AVA_COACH_ARTWORK = require('../assets/editorial/ava-coach-gold.jpg') as ImageSourcePropType;

type CoachArtworkInput = {
  name?: string;
  photoUrl?: string;
};

function isAvaArtwork(input: CoachArtworkInput) {
  const name = String(input.name || '').trim().toLowerCase();
  const photoUrl = String(input.photoUrl || '').trim().toLowerCase();
  return /^ava(?:\s|$)/.test(name) || photoUrl.includes('/ai-questionnaire/goal-baseline.webp');
}

/** Uses the bundled gold Ava portrait so her identity is consistent and instant. */
export function getCoachArtworkSource(input: CoachArtworkInput): ImageSourcePropType | null {
  if (isAvaArtwork(input)) return AVA_COACH_ARTWORK;
  const photoUrl = String(input.photoUrl || '').trim();
  if (!photoUrl) return null;
  if (/^https?:\/\//i.test(photoUrl)) return { uri: photoUrl };
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(photoUrl)) {
    return { uri: photoUrl };
  }
  if (photoUrl.startsWith('/api/mobile/')) {
    return { uri: `${getBackendApiBaseUrl()}${photoUrl}` };
  }
  if (photoUrl.startsWith('/')) return { uri: `${getSiteUrl()}${photoUrl}` };
  if (/^(?:file|content):\/\//i.test(photoUrl)) return { uri: photoUrl };
  return null;
}
