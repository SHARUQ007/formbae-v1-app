import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { LoginScreen, normalizeIndianMobile } from './LoginScreen';
import { ApiError } from '../../services/apiClient';

const mockStartPhoneVerification = jest.fn();
const mockLogin = jest.fn();
const mockReplace = jest.fn();

// Signing in happens on the verify screen whenever verification is required; this one
// only sends the code. With it switched off it signs in here directly.
jest.mock('../../services/otpService', () => ({
  startPhoneVerification: (...args: unknown[]) => mockStartPhoneVerification(...args),
}));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ login: mockLogin }) }));

jest.mock('../../services/activityService', () => ({
  trackMobileInteraction: jest.fn(),
}));

type LoginMode = 'login' | 'signup';

function createNavigation(canGoBack = true) {
  return {
    canGoBack: jest.fn(() => canGoBack),
    goBack: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    getParent: jest.fn(() => ({ replace: mockReplace })),
  };
}

function renderLogin(mode: LoginMode, canGoBack = true, mobile?: string) {
  const navigation = createNavigation(canGoBack);
  let renderer: ReactTestRenderer;

  act(() => {
    renderer = create(
      <LoginScreen
        navigation={navigation as never}
        route={{
          key: `Login-${mode}`,
          name: 'Login',
          params: { mode, reduceMotion: true, mobile },
        }}
      />,
    );
  });

  return { navigation, renderer: renderer! };
}

function renderedText(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => flattenText(node.props.children))
    .join(' ');
}

function flattenText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join('');
  return '';
}

describe('LoginScreen', () => {
  const renderers: ReactTestRenderer[] = [];

  beforeEach(() => {
    mockStartPhoneVerification.mockReset();
    mockStartPhoneVerification.mockResolvedValue({ sessionId: 'otp-1' });
    mockLogin.mockReset();
    mockLogin.mockRejectedValue(new ApiError('Verify your mobile number to continue.', 401, { code: 'OTP_REQUIRED' }));
    mockReplace.mockReset();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    renderers.splice(0).forEach(renderer => {
      act(() => renderer.unmount());
    });
    jest.restoreAllMocks();
  });

  it('presents returning users with focused sign-in copy', () => {
    const { renderer } = renderLogin('login');
    renderers.push(renderer);

    const copy = renderedText(renderer);
    expect(copy).toContain('Welcome back');
    expect(copy).toContain('Enter the mobile number linked to your FormBae profile.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Send code' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'First name' })).toHaveLength(0);
  });

  it('presents new users with analysis copy and the optional name field', () => {
    const { renderer } = renderLogin('signup');
    renderers.push(renderer);

    const copy = renderedText(renderer);
    expect(copy).toContain('Start your analysis');
    expect(copy).toContain('Enter your details to create your FormBae profile.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Send my code' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'First name' })).toBeTruthy();
  });

  it.each(['login', 'signup'] as const)('does not mention payment or the web in %s mode', mode => {
    const { renderer } = renderLogin(mode);
    renderers.push(renderer);

    expect(renderedText(renderer)).not.toMatch(/\b(?:paid|payment|web|website)\b/i);
  });

  it('returns to the welcome screen from the sign-in flow', () => {
    const { navigation, renderer } = renderLogin('login');
    renderers.push(renderer);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress();
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('restores the welcome screen when login has no back-stack entry', () => {
    const { navigation, renderer } = renderLogin('login', false);
    renderers.push(renderer);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress();
    });

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Welcome');
  });

  it('normalizes only supported Indian mobile formats', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('5876543210')).toBe('');
    expect(normalizeIndianMobile('199876543210')).toBe('');
    expect(normalizeIndianMobile('98765')).toBe('');
  });

  it('shows inline validation and does not submit an invalid number', async () => {
    const { renderer } = renderLogin('login');
    renderers.push(renderer);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('12345');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockStartPhoneVerification).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter a valid 10-digit Indian mobile number.');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Enter a valid 10-digit Indian mobile number.',
    );
  });

  it('normalizes the input, sends a code, and hands off to verification', async () => {
    const { navigation, renderer } = renderLogin('login');
    renderers.push(renderer);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Mobile number' })
        .props.onChangeText('+91 98765 43210');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockStartPhoneVerification).toHaveBeenCalledTimes(1);
    expect(mockStartPhoneVerification).toHaveBeenCalledWith('+919876543210');
    const params = navigation.navigate.mock.calls[0][1];
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyOtp', expect.objectContaining({
      mobile: '9876543210', sessionId: 'otp-1', mode: 'login',
    }));
    // The Firebase confirmation must never be smuggled into route params: they have to
    // survive serialization, and it cannot.
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('prefills signup and lets the user edit the phone before submitting', async () => {
    const { renderer } = renderLogin('signup', true, '9876543210');
    renderers.push(renderer);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.value).toBe('9876543210');
    expect(mockStartPhoneVerification).not.toHaveBeenCalled();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543211'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Send my code' }).props.onPress());
    expect(mockStartPhoneVerification).toHaveBeenCalledWith('+919876543211');
  });

  it.each([
    new ApiError('Network unavailable', 0, undefined, true),
    new ApiError('Service unavailable', 503),
    new ApiError('Route not found', 404),
    new ApiError('Account disabled', 403),
  ])('keeps a code that could not be sent on this page: %s', async error => {
    // Verification is on, so the send is what fails here.
    mockLogin.mockRejectedValue(new ApiError('Verify your mobile number to continue.', 401, { code: 'OTP_REQUIRED' }));
    mockStartPhoneVerification.mockRejectedValue(error);
    const { navigation, renderer } = renderLogin('login');
    renderers.push(renderer);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543210'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress());
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain(error.message);
  });

  it('carries a trimmed optional name through to verification', async () => {
    const { navigation, renderer } = renderLogin('signup');
    renderers.push(renderer);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'First name' })
        .props.onChangeText('  Maya  ');
      renderer.root
        .findByProps({ accessibilityLabel: 'Mobile number' })
        .props.onChangeText('9876543210');
    });
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Send my code' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(mockStartPhoneVerification).toHaveBeenCalledWith('+919876543210');
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyOtp', expect.objectContaining({
      mobile: '9876543210', name: 'Maya', mode: 'signup',
    }));
  });

  describe('when verification is switched off', () => {
    beforeEach(() => {
      mockLogin.mockReset();
      mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'home' } });
    });

    it('signs in here instead of sending a code', async () => {
      const { renderer } = renderLogin('login');
      renderers.push(renderer);
      act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543210'));
      await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress());

      expect(mockStartPhoneVerification).not.toHaveBeenCalled();
      expect(mockLogin).toHaveBeenCalledWith('9876543210', undefined, false);
      expect(mockReplace).toHaveBeenCalledWith('Splash');
    });

    it('still sends an unknown number to signup rather than an error', async () => {
      mockLogin.mockRejectedValue(new ApiError('Create an account', 404, { code: 'ACCOUNT_NOT_FOUND' }));
      const { navigation, renderer } = renderLogin('login');
      renderers.push(renderer);
      act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543210'));
      await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress());

      expect(navigation.replace).toHaveBeenCalledWith('Login', { mode: 'signup', mobile: '9876543210', reduceMotion: true });
    });

    it('does not send a code when the backend did not ask for one', async () => {
      const { renderer } = renderLogin('login');
      renderers.push(renderer);
      act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543210'));
      await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Send code' }).props.onPress());

      expect(mockStartPhoneVerification).not.toHaveBeenCalled();
    });
  });
});
