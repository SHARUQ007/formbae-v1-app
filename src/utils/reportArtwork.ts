import type { ImageSourcePropType } from 'react-native';
import { resolveBodyGender, type BodyGender } from './weeklyMuscles';
import { getReportCover } from './reportArtworkLibrary';

type GenderedArtwork = Record<BodyGender, ImageSourcePropType>;

const REPORT_EDITORIAL_ARTWORK = {
  nutrition: require('../assets/editorial/report-nutrition-editorial.jpg'),
  training: require('../assets/editorial/report-training-editorial.jpg'),
};

export function getReportEditorialArtwork(topic: 'nutrition' | 'training', reportKey = '') {
  return reportKey ? getReportCover(topic, reportKey) : REPORT_EDITORIAL_ARTWORK[topic];
}

const PROGRESS_REPORT_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/progress-report-hero.jpg'),
  male: require('../assets/editorial/progress-report-hero-male.jpg'),
  neutral: require('../assets/editorial/progress-report-hero-neutral.jpg'),
};

const DIET_REPORT_EMPTY_ARTWORK: GenderedArtwork = {
  female: require('../assets/editorial/diet-report-empty-hero.jpg'),
  male: require('../assets/editorial/diet-report-empty-hero-male.jpg'),
  neutral: require('../assets/editorial/diet-report-empty-hero-neutral.jpg'),
};

function selectGenderedArtwork(artwork: GenderedArtwork, profileGender?: string) {
  return artwork[resolveBodyGender(profileGender)];
}

export function getProgressReportArtwork(profileGender?: string) {
  return selectGenderedArtwork(PROGRESS_REPORT_ARTWORK, profileGender);
}

export function getDietReportEmptyArtwork(profileGender?: string) {
  return selectGenderedArtwork(DIET_REPORT_EMPTY_ARTWORK, profileGender);
}
