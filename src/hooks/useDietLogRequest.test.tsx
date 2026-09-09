import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';
import { useDietLogRequest } from './useDietLogRequest';

function setupNavigation(initialFocus = true) {
  let focused = initialFocus;
  const listeners = new Map<string, Set<() => void>>();
  return {
    navigation: {
      isFocused: () => focused,
      addListener: (event: string, callback: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(callback);
        return () => listeners.get(event)!.delete(callback);
      },
    } as unknown as BottomTabNavigationProp<MainTabParamList, 'Diet'>,
    emit: (event: string) => {
      if (event === 'focus') focused = true;
      if (event === 'blur') focused = false;
      listeners.get(event)?.forEach(callback => callback());
    },
  };
}

function Request({ navigation, id, open }: {
  navigation: BottomTabNavigationProp<MainTabParamList, 'Diet'>;
  id: number | null;
  open: () => void;
}) {
  useDietLogRequest(navigation, id, open);
  return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('waits for the first tab transition before opening and consuming the log request once', async () => {
  const { navigation, emit } = setupNavigation();
  const open = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => { renderer = ReactTestRenderer.create(<Request navigation={navigation} id={1} open={open} />); });
  await act(() => { emit('transitionStart'); jest.runAllTimers(); });
  expect(open).not.toHaveBeenCalled();
  await act(() => { emit('transitionEnd'); jest.runAllTimers(); });
  expect(open).toHaveBeenCalledTimes(1);
  await act(() => { emit('focus'); emit('transitionEnd'); jest.runAllTimers(); });
  expect(open).toHaveBeenCalledTimes(1);
  await act(() => renderer.unmount());
});

it('opens again for a new shortcut request and supports tabs without animations', async () => {
  const { navigation, emit } = setupNavigation(false);
  const open = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => { renderer = ReactTestRenderer.create(<Request navigation={navigation} id={1} open={open} />); jest.runAllTimers(); });
  expect(open).not.toHaveBeenCalled();
  await act(() => { emit('focus'); jest.runAllTimers(); });
  expect(open).toHaveBeenCalledTimes(1);
  await act(() => renderer.update(<Request navigation={navigation} id={2} open={open} />));
  await act(() => jest.runAllTimers());
  expect(open).toHaveBeenCalledTimes(2);
  await act(() => renderer.unmount());
});

it('keeps an interrupted request pending and cancels presentation on unmount', async () => {
  const { navigation, emit } = setupNavigation();
  const open = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => { renderer = ReactTestRenderer.create(<Request navigation={navigation} id={1} open={open} />); });
  await act(() => { emit('blur'); jest.runAllTimers(); });
  expect(open).not.toHaveBeenCalled();
  await act(() => { emit('focus'); jest.runAllTimers(); });
  expect(open).toHaveBeenCalledTimes(1);
  await act(() => renderer.update(<Request navigation={navigation} id={2} open={open} />));
  await act(() => renderer.unmount());
  await act(() => jest.runAllTimers());
  expect(open).toHaveBeenCalledTimes(1);
});
