import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ImageBackground,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Logo, LogoMark } from '../../components/Logo';
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
import { waitForMainStartupWindow } from '../../utils/startupGate';
import {
  startupArtworkResizeMode,
  startupProgressMeta,
  startupProgressTarget,
} from '../../utils/startupPresentation';
import {
  resolveOnboardingInitialRoute,
  resolvePaidInitialRoute,
  resolveRootRoute,
} from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const STARTUP_ART = require('../../assets/editorial/startup-people-hero-v2.jpg');

const STARTUP_LINES = [
  'Short sessions still count.',
  'Form first. Reps second.',
  'Rest is part of the work.',
  'Steady work builds strong weeks.',
  'Move well. Then build more.',
] as const;

type MotionPreference = 'unknown' | 'full' | 'reduce';

function progressLabel(
  ready: boolean,
  finishing: boolean,
  snapshot: MainAppPreloadSnapshot,
) {
  if (!ready) return 'Checking your account';
  if (finishing || snapshot.phase === 'ready') return 'Opening FormBae';
  if (snapshot.completed >= 4) return 'Finishing setup';
  if (snapshot.completed >= 2) return 'Loading your progress';
  return 'Loading your plan';
}

export function SplashScreen({ navigation }: Props) {
  const { bootstrap, ready, token, status } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const artworkResizeMode = startupArtworkResizeMode(
    viewportWidth,
    viewportHeight,
  );
  const mountedAt = useRef(Date.now()).current;
  const startupLine = useRef(
    STARTUP_LINES[Math.floor(Date.now() / 86_400_000) % STARTUP_LINES.length],
  ).current;
  const navigated = useRef(false);
  const [snapshot, setSnapshot] = useState(getMainAppPreloadSnapshot);
  const [finishing, setFinishing] = useState(false);
  const [mainPreloadStarted, setMainPreloadStarted] = useState(false);
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>('unknown');
  const bridgeOpacity = useRef(new Animated.Value(1)).current;
  const headerReveal = useRef(new Animated.Value(0)).current;
  const footerReveal = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef(new Animated.Value(0.08)).current;
  const entranceComplete = useRef(false);

  useEffect(() => {
    if (!ready) bootstrap();
  }, [bootstrap, ready]);

  useEffect(() => subscribeToMainAppPreload(setSnapshot), []);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) setMotionPreference(enabled ? 'reduce' : 'full');
      })
      .catch(() => {
        if (active) setMotionPreference('full');
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => {
        setMotionPreference(enabled ? 'reduce' : 'full');
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (motionPreference === 'unknown') return undefined;

    if (motionPreference === 'reduce' || entranceComplete.current) {
      bridgeOpacity.stopAnimation();
      headerReveal.stopAnimation();
      footerReveal.stopAnimation();
      bridgeOpacity.setValue(0);
      headerReveal.setValue(1);
      footerReveal.setValue(1);
      entranceComplete.current = true;
      return undefined;
    }

    const reveal = Animated.parallel([
      Animated.timing(bridgeOpacity, {
        toValue: 0,
        duration: 220,
        delay: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerReveal, {
        toValue: 1,
        duration: 280,
        delay: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(footerReveal, {
        toValue: 1,
        duration: 300,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    reveal.start(({ finished }) => {
      if (finished) entranceComplete.current = true;
    });
    return () => reveal.stop();
  }, [
    bridgeOpacity,
    footerReveal,
    headerReveal,
    motionPreference,
  ]);

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
      navigation.replace('Onboarding', {
        screen: resolveOnboardingInitialRoute(status.recommendedNextScreen),
      });
      return;
    }
    if (root === 'PaidTransition') {
      navigated.current = true;
      navigation.replace('PaidTransition', {
        screen: resolvePaidInitialRoute(status.recommendedNextScreen),
      });
      return;
    }
    if (root !== 'Main') {
      navigated.current = true;
      navigation.replace(root);
      return;
    }

    let active = true;
    const criticalReady = preloadMainAppCriticalData();
    setSnapshot(getMainAppPreloadSnapshot());
    setMainPreloadStarted(true);
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

  const preloadReady = ready && mainPreloadStarted;
  const visibleSnapshot: MainAppPreloadSnapshot = mainPreloadStarted
    ? snapshot
    : {
        phase: 'idle',
        completed: 0,
        total: snapshot.total,
        lastCompletedLabel: '',
      };
  const progress = startupProgressTarget(
    preloadReady,
    visibleSnapshot,
    finishing,
  );
  const stage = progressLabel(ready, finishing, visibleSnapshot);
  const progressMeta = startupProgressMeta(
    preloadReady,
    finishing,
    visibleSnapshot,
  );
  const progressDescription =
    visibleSnapshot.phase === 'idle'
      ? 'Preparing setup'
      : `${visibleSnapshot.completed} of ${visibleSnapshot.total} setup tasks complete`;

  useEffect(() => {
    progressAnimation.stopAnimation();
    if (motionPreference !== 'full') {
      progressAnimation.setValue(progress);
      return undefined;
    }
    const animation = Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [motionPreference, progress, progressAnimation]);

  return (
    <ImageBackground
      source={STARTUP_ART}
      defaultSource={STARTUP_ART}
      style={styles.screen}
      imageStyle={styles.artwork}
      resizeMode={artworkResizeMode}
      accessible={false}
    >
      <LinearGradient
        colors={[
          'rgba(5, 6, 9, 0.76)',
          'rgba(5, 6, 9, 0.04)',
          'rgba(5, 6, 9, 0.16)',
          'rgba(5, 6, 9, 0.95)',
        ]}
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
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerReveal,
              transform: [
                {
                  translateY: headerReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Logo height={38} showTagline={false} />
        </Animated.View>

        <Animated.View
          style={[
            styles.footer,
            {
              opacity: footerReveal,
              transform: [
                {
                  translateY: footerReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.quoteRail} />
          <Text
            style={styles.artworkQuote}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {startupLine}
          </Text>

          <View style={styles.statusSection}>
            <View style={styles.stageRow}>
              <View style={styles.stageLabel}>
                <View style={styles.statusDot} />
                <Text
                  style={styles.stageText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  accessibilityLiveRegion="polite"
                >
                  {stage}
                </Text>
              </View>
              <Text style={styles.progressMeta}>{progressMeta}</Text>
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel="App setup progress"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progress * 100),
                text: progressDescription,
              }}
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={[styles.launchBridge, { opacity: bridgeOpacity }]}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.launchBrand}>
          <LogoMark size={72} />
          <Text style={styles.launchWordmark}>FormBae</Text>
        </View>
        <Text
          style={[
            styles.launchTagline,
            { bottom: Math.max(insets.bottom + 20, 20) },
          ]}
        >
          Train better form
        </Text>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  artwork: {
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
  quoteRail: {
    width: 30,
    height: 3,
    marginBottom: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  statusSection: {
    width: '100%',
    marginTop: spacing.xl,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stageLabel: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  stageText: {
    ...typography.label,
    color: colors.ink,
  },
  progressMeta: {
    ...typography.caption,
    fontWeight: '600',
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
  launchBridge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    backgroundColor: colors.bg,
  },
  launchBrand: {
    position: 'absolute',
    top: '23%',
    right: 0,
    left: 0,
    alignItems: 'center',
  },
  launchWordmark: {
    marginTop: 12,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.ink,
  },
  launchTagline: {
    position: 'absolute',
    right: spacing.lg,
    left: spacing.lg,
    textAlign: 'center',
    ...typography.label,
    color: colors.goldMuted,
  },
});
