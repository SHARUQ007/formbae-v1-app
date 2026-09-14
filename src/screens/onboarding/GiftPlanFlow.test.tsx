import React from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PaymentRequiredScreen } from './PaymentRequiredScreen';
import { GiftPlanDetailsScreen } from './GiftPlanDetailsScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { useAuthStore } from '../../store/authStore';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ fetchPaymentStatus: jest.fn(), runNativeCheckout: jest.fn() }));
jest.mock('../../services/notificationService', () => ({ displayBehavioralNotification: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const solo = { planId: 'monthly__individual', planName: 'Just you', amount: 4900, originalAmount: 24900, memberLimit: 1, popular: false, billing: 'recurring' };
const plusOne = { planId: 'monthly__plus_one', planName: 'You + 1', amount: 9900, originalAmount: 49900, memberLimit: 2, popular: true, billing: 'recurring', benefits: ['Two separate plans'] };
const plusTwo = { planId: 'monthly__family_3', planName: 'Family of 3', amount: 14900, originalAmount: 74900, memberLimit: 3, popular: false, billing: 'recurring', benefits: ['Three separate plans'] };
const statusPayload = {
  hasPaid: false,
  plans: [solo],
  paywallId: 'app-paywall',
  offerExpiresAt: new Date(Date.now() + 120000).toISOString(),
  householdSuggestion: [],
};
const multiPlanStatusPayload = {
  ...statusPayload,
  plans: [solo, plusOne, plusTwo],
  householdSuggestion: [{ relationship: 'mother', ageGroup: '50+', gender: 'female', label: 'your mother' }],
};

let renderer: ReactTestRenderer;
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true, getParent: jest.fn(() => ({ replace: jest.fn() })) };

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Test', mobile: '9999999999' }, status: {}, refreshStatus: jest.fn().mockResolvedValue({}), logout: jest.fn() });
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(statusPayload);
  (runNativeCheckout as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const render = async (element: React.ReactElement) => { await act(async () => { renderer = create(element); }); };
const paywall = () => <PaymentRequiredScreen navigation={navigation as never} route={{ name: 'PaymentRequired', key: 'pay' }} />;
const giftPage = () => (
  <GiftPlanDetailsScreen navigation={navigation as never} route={{ name: 'GiftPlanDetails', key: 'gift', params: { planId: 'monthly__plus_one' } } as never} />
);
const cta = () => renderer.root.findAllByType(PrimaryButton)[0];
const inputFor = (label: string) => renderer.root.findAllByType(FormInput).find(node => node.props.label === label)!;

it('shows one configured price as a full paywall without a redundant selector', async () => {
  await render(paywall());
  const copy = JSON.stringify(renderer.toJSON());
  expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
  expect(copy).toContain('Get started with your fitness journey.');
  expect(copy).toContain('Monthly · ');
  expect(copy).toContain('Just you');
  expect(copy).toContain('5-day refund money-back policy');
  expect(cta().props.title).toBe('Get started · ₹49');
});

it('a plan covering two people collects their details before charging anything', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  await render(paywall());
  // The +1 plan is preselected because it carries the most popular tag.
  expect(cta().props.title).toBe('Continue · ₹99');
  await act(async () => { await cta().props.onPress(); });
  expect(runNativeCheckout).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith('GiftPlanDetails', { planId: 'monthly__plus_one' });
});

it('a plan for one person goes straight to checkout', async () => {
  await render(paywall());
  expect(cta().props.title).toBe('Get started · ₹49');
  await act(async () => { await cta().props.onPress(); });
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(runNativeCheckout).toHaveBeenCalledTimes(1);
});

it('the gift page opens on the person the survey implies', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  await render(giftPage());
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Relationship: Mother. Tap to change.' }).length).toBeGreaterThan(0);
});

it('incomplete gift details never reach checkout', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(giftPage());
  await act(async () => { await cta().props.onPress(); });
  expect(runNativeCheckout).not.toHaveBeenCalled();

  await act(async () => { inputFor('Their name').props.onChangeText('Asha'); });
  await act(async () => { inputFor('Their mobile number').props.onChangeText('98765'); });
  await act(async () => { await cta().props.onPress(); });
  expect(runNativeCheckout).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalled();
  alert.mockRestore();
});

it('a completed gift is sent with the chosen person, name and number', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  await render(giftPage());
  await act(async () => { inputFor('Their name').props.onChangeText('Asha'); });
  // Typed with spaces and a country code, as people actually do.
  await act(async () => { inputFor('Their mobile number').props.onChangeText('+91 98765 43210'); });
  await act(async () => { await cta().props.onPress(); });

  expect(runNativeCheckout).toHaveBeenCalledWith(expect.objectContaining({
    householdMembers: [{ relationship: 'mother', name: 'Asha', mobile: '9876543210' }],
  }));
});
