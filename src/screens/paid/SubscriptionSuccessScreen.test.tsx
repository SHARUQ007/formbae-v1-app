import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SubscriptionSuccessScreen } from './SubscriptionSuccessScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const navigation = { replace: jest.fn() };
const refreshStatus = jest.fn();
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  refreshStatus.mockResolvedValue({ hasPaid: true, recommendedNextScreen: 'paid_welcome' });
  (useAuthStore as jest.Mock).mockReturnValue({ user: { name: 'Alex Member' }, refreshStatus });
});
afterEach(() => { act(() => renderer.unmount()); });
async function render(renewal = false) {
  await act(async () => {
    renderer = create(<SubscriptionSuccessScreen navigation={navigation as never} route={{
      key: 'success', name: 'SubscriptionSuccess',
      params: { planName: 'Just you', nextScreen: 'paid_welcome', renewal },
    }} />);
  });
}
const continueButton = () => renderer.root.findByType(PrimaryButton);

it('shows the verified purchase and waits for Continue before opening setup', async () => {
  await render();
  const copy = JSON.stringify(renderer.toJSON());
  expect(copy).toContain('PAYMENT CONFIRMED');
  expect(copy).toContain('Just you');
  expect(copy).toContain('Active');
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => { await continueButton().props.onPress(); });
  expect(navigation.replace).toHaveBeenCalledWith('PaidTransition', { screen: 'PaidWelcome' });
});

it('keeps the celebration visible during a slow status refresh and continues once', async () => {
  let finish!: (value: unknown) => void;
  refreshStatus.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await render();
  expect(JSON.stringify(renderer.toJSON())).toContain('PAYMENT CONFIRMED');
  let proceeding!: Promise<void>;
  await act(async () => {
    proceeding = continueButton().props.onPress();
    await continueButton().props.onPress();
  });
  expect(continueButton().props.loading).toBe(true);
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => { finish({ recommendedNextScreen: 'home' }); await proceeding; });
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(navigation.replace).toHaveBeenCalledWith('Main');
});

it('uses the verified checkout destination if the status refresh fails', async () => {
  refreshStatus.mockRejectedValueOnce(new Error('Offline'));
  await render();
  await act(async () => { await continueButton().props.onPress(); });
  expect(navigation.replace).toHaveBeenCalledWith('PaidTransition', { screen: 'PaidWelcome' });
});

it('celebrates a renewal and returns an existing member to the app', async () => {
  refreshStatus.mockResolvedValueOnce({ recommendedNextScreen: 'home' });
  await render(true);
  expect(JSON.stringify(renderer.toJSON())).toContain('Your membership is renewed');
  expect(continueButton().props.title).toBe('Back to FormBae');
  await act(async () => { await continueButton().props.onPress(); });
  expect(navigation.replace).toHaveBeenCalledWith('Main');
});
