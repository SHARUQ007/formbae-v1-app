import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { PaidTransitionNavigator } from './PaidTransitionNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const navigationRef = useRef<React.ComponentRef<typeof NavigationContainer<RootStackParamList>>>(null);
  const { ready, token } = useAuthStore();

  useEffect(() => {
    if (!ready || token) return;
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;

    nav.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    });
  }, [ready, token]);

  return (
    <NavigationContainer ref={navigationRef}>
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
