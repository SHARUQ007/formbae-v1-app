import React from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TrainerScreen } from './TrainerScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { changeCoach } from '../../services/trainerService';
import { runNativeCheckout } from '../../services/paymentService';
import { loadCoachBundleCached } from '../../services/preloadService';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn() }),
  useRoute: () => ({ key: 'coach', name: 'Trainer', params: { initialView: 'browse' } }),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/trainerService', () => ({ changeCoach: jest.fn(), fetchCoachHubPhotoFallbacks: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/paymentService', () => ({ runNativeCheckout: jest.fn() }));
jest.mock('../../services/preloadService', () => ({ loadCoachBundleCached: jest.fn(), peekCoachBundleCached: jest.fn(() => null) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const ava = {
  trainerId: 'ava', name: 'Ava', gender: '', photoUrl: '', expertise: 'AI Trainer', description: '', detailedDescription: '',
  languages: [], monthlyFee: '0', trainerKind: 'ai', trainerPersona: 'female_ai', availableSlotCount: 0, nextSlotAt: '',
  changeKind: 'swap', blockedUntil: '', includedInMembership: true, requiresUpgrade: false, canSelect: true,
  reason: 'Included with membership', upgradeAmountPaise: 0, paywallId: '',
};
const paidCoach = {
  ...ava, trainerId: 'coach-1', name: 'Manisha', expertise: 'Strength and Training Coach', trainerKind: 'human',
  trainerPersona: 'strength_training_coach', monthlyFee: '999', includedInMembership: false, requiresUpgrade: true,
  canSelect: false, reason: 'Open profile to continue to payment', upgradeAmountPaise: 99900, paywallId: 'trainer-coach-1',
};
const hub = { currentTrainer: null, trainers: [ava, paidCoach], access: { trainerAccessLabel: '', trainerAccessRemainingWeeks: 0, swapLockedUntil: '', upgradeLockedUntil: '' } };

let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Rafeek', mobile: '9999999999' }, status: {}, refreshStatus: jest.fn().mockResolvedValue({}) });
  (loadCoachBundleCached as jest.Mock).mockResolvedValue({ coachHub: hub, plan: null, photoFallbacks: {} });
  (runNativeCheckout as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const render = async () => { await act(async () => { renderer = create(<TrainerScreen />); }); };
const openProfile = async (name: string) => {
  const card = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`${name},`))[0];
  await act(async () => { card.props.onPress(); });
};
const profileCta = () => renderer.root.findAllByType(PrimaryButton).slice(-1)[0];

it('a paid coach cannot be taken without paying, only opened and then bought', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render();
  await openProfile('Manisha');
  // Step one is the profile; the action there is to unlock, not to switch.
  expect(profileCta().props.title).toBe('Unlock Manisha');
  await act(async () => { profileCta().props.onPress(); });
  expect(changeCoach).not.toHaveBeenCalled();

  // Step two is payment, taken from the confirmation on that profile.
  const confirm = alert.mock.calls.at(-1)![2]!.find(button => button.text === 'Continue to pay')!;
  await act(async () => { await confirm.onPress!(); });
  expect(runNativeCheckout).toHaveBeenCalledWith(expect.objectContaining({
    paywallId: 'trainer-coach-1',
    selectedTrainerId: 'coach-1',
    plan: expect.objectContaining({ amount: 99900 }),
  }));
  alert.mockRestore();
});

it('Ava is the one coach a membership already covers', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render();
  await openProfile('Ava');
  expect(profileCta().props.title).toBe('Choose Ava');
  await act(async () => { profileCta().props.onPress(); });
  expect(runNativeCheckout).not.toHaveBeenCalled();

  const confirm = alert.mock.calls.at(-1)![2]!.find(button => button.text === 'Change')!;
  await act(async () => { await confirm.onPress!(); });
  expect(changeCoach).toHaveBeenCalledWith('ava');
  alert.mockRestore();
});

it('coach cards never show a stored persona key', async () => {
  await render();
  const labels = renderer.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Manisha'))
    .map(node => node.props.accessibilityLabel as string);
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).not.toContain('_');
});

it('the included coach is shown apart from the ones that cost extra', async () => {
  await render();
  const headings = renderer.root
    .findAll(node => typeof node.type === 'string' && node.type.includes('Text'))
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''));
  expect(headings).toContain('INCLUDED IN YOUR PLAN');
  expect(headings).toContain('PERSONAL COACHES');
  // Ava reads as included; the paid coach advertises its monthly price instead.
  expect(headings).toContain('Included');
  expect(headings).toContain('₹999/mo');
});
