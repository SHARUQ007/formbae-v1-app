import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeWorkoutAction } from '../services/workoutService';
import type { WorkoutCompletionInput } from '../services/workoutService';
import { ApiError } from '../services/apiClient';

const PROGRESS_PREFIX = 'formbae_workout_progress:';
const QUEUE_KEY = 'formbae_workout_queue';

export type WorkoutSetLog = {
  setNumber: number;
  reps: string;
  weight: string;
  durationSec?: number;
  exerciseName?: string;
  plannedSets?: string;
  plannedReps?: string;
};

export type WorkoutProgress = {
  planDayId: string;
  workoutMode?: 'standard' | 'quick';
  completedExerciseIds: string[];
  setProgressByExercise?: Record<string, number>;
  setLogsByExercise?: Record<string, WorkoutSetLog[]>;
  selectedAlternatesByExercise?: Record<string, number>;
  activeExerciseId?: string;
  rest?: {
    nextExerciseId: string;
    startedAt: number;
    durationSec: number;
  };
  updatedAt: string;
};

function progressKey(planDayId: string, workoutMode: 'standard' | 'quick' = 'standard') {
  return `${PROGRESS_PREFIX}${planDayId}${workoutMode === 'quick' ? ':quick' : ''}`;
}

export async function loadWorkoutProgress(planDayId: string, workoutMode: 'standard' | 'quick' = 'standard'): Promise<WorkoutProgress> {
  const raw = await AsyncStorage.getItem(progressKey(planDayId, workoutMode));
  if (!raw) return { planDayId, completedExerciseIds: [], updatedAt: '' };
  try {
    return JSON.parse(raw) as WorkoutProgress;
  } catch {
    return { planDayId, completedExerciseIds: [], updatedAt: '' };
  }
}

export function hasWorkoutStarted(progress: WorkoutProgress): boolean {
  return Boolean(progress.activeExerciseId || progress.rest
    || progress.completedExerciseIds?.length
    || Object.values(progress.setProgressByExercise || {}).some(count => count > 0)
    || Object.values(progress.setLogsByExercise || {}).some(logs => logs.length > 0));
}

export async function saveWorkoutProgress(progress: WorkoutProgress) {
  await AsyncStorage.setItem(progressKey(progress.planDayId, progress.workoutMode), JSON.stringify(progress));
}

export async function clearWorkoutProgress(planDayId: string, workoutMode: 'standard' | 'quick' = 'standard') {
  await AsyncStorage.removeItem(progressKey(planDayId, workoutMode));
}

type QueuedAction = WorkoutCompletionInput & {
  id: string;
};

async function readQueue(): Promise<QueuedAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Attempts the mutation immediately. On network failure it is queued and
 * retried later via flushWorkoutQueue(), so progress is never lost.
 */
export async function completeWithQueue(params: Omit<QueuedAction, 'id'>): Promise<{ synced: boolean }> {
  try {
    await completeWorkoutAction(params);
    return { synced: true };
  } catch (error) {
    // A rejected payload or an inaccessible plan will not improve offline.
    // Keep the local workout available instead of claiming it was saved.
    if (error instanceof ApiError && !error.isNetwork && error.status >= 400 && error.status < 500
      && error.status !== 408 && error.status !== 429) throw error;
    const queue = await readQueue();
    queue.push({ ...params, id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    await writeQueue(queue);
    return { synced: false };
  }
}

export async function flushWorkoutQueue(): Promise<number> {
  const queue = await readQueue();
  if (!queue.length) return 0;
  const remaining: QueuedAction[] = [];
  let flushed = 0;
  for (const item of queue) {
    try {
      await completeWorkoutAction(item);
      flushed += 1;
    } catch {
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
  return flushed;
}
