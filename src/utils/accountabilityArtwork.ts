import type { ImageSourcePropType } from 'react-native';

const ACCOUNTABILITY_TASK_ARTWORK: Record<'diet' | 'workout' | 'refresh' | 'progress', ImageSourcePropType> = {
  diet: require('../assets/editorial/accountability-food-memory.jpg'),
  workout: require('../assets/editorial/accountability-workout.jpg'),
  refresh: require('../assets/editorial/accountability-plan.jpg'),
  progress: require('../assets/editorial/accountability-progress.jpg'),
};

const ACCOUNTABILITY_TASK_LABELS: Record<'diet' | 'workout' | 'refresh' | 'progress', string> = {
  diet: 'FOOD MEMORY',
  workout: 'TODAY\'S TRAINING',
  refresh: 'PLAN CHECK-IN',
  progress: 'WEEKLY REVIEW',
};

function knownTaskKind(kind: string): kind is keyof typeof ACCOUNTABILITY_TASK_ARTWORK {
  return kind === 'diet' || kind === 'workout' || kind === 'refresh' || kind === 'progress';
}

export function getAccountabilityTaskArtwork(kind: string) {
  return ACCOUNTABILITY_TASK_ARTWORK[knownTaskKind(kind) ? kind : 'progress'];
}

export function getAccountabilityTaskLabel(kind: string) {
  return ACCOUNTABILITY_TASK_LABELS[knownTaskKind(kind) ? kind : 'progress'];
}

export function canCreateAccountabilityCommitment(kind: string) {
  return kind === 'diet' || kind === 'workout';
}
