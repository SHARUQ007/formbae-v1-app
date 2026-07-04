import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const { bootstrap, ready, token, status } = useAuthStore();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (!token || !status) {
        navigation.replace('Auth');
        return;
      }
      const root = resolveRootRoute(status.recommendedNextScreen);
      if (root === 'Onboarding') {
        navigation.replace('Onboarding', { screen: resolveOnboardingInitialRoute(status.recommendedNextScreen) });
        return;
      }
      if (root === 'PaidTransition') {
        navigation.replace('PaidTransition', { screen: resolvePaidInitialRoute(status.recommendedNextScreen) });
        return;
      }
      navigation.replace(root);
    }, 1400);
    return () => clearTimeout(timer);
  }, [ready, token, status, navigation]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 120, height: 120 },
});
