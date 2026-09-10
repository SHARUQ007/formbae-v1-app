import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { LoginScreen, normalizeIndianMobile } from './LoginScreen';
import { ApiError } from '../../services/apiClient';

const mockLogin = jest.fn();
const mockReplace = jest.fn();

jest.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    loading: false,
  }),
}));

jest.mock('../../services/activityService', () => ({
  trackMobileInteraction: jest.fn(),
}));

type LoginMode = 'login' | 'signup';

function createNavigation(canGoBack = true) {
  return {
    canGoBack: jest.fn(() => canGoBack),
    goBack: jest.fn(),
    replace: jest.fn(),
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
    mockLogin.mockReset();
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
    expect(renderer.root.findByProps({ accessibilityLabel: 'Sign in' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'First name' })).toHaveLength(0);
  });

  it('presents new users with analysis copy and the optional name field', () => {
    const { renderer } = renderLogin('signup');
    renderers.push(renderer);

    const copy = renderedText(renderer);
    expect(copy).toContain('Start your analysis');
    expect(copy).toContain('Enter your details to create your FormBae profile.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Continue to analysis' })).toBeTruthy();
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
      renderer.root.findByProps({ accessibilityLabel: 'Sign in' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Enter a valid 10-digit Indian mobile number.');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Enter a valid 10-digit Indian mobile number.',
    );
  });

  it('normalizes the input, signs in, and opens the hydrated app path', async () => {
    mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'home' } });
    const { renderer } = renderLogin('login');
    renderers.push(renderer);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Mobile number' })
        .props.onChangeText('+91 98765 43210');
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Sign in' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('9876543210', undefined, false);
    expect(mockReplace).toHaveBeenCalledWith('Splash');
  });

  it('redirects an unknown number to signup without creating an account', async () => {
    mockLogin.mockRejectedValue(new ApiError('Create an account', 404, { code: 'ACCOUNT_NOT_FOUND' }));
    const { navigation, renderer } = renderLogin('login');
    renderers.push(renderer);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('+91 98765 43210'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Sign in' }).props.onPress());
    expect(mockLogin).toHaveBeenCalledWith('9876543210', undefined, false);
    expect(navigation.replace).toHaveBeenCalledWith('Login', { mode: 'signup', mobile: '9876543210', reduceMotion: true });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('prefills signup and lets the user edit the phone before submitting', async () => {
    mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'questionnaire' } });
    const { renderer } = renderLogin('signup', true, '9876543210');
    renderers.push(renderer);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.value).toBe('9876543210');
    expect(mockLogin).not.toHaveBeenCalled();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543211'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Continue to analysis' }).props.onPress());
    expect(mockLogin).toHaveBeenCalledWith('9876543211', undefined, true);
  });

  it.each([
    new ApiError('Network unavailable', 0, undefined, true),
    new ApiError('Service unavailable', 503),
    new ApiError('Route not found', 404),
    new ApiError('Account disabled', 403),
  ])('keeps ordinary sign-in failures on the sign-in page: %s', async error => {
    mockLogin.mockRejectedValue(error);
    const { navigation, renderer } = renderLogin('login');
    renderers.push(renderer);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Mobile number' }).props.onChangeText('9876543210'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Sign in' }).props.onPress());
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain(error.message);
  });

  it('submits a trimmed optional name from the analysis path', async () => {
    mockLogin.mockResolvedValue({ status: { recommendedNextScreen: 'questionnaire' } });
    const { renderer } = renderLogin('signup');
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
        .findByProps({ accessibilityLabel: 'Continue to analysis' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(mockLogin).toHaveBeenCalledWith('9876543210', 'Maya', true);
    expect(mockReplace).toHaveBeenCalledWith('Onboarding', { screen: 'SetupWelcome' });
  });
});
