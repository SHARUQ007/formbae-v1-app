import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PaidWelcomeScreen } from './PaidWelcomeScreen';
import { PlanPreparingScreen } from './PlanPreparingScreen';
import { PaymentSyncScreen } from './PaymentSyncScreen';
import { FindingTrainerScreen } from './FindingTrainerScreen';
import { SetupOverview } from '../../components/SetupOverview';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { createOnboardingPlan, fetchOnboardingPlanState } from '../../services/onboardingService';
import { syncPayment } from '../../services/paymentService';
import { changeCoach, fetchCoachHub } from '../../services/trainerService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/onboardingService', () => ({ createOnboardingPlan: jest.fn(), fetchOnboardingPlanState: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ syncPayment: jest.fn() }));
jest.mock('../../services/trainerService', () => ({ changeCoach: jest.fn(), fetchCoachHub: jest.fn() }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));
const paid = { hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false, recommendedNextScreen: 'paid_welcome' };
const refreshStatus = jest.fn();
let renderer: ReactTestRenderer;
const navigation = { navigate: jest.fn(), replace: jest.fn(), getParent: jest.fn(() => ({ replace: jest.fn() })) };

beforeEach(() => {
  jest.clearAllMocks();
  refreshStatus.mockResolvedValue(paid);
  (useAuthStore as jest.Mock).mockReturnValue({ status: paid, refreshStatus, logout: jest.fn() });
  (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'idle' });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
async function render(element: React.ReactElement) { await act(async () => { renderer = create(element); }); }

it('paid member continues from fresh server facts rather than a stale coach selection', async () => {
  await render(<PaidWelcomeScreen navigation={navigation as never} route={{ name: 'PaidWelcome', key: 'paid' }} />);
  refreshStatus.mockResolvedValue({ ...paid, trainerAssigned: false });
  await act(async () => { await renderer.root.findByType(SetupOverview).props.onContinue(); });
  expect(navigation.navigate).toHaveBeenCalledWith('FindingTrainer');
});
it('creating a first plan is an explicit action, then shows a ready state', async () => {
  (createOnboardingPlan as jest.Mock).mockResolvedValue({ status: 'completed', planId: 'p1' });
  await render(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'plan' }} />);
  expect(createOnboardingPlan).not.toHaveBeenCalled();
  const button = renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Create my workout plan')!;
  await act(async () => { await button.props.onPress(); });
  expect(createOnboardingPlan).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.title === 'Enter FormBae')).toBe(true);
});
it('resumes a running build without starting another request', async () => {
  (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'building' });
  await render(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'plan' }} />);
  expect(createOnboardingPlan).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.title === 'Check plan status')).toBe(true);
});
it('a lost build response is reconciled with the saved plan', async () => {
  (createOnboardingPlan as jest.Mock).mockRejectedValue(new Error('timeout'));
  await render(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'plan' }} />);
  (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'completed', planId: 'p1' });
  await act(async () => { await renderer.root.findAllByType(PrimaryButton)[0].props.onPress(); });
  expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.title === 'Enter FormBae')).toBe(true);
});
it('failed payment verification does not claim membership is active', async () => {
  (syncPayment as jest.Mock).mockRejectedValue(new Error('offline'));
  await render(<PaymentSyncScreen navigation={navigation as never} route={{ name: 'PaymentSync', key: 'sync' }} />);
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.title === 'Check again')).toBe(true);
});
it('coach selection only offers included coaches and persists the selected coach', async () => {
  const coach = { trainerId: 'ava', name: 'Ava', expertise: 'AI coach', canSelect: true, languages: ['English'], photoUrl: '' };
  (fetchCoachHub as jest.Mock).mockResolvedValue({ currentTrainer: null, trainers: [coach, { ...coach, trainerId: 'upgrade', name: 'Upgrade coach', requiresUpgrade: true }] });
  await render(<FindingTrainerScreen navigation={navigation as never} route={{ name: 'FindingTrainer', key: 'coach' }} />);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Upgrade coach, AI coach' })).toHaveLength(0);
  await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'Ava, AI coach' })[0].props.onPress(); });
  await act(async () => { await renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Continue with this coach')!.props.onPress(); });
  expect(changeCoach).toHaveBeenCalledWith('ava');
  expect(navigation.replace).toHaveBeenCalledWith('PaidWelcome');
});
