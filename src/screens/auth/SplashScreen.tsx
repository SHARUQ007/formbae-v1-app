import { useEffect, useRef, useState } from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo } from '../../components/Logo';
import {
  getMainAppPreloadSnapshot,
  preloadMainAppCriticalData,
  subscribeToMainAppPreload,
  type MainAppPreloadSnapshot,
} from '../../services/preloadService';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { waitForMainStartupWindow, MAIN_STARTUP_MAX_MS } from '../../utils/startupGate';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const STARTUP_ART = require('../../assets/editorial/startup-people-hero.jpg');

const STARTUP_TIPS = [
  'Short sessions still count.',
  'Form first. Reps second.',
  'Rest is part of the work.',
  'Small steps build strong weeks.',
  'Move well. Then add more.',
] as const;

function progressLabel(ready: boolean, finishing: boolean, snapshot: MainAppPreloadSnapshot) {
  if (!ready) return 'Checking your account';
  if (finishing || snapshot.phase === 'ready') return 'Opening FormBae';
  if (snapshot.completed >= 4) return 'Finishing setup';
  if (snapshot.completed >= 2) return 'Loading your progress';
  return 'Loading your plan';
}

export function SplashScreen({ navigation }: Props) {
  const { bootstrap, ready, token, status } = useAuthStore();
  const insets = useSafeAreaInsets();
  const mountedAt = useRef(Date.now()).current;
  const startupTip = useRef(STARTUP_TIPS[Math.floor(Date.now() / 1000) % STARTUP_TIPS.length]).current;
  const navigated = useRef(false);
  const [snapshot, setSnapshot] = useState(getMainAppPreloadSnapshot);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!ready) bootstrap();
  }, [bootstrap, ready]);

  useEffect(() => subscribeToMainAppPreload(setSnapshot), []);

  useEffect(() => {
    // Four updates per second keeps the label feeling live without repeatedly
    // rendering the full-screen artwork at animation-frame frequency.
    const timer = setInterval(() => setElapsedMs(Date.now() - mountedAt), 250);
    return () => clearInterval(timer);
  }, [mountedAt]);

  useEffect(() => {
    if (!ready || navigated.current) return;
    if (!token || !status) {
      navigated.current = true;
      navigation.replace('Auth');
      return;
    }

    const root = resolveRootRoute(status.recommendedNextScreen);
    if (root === 'Onboarding') {
      navigated.current = true;
      navigation.replace('Onboarding', { screen: resolveOnboardingInitialRoute(status.recommendedNextScreen) });
      return;
    }
    if (root === 'PaidTransition') {
      navigated.current = true;
      navigation.replace('PaidTransition', { screen: resolvePaidInitialRoute(status.recommendedNextScreen) });
      return;
    }

    let active = true;
    const criticalReady = preloadMainAppCriticalData();
    waitForMainStartupWindow(mountedAt, criticalReady).then(() => {
      if (!active || navigated.current) return;
      setFinishing(true);
      navigated.current = true;
      navigation.replace(root);
    });
    return () => {
      active = false;
    };
  }, [mountedAt, navigation, ready, status, token]);

  const taskProgress = snapshot.total > 0 ? snapshot.completed / snapshot.total : 0;
  const timeProgress = Math.min(0.82, (elapsedMs / MAIN_STARTUP_MAX_MS) * 0.82);
  const progress = finishing ? 1 : Math.min(0.98, Math.max(0.06, taskProgress, timeProgress));
  const stage = progressLabel(ready, finishing, snapshot);
  const progressDescription = snapshot.phase === 'idle'
    ? 'Preparing setup'
    : `${snapshot.completed} of ${snapshot.total} setup tasks complete`;

  return (
    <View style={styles.screen}>
      <Image source={STARTUP_ART} style={styles.artwork} resizeMode="cover" accessible={false} fadeDuration={0} />
      <LinearGradient
        colors={['rgba(5, 6, 9, 0.72)', 'rgba(5, 6, 9, 0.06)', 'rgba(5, 6, 9, 0.18)', 'rgba(5, 6, 9, 0.94)']}
        locations={[0, 0.24, 0.58, 1]}
        style={styles.artworkShade}
        pointerEvents="none"
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg),
          },
        ]}
      >
        <View style={styles.header}>
          <Logo height={38} showTagline={false} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.artworkQuote} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>{startupTip}</Text>

          <View style={styles.statusSection}>
            <View style={styles.stageRow}>
              <Text style={styles.stageText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{stage}</Text>
              <Text style={styles.progressValue}>{Math.round(progress * 100)}%</Text>
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel="App setup progress"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: progressDescription }}
            >
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  artwork: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  artworkShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    marginTop: 'auto',
  },
  artworkQuote: {
    maxWidth: 370,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.45,
    color: colors.inkStrong,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  statusSection: {
    width: '100%',
    marginTop: spacing.lg,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stageText: {
    ...typography.label,
    flex: 1,
    color: colors.ink,
  },
  progressValue: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
});
