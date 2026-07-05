import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeWorkoutAction } from '../services/workoutService';

const PROGRESS_PREFIX = 'formbae_workout_progress:';
const QUEUE_KEY = 'formbae_workout_queue';

export type WorkoutProgress = {
  planDayId: string;
  completedExerciseIds: string[];
  setProgressByExercise?: Record<string, number>;
  updatedAt: string;
};

export async function loadWorkoutProgress(planDayId: string): Promise<WorkoutProgress> {
  const raw = await AsyncStorage.getItem(`${PROGRESS_PREFIX}${planDayId}`);
  if (!raw) return { planDayId, completedExerciseIds: [], updatedAt: '' };
  try {
    return JSON.parse(raw) as WorkoutProgress;
  } catch {
    return { planDayId, completedExerciseIds: [], updatedAt: '' };
  }
}

export async function saveWorkoutProgress(progress: WorkoutProgress) {
  await AsyncStorage.setItem(`${PROGRESS_PREFIX}${progress.planDayId}`, JSON.stringify(progress));
}

export async function clearWorkoutProgress(planDayId: string) {
  await AsyncStorage.removeItem(`${PROGRESS_PREFIX}${planDayId}`);
}

type QueuedAction = {
  id: string;
  planId: string;
  planDayId: string;
  action: 'exercise' | 'exerciseUndo' | 'day' | 'dayUndo';
  exerciseId?: string;
  workoutMode?: string;
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
  } catch {
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
