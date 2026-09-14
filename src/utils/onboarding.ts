import type { UserStatus } from '../types/api';

/** Membership is checked before any paid setup step; completed steps are resumable. */
export function nextPaidSetupStep(
  status: Pick<UserStatus, 'hasPaid' | 'questionnaireCompleted' | 'trainerAssigned' | 'planReady'>
    & Partial<Pick<UserStatus, 'coachQuestionsRequired' | 'coachQuestionsCompleted'>>,
) {
  if (!status.hasPaid) return 'PaymentSync';
  if (status.planReady) return 'Main';
  if (!status.questionnaireCompleted) return 'ProfileSetup';
  if (!status.trainerAssigned) return 'FindingTrainer';
  // An AI coach cannot write a plan until it has asked its own questions.
  if (status.coachQuestionsRequired && !status.coachQuestionsCompleted) return 'CoachQuestions';
  return 'PlanPreparing';
}
