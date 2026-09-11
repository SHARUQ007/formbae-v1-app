import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeWorkoutAction, type WorkoutCompletionInput } from '../services/workoutService';
import { ApiError } from '../services/apiClient';
import { clearWorkoutProgress, completeWithQueue, flushWorkoutQueue, loadWorkoutProgress, saveWorkoutProgress } from './workoutStore';

jest.mock('../services/workoutService', () => ({ completeWorkoutAction: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(completeWorkoutAction).mockReset();
});

it('retains exact performed content in an offline queue after progress is cleared', async () => {
  const payload: WorkoutCompletionInput = {
    planId: 'plan', planDayId: 'day', action: 'day', workoutMode: 'quick',
    exercises: [{ exerciseId: 'quick_bodyweight_1_1', name: 'Plank', completed: true, sets: [{ setNumber: '1', reps: '', weight: '', durationSec: '29' }] }],
  };
  jest.mocked(completeWorkoutAction).mockRejectedValueOnce(new Error('Offline'));
  expect(await completeWithQueue(payload)).toEqual({ synced: false });
  await clearWorkoutProgress('day', 'quick');
  jest.mocked(completeWorkoutAction).mockResolvedValue({ ok: true, completed: true, date: '2026-09-12' });
  expect(await flushWorkoutQueue()).toBe(1);
  expect(completeWorkoutAction).toHaveBeenLastCalledWith(expect.objectContaining(payload));
  expect(await flushWorkoutQueue()).toBe(0);
});

it('keeps quick and standard set history isolated for the same plan day', async () => {
  await saveWorkoutProgress({ planDayId: 'day', workoutMode: 'standard', completedExerciseIds: ['bench'], updatedAt: '' });
  await saveWorkoutProgress({ planDayId: 'day', workoutMode: 'quick', completedExerciseIds: ['plank'], updatedAt: '' });
  expect((await loadWorkoutProgress('day')).completedExerciseIds).toEqual(['bench']);
  expect((await loadWorkoutProgress('day', 'quick')).completedExerciseIds).toEqual(['plank']);
  await clearWorkoutProgress('day', 'quick');
  expect((await loadWorkoutProgress('day', 'quick')).completedExerciseIds).toEqual([]);
  expect((await loadWorkoutProgress('day')).completedExerciseIds).toEqual(['bench']);
});

it('does not report a rejected workout as saved offline', async () => {
  jest.mocked(completeWorkoutAction).mockRejectedValueOnce(new ApiError('Plan unavailable', 404));
  await expect(completeWithQueue({ planId: 'missing', planDayId: 'day', action: 'day' })).rejects.toThrow('Plan unavailable');
  expect(await flushWorkoutQueue()).toBe(0);
});
