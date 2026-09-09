import React from 'react';
import { View, StyleSheet } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';

// Exercise the real tab router and scene views with screens that never fetch.
// This isolates a blank tab from data-loading and backend failures.
jest.mock('./WorkoutsNavigator', () => ({ WorkoutsNavigator: () => require('react').createElement(require('react-native').Text, { testID: 'workout-content' }, 'Workouts') }));
jest.mock('../screens/main/DietScreen', () => ({ DietScreen: () => require('react').createElement(require('react-native').Text, { testID: 'diet-content' }, 'Diet') }));
jest.mock('../screens/main/ActionHubScreen', () => ({ ActionHubScreen: () => require('react').createElement(require('react-native').Text, { testID: 'action-content' }, 'Accountability') }));
jest.mock('./ProgressNavigator', () => ({ ProgressNavigator: () => require('react').createElement(require('react-native').Text, { testID: 'progress-content' }, 'Progress') }));
jest.mock('./ProfileNavigator', () => ({ ProfileNavigator: () => require('react').createElement(require('react-native').Text, { testID: 'profile-content' }, 'Profile') }));

it('keeps selected tab content visible through repeated switches without waiting for animations', async () => {
  jest.useFakeTimers();
  const navigation = createNavigationContainerRef<MainTabParamList>();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => {
    renderer = ReactTestRenderer.create(<NavigationContainer ref={navigation}><MainTabNavigator /></NavigationContainer>);
  });
  expect(navigation.getCurrentRoute()?.name).toBe('Action');
  expect(renderer.root.findAllByProps({ testID: 'action-content' }).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({ testID: 'workout-content' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'diet-content' })).toHaveLength(0);
  const routes = [
    ['Action', 'action-content'], ['Diet', 'diet-content'], ['Progress', 'progress-content'],
    ['Profile', 'profile-content'], ['Workouts', 'workout-content'], ['Action', 'action-content'],
    ['Profile', 'profile-content'], ['Diet', 'diet-content'], ['Action', 'action-content'],
  ] as const;
  for (const [route, testID] of routes) {
    await act(() => navigation.navigate(route));
    expect(navigation.getCurrentRoute()?.name).toBe(route);
    let node: ReactTestRenderer.ReactTestInstance | null = renderer.root.findAllByProps({ testID })[0];
    expect(node).toBeDefined();
    // Check the entire scene ancestry, including any animated opacity wrapper.
    while (node) {
      if (node.type === View || node.props.style) {
        const style = StyleSheet.flatten(node.props.style);
        const opacity = style?.opacity;
        expect(typeof opacity === 'object' ? opacity?.__getValue() : opacity).not.toBe(0);
        expect(style?.display).not.toBe('none');
      }
      node = node.parent;
    }
  }
  // Revisited content keeps its mounted instance instead of remounting the tab.
  expect(renderer.root.findAllByProps({ testID: 'workout-content' }).length).toBeGreaterThan(0);
  await act(() => renderer.unmount());
  jest.useRealTimers();
});
