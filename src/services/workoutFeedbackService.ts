import { apiRequest } from './apiClient';

export type WorkoutFeedbackSentiment = 'up' | 'down';

export async function submitWorkoutFeedback(params: {
  planId: string;
  planDayId: string;
  workoutMode: 'standard' | 'quick';
  sentiment: WorkoutFeedbackSentiment;
  feedbackText: string;
  exerciseId?: string;
  exerciseName?: string;
  replacedExerciseName?: string;
  preferredExerciseName?: string;
}) {
  return apiRequest<{ ok: boolean }>('/workouts/feedback', {
    method: 'POST',
    body: params,
  });
}
