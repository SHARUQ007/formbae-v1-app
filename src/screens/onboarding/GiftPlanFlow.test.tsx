import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PaymentRequiredScreen } from './PaymentRequiredScreen';
import { GiftPlanDetailsScreen } from './GiftPlanDetailsScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { useAuthStore } from '../../store/authStore';
import { fetchPaymentStatus } from '../../services/paymentService';
import {
  fetchStoreProducts,
  presentStorePaywall,
  purchaseStoreProduct,
  recordHouseholdMembers,
  restoreStorePurchases,
  StorePurchaseError,
} from '../../services/storePurchaseService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ fetchPaymentStatus: jest.fn() }));
// Apple and Google own the transaction now, so the screens talk to the store rather than
// to Razorpay. The prices asserted below are the store's own strings for that reason.
jest.mock('../../services/storePurchaseService', () => {
  class StorePurchaseError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return {
    StorePurchaseError,
    fetchStoreProducts: jest.fn(),
    presentStorePaywall: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    recordHouseholdMembers: jest.fn(),
    restoreStorePurchases: jest.fn(),
  };
});
jest.mock('../../services/notificationService', () => ({ displayBehavioralNotification: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const solo = { planId: 'monthly__individual', storeProductId: 'formbae_monthly_individual', planName: 'Just you', amount: 4900, originalAmount: 24900, memberLimit: 1, popular: false, billing: 'recurring' };
const plusOne = { planId: 'monthly__plus_one', storeProductId: 'formbae_monthly_plus_one', planName: 'You + 1', amount: 9900, originalAmount: 49900, memberLimit: 2, popular: true, billing: 'recurring', benefits: ['Two separate plans'] };
const plusTwo = { planId: 'monthly__family_3', storeProductId: 'formbae_monthly_family_3', planName: 'Family of 3', amount: 14900, originalAmount: 74900, memberLimit: 3, popular: false, billing: 'recurring', benefits: ['Three separate plans'] };
const STORE_PRICES: Record<string, string> = {
  formbae_monthly_individual: '₹49.00',
  formbae_monthly_plus_one: '₹99.00',
  formbae_monthly_family_3: '₹149.00',
};
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
const rootReplace = jest.fn();
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true, getParent: jest.fn(() => ({ replace: rootReplace })) };

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Test', mobile: '9999999999' }, status: {}, refreshStatus: jest.fn().mockResolvedValue({}), logout: jest.fn() });
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(statusPayload);
  (fetchStoreProducts as jest.Mock).mockImplementation(async (ids: string[]) =>
    ids.filter((id) => STORE_PRICES[id]).map((id) => ({ productId: id, priceString: STORE_PRICES[id], title: id, description: '' })));
  (purchaseStoreProduct as jest.Mock).mockResolvedValue({ active: true, status: {} });
  (recordHouseholdMembers as jest.Mock).mockResolvedValue(undefined);
  (restoreStorePurchases as jest.Mock).mockResolvedValue({ active: true, status: {} });
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
  expect(copy).not.toContain('5-day refund money-back policy');
  // Both stores want the terms stated where the purchase happens.
  expect(copy).toContain('renews every month until you cancel');
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Log out' })).toHaveLength(0);
  expect(cta().props.title).toBe('Get started · ₹49.00');
});

it('a plan covering two people collects their details before charging anything', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  await render(paywall());
  // The +1 plan is preselected because it carries the most popular tag.
  expect(cta().props.title).toBe('Continue · ₹99.00');
  await act(async () => { await cta().props.onPress(); });
  expect(purchaseStoreProduct).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith('GiftPlanDetails', { planId: 'monthly__plus_one' });
});

it('a plan for one person goes straight to checkout', async () => {
  await render(paywall());
  expect(cta().props.title).toBe('Get started · ₹49.00');
  await act(async () => { await cta().props.onPress(); });
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(purchaseStoreProduct).toHaveBeenCalledTimes(1);
  expect(rootReplace).toHaveBeenCalledWith('SubscriptionSuccess', expect.objectContaining({ planName: 'Just you' }));
});

