import type { ImageSourcePropType } from 'react-native';
import { resolveBodyGender, type BodyGender } from './weeklyMuscles';

type GenderedArtwork = Record<BodyGender, ImageSourcePropType>;

const BODY_PROFILE_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/profile-overview-female.jpg'),
  male: require('../assets/editorial/profile-overview-male.jpg'),
  neutral: require('../assets/editorial/profile-overview-neutral.jpg'),
};

const PLAN_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/progress-report-hero.jpg'),
  male: require('../assets/editorial/progress-report-hero-male.jpg'),
  neutral: require('../assets/editorial/progress-report-hero-neutral.jpg'),
};

function selectGenderedArtwork(
  artwork: GenderedArtwork,
  profileGender?: string,
) {
  return artwork[resolveBodyGender(profileGender)];
}

export function getBodyProfileArtwork(profileGender?: string) {
  return selectGenderedArtwork(BODY_PROFILE_ARTWORK, profileGender);
}

export function getPlanProfileArtwork(profileGender?: string) {
  return selectGenderedArtwork(PLAN_ARTWORK, profileGender);
}
