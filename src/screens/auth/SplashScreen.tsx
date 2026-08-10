import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LogoMark } from '../../components/Logo';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { getContextualAdvice, wellnessAdvice } from '../../utils/wellnessAdvice';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const { bootstrap, ready, token, status } = useAuthStore();
  const insets = useSafeAreaInsets();
  const initialAdvice = useMemo(() => getContextualAdvice(), []);
  const initialIndex = useMemo(() => Math.max(0, wellnessAdvice.findIndex((item) => item.title === initialAdvice.title)), [initialAdvice.title]);
  const [adviceIndex, setAdviceIndex] = useState(initialIndex);
  const advice = wellnessAdvice[adviceIndex] || initialAdvice;

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAdviceIndex((index) => (index + 1) % wellnessAdvice.length);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <LogoMark size={58} />
        <View>
          <Text style={styles.word}>
            Form<Text style={styles.wordAccent}>Bae</Text>
          </Text>
          <Text style={styles.tagline}>Setting up your plan</Text>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.center}>
          <View style={styles.adviceIcon}>
            <Feather name={advice.icon} size={34} color={colors.accent} />
          </View>
          <Text style={styles.adviceLabel}>While we load</Text>
          <Text style={styles.adviceTitle}>{advice.title}</Text>
          <Text style={styles.adviceBody}>{advice.body}</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Your workouts, diet diary, and trainer updates are being prepared.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  main: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  center: {
    minHeight: '72%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.lg,
  },
  word: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  wordAccent: { color: colors.accent },
  tagline: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  adviceIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceLabel: { ...typography.overline, color: colors.accent, marginTop: spacing.sm, textTransform: 'uppercase' },
  adviceTitle: { ...typography.hero, color: colors.ink, textAlign: 'center' },
  adviceBody: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  progressTrack: { width: '100%', height: 8, borderRadius: radius.pill, backgroundColor: colors.panelMuted, overflow: 'hidden', marginTop: spacing.md },
  progressFill: { width: '64%', height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  footer: { paddingBottom: spacing.xl },
  footerText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
});
