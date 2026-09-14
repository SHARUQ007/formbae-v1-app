import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FindingTrainerScreen } from './FindingTrainerScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { changeCoach, fetchCoachHub } from '../../services/trainerService';
import { runNativeCheckout } from '../../services/paymentService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/trainerService', () => ({ fetchCoachHub: jest.fn(), changeCoach: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ runNativeCheckout: jest.fn() }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const base = {
  gender: '', photoUrl: '', description: 'Short blurb', detailedDescription: 'The longer story about this coach',
  languages: ['English'], availableSlotCount: 0, nextSlotAt: '', changeKind: 'swap' as const, blockedUntil: '',
  reason: '', upgradeAmountPaise: 0, paywallId: '',
};
const ava = { ...base, trainerId: 'ava', name: 'Ava', expertise: 'AI Trainer', trainerKind: 'ai', monthlyFee: '0', canSelect: true, includedInMembership: true };
const paid = {
  ...base, trainerId: 'coach-1', name: 'Manisha', expertise: 'Strength and Training Coach', trainerKind: 'human',
  monthlyFee: '999', canSelect: false, includedInMembership: false, upgradeAmountPaise: 99900, paywallId: 'trainer-coach-1',
};

let renderer: ReactTestRenderer;
const navigation = { navigate: jest.fn(), replace: jest.fn() };
const hub = (trainers: unknown[], currentTrainer: unknown = null) => ({ currentTrainer, trainers, access: {} });

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Rafeek', mobile: '9999999999' }, status: {}, refreshStatus: jest.fn().mockResolvedValue({}) });
  (fetchCoachHub as jest.Mock).mockResolvedValue(hub([ava, paid]));
  (runNativeCheckout as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const render = async () => { await act(async () => { renderer = create(<FindingTrainerScreen navigation={navigation as never} route={{ name: 'FindingTrainer', key: 'coach' } as never} />); }); };
const texts = () => renderer.root
  .findAll(node => typeof node.type === 'string' && node.type.includes('Text'))
  .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''));
const cardFor = (name: string) => renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`${name},`))[0];

it('offers an upgrade alongside the coach the membership covers', async () => {
  await render();
  expect(texts()).toEqual(expect.arrayContaining(['INCLUDED IN YOUR MEMBERSHIP', 'UPGRADE TO A PERSONAL COACH', 'Ava', 'Manisha', '₹999/mo']));
});

it('a paid coach opens their own page instead of being selected here', async () => {
  await render();
  await act(async () => { cardFor('Manisha').props.onPress(); });
  expect(navigation.navigate).toHaveBeenCalledWith('CoachUpgrade', { trainerId: 'coach-1' });
  expect(changeCoach).not.toHaveBeenCalled();
  expect(runNativeCheckout).not.toHaveBeenCalled();
});

it('a coach already bought on the web is ready to pick here', async () => {
  // The backend marks a purchased coach selectable, so they sit with the included one.
  (fetchCoachHub as jest.Mock).mockResolvedValue(hub([ava, { ...paid, canSelect: true, reason: 'Current coach' }]));
  await render();
  await act(async () => { cardFor('Manisha').props.onPress(); });
  const cta = renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Continue with this coach')!;
  await act(async () => { await cta.props.onPress(); });
  expect(runNativeCheckout).not.toHaveBeenCalled();
  expect(changeCoach).toHaveBeenCalledWith('coach-1');
  expect(navigation.replace).toHaveBeenCalledWith('PaidWelcome');
});

it('a coach with no pricing set up is not offered as an upgrade', async () => {
  (fetchCoachHub as jest.Mock).mockResolvedValue(hub([ava, { ...paid, paywallId: '', monthlyFee: '', upgradeAmountPaise: 0 }]));
  await render();
  expect(texts()).not.toContain('UPGRADE TO A PERSONAL COACH');
  expect(texts()).not.toContain('Manisha');
});
