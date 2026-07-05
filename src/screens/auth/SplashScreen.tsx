import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LogoMark } from '../../components/Logo';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const { bootstrap, ready, token, status } = useAuthStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!ready) return;
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
  }, [ready, token, status, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.blob} />
      <View style={styles.center}>
        <LogoMark size={96} />
        <Text style={styles.word}>
          Form<Text style={styles.wordAccent}>Bae</Text>
        </Text>
        <Text style={styles.tagline}>Trainer-backed fitness</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDark, overflow: 'hidden' },
  blob: { position: 'absolute', top: -100, right: -80, width: 320, height: 320, borderRadius: 160, backgroundColor: colors.accent, opacity: 0.6 },
  center: { alignItems: 'center', gap: spacing.md },
  word: { fontSize: 32, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginTop: spacing.sm },
  wordAccent: { color: colors.accentLight },
  tagline: { ...typography.body, color: colors.onAccentMuted },
});
