import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import { OtpCodeInput } from '../../components/OtpCodeInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ApiError } from '../../services/apiClient';
import { confirmCode, endVerification, getSession, resendCode } from '../../services/otpService';

const mockLogin = jest.fn();

// The Firebase SDK is confined to otpService, so this screen never has to mock it.
jest.mock('../../services/otpService', () => ({
  OTP_CODE_LENGTH: 6,
  confirmCode: jest.fn(),
  endVerification: jest.fn(() => Promise.resolve()),
  getSession: jest.fn(),
  resendCode: jest.fn(),
}));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ login: mockLogin }) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

let renderer: ReactTestRenderer;
const mockReplace = jest.fn();
const navigation = {
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  getParent: jest.fn(() => ({ replace: mockReplace })),
};

const session = { sessionId: 'otp-1', phone: '+919876543210', sentAt: Date.now(), resendAvailableAt: Date.now() + 30_000, resendsLeft: 3 };

async function render(params: Record<string, unknown> = {}) {
  await act(async () => {
    renderer = create(
      <VerifyOtpScreen
        navigation={navigation as never}
        route={{ key: 'v', name: 'VerifyOtp', params: { mobile: '9876543210', sessionId: 'otp-1', mode: 'login', reduceMotion: true, ...params } } as never}
      />,
    );
  });
}

const codeInput = () => renderer.root.findByType(OtpCodeInput);
const button = (title: string) => renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === title)!;
const text = () => renderer.root.findAll(node => typeof node.type === 'string')
  .map(node => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
  .flat().filter(child => typeof child === 'string').join(' ');

beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockReset();
  (getSession as jest.Mock).mockReturnValue(session);
  (confirmCode as jest.Mock).mockResolvedValue('firebase-id-token');
  mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'home' } });
});
afterEach(() => act(() => renderer.unmount()));

it('submits on the sixth digit without waiting for the button', async () => {
  await render();
  await act(async () => { await codeInput().props.onComplete('123456'); });
  expect(confirmCode).toHaveBeenCalledWith('otp-1', '123456');
  expect(mockLogin).toHaveBeenCalledWith('9876543210', undefined, false, 'firebase-id-token');
  // Returning trainees go through the startup warm-up, as they did before OTP.
  expect(mockReplace).toHaveBeenCalledWith('Splash');
});

it('routes a part-way trainee to the step they left off at', async () => {
  mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'questionnaire' } });
  await render();
  await act(async () => { await codeInput().props.onComplete('123456'); });
  expect(mockReplace).toHaveBeenCalledWith('Onboarding', { screen: 'SetupWelcome' });
});

it('a wrong code clears the boxes and keeps them here', async () => {
  (confirmCode as jest.Mock).mockRejectedValue(Object.assign(new Error('That code isn’t right.'), { code: 'INVALID_CODE' }));
  await render();
  await act(async () => { await codeInput().props.onComplete('123456'); });
  expect(text()).toContain('That code isn’t right.');
  expect(codeInput().props.value).toBe('');
  expect(mockReplace).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it('a number with no account asks for a name and reuses the same verification', async () => {
  // The second attempt must not cost another SMS, which is the whole point of holding
  // the token: confirmCode runs once, sign-in runs twice.
  mockLogin
    .mockRejectedValueOnce(new ApiError('Create an account', 404, { code: 'ACCOUNT_NOT_FOUND' }))
    .mockResolvedValueOnce({ status: { recommendedNextScreen: 'questionnaire' } });
  await render();
  await act(async () => { codeInput().props.onChangeText('123456'); });
  await act(async () => { await codeInput().props.onComplete('123456'); });
  expect(text()).toContain('No FormBae account on this number yet.');

  await act(async () => { await button('Create my account').props.onPress(); });
  expect(confirmCode).toHaveBeenCalledTimes(1);
  expect(mockLogin).toHaveBeenCalledTimes(2);
  expect(mockLogin).toHaveBeenLastCalledWith('9876543210', undefined, true, 'firebase-id-token');
});

it('a verification the backend rejects starts the whole thing over', async () => {
  mockLogin.mockRejectedValue(new ApiError('Session expired. Please log in again.', 401, { detail: { code: 'OTP_PHONE_MISMATCH' } }));
  await render();
  await act(async () => { await codeInput().props.onComplete('123456'); });
  expect(navigation.replace).toHaveBeenCalledWith('Login', { mode: 'login', mobile: '9876543210', reduceMotion: true });
  expect(endVerification).toHaveBeenCalled();
});

it('another code cannot be asked for until the wait is over', async () => {
  await render();
  expect(text()).toContain('Resend code in');
  expect(resendCode).not.toHaveBeenCalled();
});

it('once the wait is over a new code can be sent', async () => {
  (getSession as jest.Mock).mockReturnValue({ ...session, resendAvailableAt: Date.now() - 1 });
  (resendCode as jest.Mock).mockResolvedValue({ ...session, sentAt: Date.now(), resendsLeft: 2 });
  await render();
  const resend = renderer.root.find(node => node.props.accessibilityLabel === 'Resend code');
  await act(async () => { await resend.props.onPress(); });
  expect(resendCode).toHaveBeenCalledWith('otp-1');
  expect(codeInput().props.value).toBe('');
});

it('changing the number ends the verification rather than leaving it live', async () => {
  // A live Firebase session keeps minting tokens, so it has to go with the screen. It is
  // replaced rather than popped, so the forward gesture cannot return to a screen whose
  // verification has just been ended.
  await render();
  const back = renderer.root.find(node => node.props.accessibilityLabel === 'Change number');
  await act(async () => { back.props.onPress(); });
  expect(endVerification).toHaveBeenCalled();
  expect(navigation.replace).toHaveBeenCalledWith('Login', { mode: 'login', mobile: '9876543210', reduceMotion: true });
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('a verification lost to a restart says so instead of taking a code that cannot work', async () => {
  (getSession as jest.Mock).mockReturnValue(null);
  await render();
  expect(text()).toContain('That verification has expired.');
  expect(codeInput().props.editable).toBe(false);
});
