import type { ImageSourcePropType } from 'react-native';
import type { AccountabilityBaeSummary } from '../types/api';

const DISCOVERY_ARTWORK = require('../assets/editorial/accountability-bae-discovery.jpg');
const CONNECTED_ARTWORK = require('../assets/editorial/accountability-bae-connected.jpg');

export function getAccountabilityBaeArtwork(status?: AccountabilityBaeSummary['status']): ImageSourcePropType {
  return status === 'matched' ? CONNECTED_ARTWORK : DISCOVERY_ARTWORK;
}

export function getAccountabilityBaeModeCaption(status?: AccountabilityBaeSummary['status']) {
  if (status === 'matched') return 'Connected';
  if (status === 'waiting') return 'Matching';
  if (status === 'locked') return 'Locked';
  return 'Work out together';
}
