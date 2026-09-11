import type { ImageRequireSource } from 'react-native';
import { resolveBodyGender, type BodyGender } from './weeklyMuscles';

type GenderedArtwork = Record<BodyGender, ImageRequireSource>;

const BODY_PROFILE_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/profile-body-v2-female.jpg'),
  male: require('../assets/editorial/profile-body-v2-male.jpg'),
  neutral: require('../assets/editorial/profile-body-v2-neutral.jpg'),
};

const PLAN_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/profile-plan-v2-female.jpg'),
  male: require('../assets/editorial/profile-plan-v2-male.jpg'),
  neutral: require('../assets/editorial/profile-plan-v2-neutral.jpg'),
};

const GYM_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/profile-gym-female.jpg'),
  male: require('../assets/editorial/profile-gym-male.jpg'),
  neutral: require('../assets/editorial/profile-gym-neutral.jpg'),
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

export function getGymProfileArtwork(profileGender?: string) {
  return selectGenderedArtwork(GYM_ARTWORK, profileGender);
}
