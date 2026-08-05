import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef } from 'react';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { PaidTransitionNavigator } from './PaidTransitionNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { useAuthStore } from '../store/authStore';
import { trackMobileActivity } from '../services/activityService';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
  const navigationRef = useRef<React.ComponentRef<typeof NavigationContainer<RootStackParamList>>>(null);
  const pageViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedPathRef = useRef('');
  const { ready, token } = useAuthStore();

  const queuePageView = useCallback((path: string) => {
    if (!token || path === lastTrackedPathRef.current) return;
    if (pageViewTimerRef.current) clearTimeout(pageViewTimerRef.current);
    pageViewTimerRef.current = setTimeout(() => {
      lastTrackedPathRef.current = path;
      trackMobileActivity('page_view', path).catch(() => undefined);
    }, 350);
  }, [token]);

  useEffect(() => {
    if (!ready || token) return;
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;

    nav.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    });
  }, [ready, token]);

  useEffect(() => () => {
    if (pageViewTimerRef.current) clearTimeout(pageViewTimerRef.current);
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        <Stack.Screen name="PaidTransition" component={PaidTransitionNavigator} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
