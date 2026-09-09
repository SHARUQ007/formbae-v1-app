import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { useAuthStore } from '../store/authStore';
import { trackMobileActivity } from '../services/activityService';
import {
  resolveOnboardingInitialRoute,
  resolvePaidInitialRoute,
  resolveRootRoute,
  shouldReconcileRootRoute,
} from '../utils/routing';
import type { RootStackParamList } from './types';
import { colors } from '../theme/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Splash is the only route required for the first frame. Resolve every other
// flow on demand so onboarding, payment, and the main tabs do not execute
// during cold start.
const getAuthNavigator = () => require('./AuthNavigator').AuthNavigator;
const getOnboardingNavigator = () => require('./OnboardingNavigator').OnboardingNavigator;
const getPaidTransitionNavigator = () => require('./PaidTransitionNavigator').PaidTransitionNavigator;
const getMainSubscriptionScreen = () => require('./MainSubscriptionScreen').MainSubscriptionScreen;
const getSubscriptionRenewalScreen = () => require('../screens/paid/SubscriptionRenewalScreen').SubscriptionRenewalScreen;

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.gold,
    background: colors.bg,
    card: colors.panel,
    text: colors.ink,
    border: colors.border,
    notification: colors.gold,
  },
};

function getActiveRoutePath(state: ReturnType<NonNullable<React.ComponentRef<typeof NavigationContainer>['getRootState']>> | undefined): string {
  if (!state?.routes?.length) return '/mobile/unknown';
  const names: string[] = [];
  let current: typeof state | undefined = state;
  while (current?.routes?.length) {
    const route = current.routes[current.index ?? 0];
    if (!route) break;
    names.push(route.name);
    current = route.state as typeof state | undefined;
  }
  return `/mobile/${names.join('/') || 'unknown'}`;
}

export function RootNavigator() {
  const reduceMotion = useReducedMotion();
  const navigationRef = useRef<React.ComponentRef<typeof NavigationContainer<RootStackParamList>>>(null);
  const pageViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedPathRef = useRef('');
  const [navigationReady, setNavigationReady] = useState(false);
  const { ready, token, status } = useAuthStore();

  const queuePageView = useCallback((path: string) => {
    if (!token || path === lastTrackedPathRef.current) return;
    if (pageViewTimerRef.current) clearTimeout(pageViewTimerRef.current);
    pageViewTimerRef.current = setTimeout(() => {
      lastTrackedPathRef.current = path;
      trackMobileActivity('page_view', path).catch(() => undefined);
    }, 350);
  }, [token]);

  useEffect(() => {
    if (!ready || !navigationReady) return;
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;
    const rootState = nav.getRootState();
    const currentRoot = rootState.routes[rootState.index ?? 0]?.name as keyof RootStackParamList | undefined;
    if (!token) {
      // Splash owns the cold-start handoff so the first transition is timed
      // consistently instead of being skipped on faster devices.
      if (currentRoot === 'Splash' || currentRoot === 'Auth') return;
      nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
      return;
    }
    if (!status || currentRoot === 'Splash' || currentRoot === 'Auth') return;

    const expectedRoot = resolveRootRoute(status.recommendedNextScreen);
    if (!shouldReconcileRootRoute(currentRoot, expectedRoot)) return;

    if (expectedRoot === 'Onboarding') {
      nav.reset({
        index: 0,
        routes: [{ name: 'Onboarding', params: { screen: resolveOnboardingInitialRoute(status.recommendedNextScreen) } }],
      });
      return;
    }
    if (expectedRoot === 'PaidTransition') {
      nav.reset({
        index: 0,
        routes: [{ name: 'PaidTransition', params: { screen: resolvePaidInitialRoute(status.recommendedNextScreen) } }],
      });
      return;
    }
    nav.reset({ index: 0, routes: [{ name: expectedRoot }] });
  }, [navigationReady, ready, status, token]);

  useEffect(() => () => {
    if (pageViewTimerRef.current) clearTimeout(pageViewTimerRef.current);
  }, []);

  return (
    <NavigationContainer
      theme={navigationTheme}
      ref={navigationRef}
      onReady={() => {
        setNavigationReady(true);
        if (token) {
          queuePageView(getActiveRoutePath(navigationRef.current?.getRootState()));
        }
      }}
      onStateChange={(state) => {
        if (token) {
          queuePageView(getActiveRoutePath(state));
        }
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? 'none' : 'fade',
          animationDuration: 260,
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" getComponent={getAuthNavigator} />
        <Stack.Screen name="Onboarding" getComponent={getOnboardingNavigator} />
        <Stack.Screen name="PaidTransition" getComponent={getPaidTransitionNavigator} />
        <Stack.Screen name="Main" getComponent={getMainSubscriptionScreen} />
        <Stack.Screen name="Renewal" getComponent={getSubscriptionRenewalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
