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
