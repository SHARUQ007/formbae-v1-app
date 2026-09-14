import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CoachUpgradeScreen } from './CoachUpgradeScreen';
import { CoachUnlockedScreen } from './CoachUnlockedScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { changeCoach, fetchCoachHub } from '../../services/trainerService';
import { runNativeCheckout } from '../../services/paymentService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/trainerService', () => ({ fetchCoachHub: jest.fn(), changeCoach: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ runNativeCheckout: jest.fn() }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const paid = {
  trainerId: 'coach-1', name: 'Amal Rajan', gender: '', photoUrl: '', expertise: 'Strength and Training Coach',
  description: 'Short blurb', detailedDescription: 'The longer story about this coach', languages: ['English', 'Hindi'],
  monthlyFee: '999', trainerKind: 'human', availableSlotCount: 0, nextSlotAt: '', changeKind: 'swap' as const,
  blockedUntil: '', canSelect: false, reason: '', upgradeAmountPaise: 99900, paywallId: 'trainer-coach-1',
};

let renderer: ReactTestRenderer;
const refreshStatus = jest.fn().mockResolvedValue({});
const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
const route = (name: string) => ({ name, key: name, params: { trainerId: 'coach-1' } });

beforeEach(() => {
  jest.clearAllMocks();
  refreshStatus.mockResolvedValue({});
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Rafeek', mobile: '9999999999' }, status: {}, refreshStatus });
  (fetchCoachHub as jest.Mock).mockResolvedValue({ currentTrainer: null, trainers: [paid], access: {} });
  (runNativeCheckout as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const texts = () => renderer.root
  .findAll(node => typeof node.type === 'string' && node.type.includes('Text'))
  .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''));
const cta = () => renderer.root.findAllByType(PrimaryButton).slice(-1)[0];

const renderUpgrade = async () => {
  await act(async () => { renderer = create(<CoachUpgradeScreen navigation={navigation as never} route={route('CoachUpgrade') as never} />); });
};
const renderUnlocked = async () => {
  await act(async () => { renderer = create(<CoachUnlockedScreen navigation={navigation as never} route={route('CoachUnlocked') as never} />); });
};

it('the coach page is where you read about them and see what you pay', async () => {
  await renderUpgrade();
  expect(texts()).toEqual(expect.arrayContaining([
    'Amal Rajan', 'Strength and Training Coach', '₹999/mo', 'The longer story about this coach',
  ]));
  expect(texts().join(' ')).toContain('added to the same subscription');
  expect(cta().props.title).toBe('Unlock Amal · ₹999/mo');
  // The paying action reads as the flow's primary: gold, with an unlock icon.
  expect(cta().props.icon).toBe('unlock');
  expect(StyleSheet.flatten(cta().props.style)).toMatchObject({ backgroundColor: colors.gold });
});

it('paying takes you to the confirmation rather than straight back into the flow', async () => {
  await renderUpgrade();
  await act(async () => { await cta().props.onPress(); });
  expect(runNativeCheckout).toHaveBeenCalledWith(expect.objectContaining({
    paywallId: 'trainer-coach-1', selectedTrainerId: 'coach-1', plan: expect.objectContaining({ amount: 99900 }),
  }));
  expect(refreshStatus).toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('CoachUnlocked', { trainerId: 'coach-1' });
});

it('a cancelled or failed payment keeps you on the coach page', async () => {
  (runNativeCheckout as jest.Mock).mockResolvedValueOnce({ cancelled: true });
  await renderUpgrade();
  await act(async () => { await cta().props.onPress(); });
  expect(navigation.replace).not.toHaveBeenCalled();

  (runNativeCheckout as jest.Mock).mockResolvedValueOnce({ success: false, error: 'Card declined' });
  await act(async () => { await cta().props.onPress(); });
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(texts()).toContain('Card declined');
});

it('the thank you screen confirms the coach and what was added to the subscription', async () => {
  await renderUnlocked();
  expect(texts()).toEqual(expect.arrayContaining(["You're in with Amal", 'Amal Rajan', '₹999/mo']));
  expect(texts().join(' ')).toContain('added to your subscription');
});

it('the flow only continues from the thank you screen, after a status refresh', async () => {
  await renderUnlocked();
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => { await cta().props.onPress(); });
  expect(refreshStatus).toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('PaidWelcome');
});

it('the coach is assigned even if checkout did not do it server-side', async () => {
  await renderUnlocked();
  expect(changeCoach).toHaveBeenCalledWith('coach-1');

  jest.clearAllMocks();
  (fetchCoachHub as jest.Mock).mockResolvedValue({ currentTrainer: paid, trainers: [paid], access: {} });
  await renderUnlocked();
  expect(changeCoach).not.toHaveBeenCalled();
});
