import type { ImageSourcePropType } from 'react-native';

const ACCOUNTABILITY_TASK_ARTWORK: Record<'diet' | 'workout' | 'refresh' | 'progress', ImageSourcePropType> = {
  diet: require('../assets/editorial/accountability-food-memory.jpg'),
  workout: require('../assets/editorial/accountability-workout-card.jpg'),
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

export function accountabilityArtworkFrame(window: { width: number; height: number }, source: { width: number; height: number; scale?: number }, pixelRatio: number) {
  if (window.width <= 0 || window.height <= 0 || source.width <= 0 || source.height <= 0) return undefined;
  const density = Math.max(1, pixelRatio);
  const aspect = source.width / source.height;
  const nativeWidth = source.width * (source.scale || 1) / density;
  const width = Math.floor(Math.min(Math.max(window.width, window.height * aspect), nativeWidth) * density) / density;
  return {
    width,
    height: Math.floor(width / aspect * density) / density,
    left: Math.round((window.width - width) * 0.88 * density) / density,
  };
}

export function getAccountabilityTaskLabel(kind: string) {
  return ACCOUNTABILITY_TASK_LABELS[knownTaskKind(kind) ? kind : 'progress'];
}

export function canCreateAccountabilityCommitment(kind: string) {
  return kind === 'diet' || kind === 'workout';
}
