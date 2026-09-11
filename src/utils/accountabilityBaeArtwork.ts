import type { ImageRequireSource } from 'react-native';
import type { AccountabilityBaeSummary } from '../types/api';

const DISCOVERY_ARTWORK = require('../assets/editorial/accountability-bae-discovery-square.jpg');
const CONNECTED_ARTWORK = require('../assets/editorial/accountability-bae-connected.jpg');

export function getAccountabilityBaeArtwork(status?: AccountabilityBaeSummary['status']): ImageRequireSource {
  return status === 'matched' ? CONNECTED_ARTWORK : DISCOVERY_ARTWORK;
}

/** The API uses waiting for both an invite and an active automatic search. */
export function getPartnerState(status?: AccountabilityBaeSummary['status'], preference?: AccountabilityBaeSummary['preference']) {
  if (status === 'waiting') return preference === 'friend' ? 'invite' : 'matching';
  return status;
}

export function getAccountabilityBaeModeCaption(status?: AccountabilityBaeSummary['status'], preference?: AccountabilityBaeSummary['preference']) {
  const state = getPartnerState(status, preference);
  if (state === 'matched') return 'Connected';
  if (state === 'invite') return 'Invite a friend';
  if (state === 'matching') return 'Matching';
  if (state === 'locked') return 'Locked';
  return state === 'inactive' ? 'Train together' : 'Loading';
}