it.each([
  ['the trainee backed out', () => Promise.reject(new StorePurchaseError('CANCELLED', ''))],
  ['the store refused the card', () => Promise.reject(new StorePurchaseError('FAILED', 'Purchase failed'))],
  ['the payment is still clearing', () => Promise.resolve({ active: false, status: {} })],
])('does not celebrate an unconfirmed purchase: %s', async (_case, outcome) => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (purchaseStoreProduct as jest.Mock).mockImplementationOnce(outcome);
  await render(paywall());
  await act(async () => { await cta().props.onPress(); });
  expect(rootReplace).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('strikes the list price through beside what the store charges', async () => {
  // The anchor comes from the plan's configured full price, so the number shown is what an
  // admin set as standard rather than one invented on the screen.
  await render(paywall());
  const copy = renderer.root.findAllByType(Text).flatMap((node) =>
    React.Children.toArray(node.props.children).filter((child): child is string => typeof child === 'string')).join(' ');
  expect(copy).toContain('₹249');   // solo.originalAmount is 24900 paise
  expect(copy).toContain('₹49.00'); // and this is what the store will actually charge
});

it('strikes nothing through when the store gave us no price', async () => {
  // One number crossed out next to an em dash compares nothing.
  (fetchStoreProducts as jest.Mock).mockResolvedValue([]);
  await render(paywall());
  const copy = renderer.root.findAllByType(Text).flatMap((node) =>
    React.Children.toArray(node.props.children).filter((child): child is string => typeof child === 'string')).join(' ');
  expect(copy).not.toContain('₹249');
});

it('says the plans are unavailable rather than showing an empty price', async () => {
  // A store that returns nothing means the products do not exist yet, have not
  // propagated, or this build has no store. Whatever the cause, the screen must not print
  // an em dash where the price goes and a button trailing off after "Get started ·".
  (fetchStoreProducts as jest.Mock).mockResolvedValue([]);
  await render(paywall());
  const copy = renderer.root.findAllByType(Text).flatMap((node) =>
    React.Children.toArray(node.props.children).filter((child): child is string => typeof child === 'string')).join(' ');
  expect(copy).toContain('Plans aren’t available right now');
  expect(copy).not.toContain('₹49');
  // Nothing to press: the checkout is not drawn at all while there is nothing to buy.
  expect(renderer.root.findAllByType(PrimaryButton)).toHaveLength(0);
  expect(purchaseStoreProduct).not.toHaveBeenCalled();
});

it('shows the hosted paywall when an admin has asked for it', async () => {
  // Which paywall, and which offering, is an admin edit rather than a release. The price
  // of a store product cannot be changed from our side - the store charges, so the store
  // owns it - but which set of products is on offer can be.
  (fetchPaymentStatus as jest.Mock).mockResolvedValue({
    ...statusPayload, paywall: { hosted: true, offeringId: 'diwali' },
  });
  (presentStorePaywall as jest.Mock).mockResolvedValue({ active: true, status: {} });
  await render(paywall());
  await act(async () => { await cta().props.onPress(); });
  expect(presentStorePaywall).toHaveBeenCalledWith('diwali');
  expect(purchaseStoreProduct).not.toHaveBeenCalled();
  expect(rootReplace).toHaveBeenCalledWith('SubscriptionSuccess', expect.anything());
});

it('keeps household plans on our own screen, whatever the admin chose', async () => {
  // The hosted template has no concept of collecting who the extra memberships are for.
  (fetchPaymentStatus as jest.Mock).mockResolvedValue({
    ...multiPlanStatusPayload, paywall: { hosted: true },
  });
  await render(paywall());
  await act(async () => { await cta().props.onPress(); });
  expect(presentStorePaywall).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith('GiftPlanDetails', { planId: 'monthly__plus_one' });
});

it('offers to restore a purchase without buying again', async () => {
  // Apple requires this, and it is the honest answer for a reinstall or a new phone.
  await render(paywall());
  const restore = renderer.root.findByProps({ accessibilityLabel: 'Restore purchases' });
  await act(async () => { await restore.props.onPress(); });
  expect(restoreStorePurchases).toHaveBeenCalledTimes(1);
  expect(rootReplace).toHaveBeenCalledWith('SubscriptionSuccess', expect.anything());
});

it('the gift page opens on the person the survey implies', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  await render(giftPage());
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Log out' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Relationship: Mother. Tap to change.' }).length).toBeGreaterThan(0);
});

it('incomplete gift details never reach checkout', async () => {
  (fetchPaymentStatus as jest.Mock).mockResolvedValue(multiPlanStatusPayload);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(giftPage());
  await act(async () => { await cta().props.onPress(); });
  expect(purchaseStoreProduct).not.toHaveBeenCalled();

  await act(async () => { inputFor('Their name').props.onChangeText('Asha'); });
  await act(async () => { inputFor('Their mobile number').props.onChangeText('98765'); });
  await act(async () => { await cta().props.onPress(); });
  expect(purchaseStoreProduct).not.toHaveBeenCalled();
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

  // The store carries no metadata with a purchase, so the names are written down first
  // and read back when the entitlement arrives.
  expect(recordHouseholdMembers).toHaveBeenCalledWith('monthly__plus_one', [
    { relationship: 'mother', name: 'Asha', mobile: '9876543210' },
  ]);
  expect(purchaseStoreProduct).toHaveBeenCalledWith('formbae_monthly_plus_one');
  expect(rootReplace).toHaveBeenCalledWith('SubscriptionSuccess', expect.objectContaining({ planName: 'You + 1' }));
});
