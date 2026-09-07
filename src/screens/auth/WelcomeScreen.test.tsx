import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { WelcomeScreen } from './WelcomeScreen';

function createNavigation() {
  return {
    navigate: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
}

async function renderWelcome(reduceMotion: boolean) {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(reduceMotion);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);

  const navigation = createNavigation();
  let renderer: ReactTestRenderer;

  await act(async () => {
    renderer = create(
      <WelcomeScreen
        navigation={navigation as never}
        route={{ key: 'Welcome', name: 'Welcome' }}
      />,
    );
    await Promise.resolve();
  });

  return { navigation, renderer: renderer! };
}

describe('WelcomeScreen navigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens signup after the full-motion exit and guards synchronous double taps', async () => {
    const { navigation, renderer } = await renderWelcome(false);
    const signup = renderer.root.findByProps({
      accessibilityLabel: 'Start my free analysis',
    });

    act(() => {
      signup.props.onPress();
      signup.props.onPress();
    });

    expect(navigation.navigate).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(110);
    });

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Login', {
      mode: 'signup',
      reduceMotion: false,
    });

    act(() => renderer.unmount());
  });

  it('opens the login route with sign-in mode', async () => {
    const { navigation, renderer } = await renderWelcome(false);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Sign in to FormBae' })
        .props.onPress();
      jest.advanceTimersByTime(110);
    });

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Login', {
      mode: 'login',
      reduceMotion: false,
    });

    act(() => renderer.unmount());
  });

  it('bypasses the exit delay and forwards the reduced-motion preference', async () => {
    const { navigation, renderer } = await renderWelcome(true);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Start my free analysis' })
        .props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Login', {
      mode: 'signup',
      reduceMotion: true,
    });

    act(() => renderer.unmount());
  });
});
