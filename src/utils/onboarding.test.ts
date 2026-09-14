import { nextPaidSetupStep } from './onboarding';
import { resolveOnboardingInitialRoute } from './routing';

const paid = { hasPaid: true, questionnaireCompleted: false, trainerAssigned: false, planReady: false };

test('new users start with an introduction to the setup journey', () => {
  expect(resolveOnboardingInitialRoute('questionnaire')).toBe('SetupWelcome');
});
test('web members finish only their missing setup steps', () => {
  expect(nextPaidSetupStep(paid)).toBe('ProfileSetup');
  expect(nextPaidSetupStep({ ...paid, trainerAssigned: true })).toBe('ProfileSetup');
  expect(nextPaidSetupStep({ ...paid, questionnaireCompleted: true })).toBe('FindingTrainer');
  expect(nextPaidSetupStep({ ...paid, questionnaireCompleted: true, trainerAssigned: true })).toBe('PlanPreparing');
  expect(nextPaidSetupStep({ ...paid, planReady: true })).toBe('Main');
});
test('an unverified or expired membership cannot bypass payment verification', () => {
  expect(nextPaidSetupStep({ ...paid, hasPaid: false, planReady: true })).toBe('PaymentSync');
});

it('an AI coach must ask its questions before any plan is built', () => {
  const withCoach = { hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false };
  expect(nextPaidSetupStep({ ...withCoach, coachQuestionsRequired: true, coachQuestionsCompleted: false })).toBe('CoachQuestions');
  expect(nextPaidSetupStep({ ...withCoach, coachQuestionsRequired: true, coachQuestionsCompleted: true })).toBe('PlanPreparing');
  // A human coach writes the plan themselves, so nothing is gated on questions.
  expect(nextPaidSetupStep({ ...withCoach, coachQuestionsRequired: false, coachQuestionsCompleted: false })).toBe('PlanPreparing');
  // An older backend that says nothing must not strand anyone on a screen they cannot pass.
  expect(nextPaidSetupStep(withCoach)).toBe('PlanPreparing');
  // Earlier steps still come first.
  expect(nextPaidSetupStep({ ...withCoach, trainerAssigned: false, coachQuestionsRequired: true, coachQuestionsCompleted: false })).toBe('FindingTrainer');
  expect(nextPaidSetupStep({ ...withCoach, planReady: true, coachQuestionsRequired: true, coachQuestionsCompleted: false })).toBe('Main');
});
