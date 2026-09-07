import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import NativeLinearGradient from 'react-native-linear-gradient';
import { Logo } from '../../components/Logo';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const welcomeArtwork = require('../../assets/editorial/welcome-hero-v3.jpg');

type LoginMode = 'login' | 'signup';
type MotionPreference = 'unknown' | 'full' | 'reduce';

export function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 720 || fontScale > 1.15;
  const contentBottomInset = compact
    ? 28
    : Math.min(76, Math.max(52, Math.round(height * 0.07)));
  const transition = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const primaryPress = useRef(new Animated.Value(1)).current;
  const secondaryPress = useRef(new Animated.Value(1)).current;
  const primaryArrow = useRef(new Animated.Value(0)).current;
  const secondaryArrow = useRef(new Animated.Value(0)).current;
  const entranceComplete = useRef(false);
  const transitioningRef = useRef(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [motionPreference, setMotionPreference] =
    useState<MotionPreference>('unknown');
  const [transitioningTo, setTransitioningTo] = useState<LoginMode | null>(null);
  const transitioning = transitioningTo !== null;

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
      enabled => setMotionPreference(enabled ? 'reduce' : 'full'),
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (motionPreference === 'unknown') return undefined;

    reveal.stopAnimation();
    if (motionPreference === 'reduce' || entranceComplete.current) {
      reveal.setValue(1);
      entranceComplete.current = true;
      return undefined;
    }

    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) entranceComplete.current = true;
    });
    return () => animation.stop();
  }, [motionPreference, reveal]);

  useEffect(
    () =>
      navigation.addListener('focus', () => {
        transition.stopAnimation();
        transition.setValue(0);
        primaryPress.stopAnimation();
        secondaryPress.stopAnimation();
        primaryArrow.stopAnimation();
        secondaryArrow.stopAnimation();
        primaryPress.setValue(1);
        secondaryPress.setValue(1);
        primaryArrow.setValue(0);
        secondaryArrow.setValue(0);
        if (navigationTimer.current) {
          clearTimeout(navigationTimer.current);
          navigationTimer.current = null;
        }
        transitioningRef.current = false;
        setTransitioningTo(null);
      }),
    [
      navigation,
      primaryArrow,
      primaryPress,
      secondaryArrow,
      secondaryPress,
      transition,
    ],
  );

  useEffect(
    () => () => {
      reveal.stopAnimation();
      transition.stopAnimation();
      primaryPress.stopAnimation();
      secondaryPress.stopAnimation();
      primaryArrow.stopAnimation();
      secondaryArrow.stopAnimation();
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [
      primaryArrow,
      primaryPress,
      reveal,
      secondaryArrow,
      secondaryPress,
      transition,
    ],
  );

  const continueToLogin = (mode: LoginMode) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    setTransitioningTo(mode);

    const navigate = () =>
      navigation.navigate('Login', {
        mode,
        reduceMotion: motionPreference !== 'full',
      });
    if (motionPreference !== 'full') {
      navigate();
      return;
    }

    Animated.timing(transition, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    navigationTimer.current = setTimeout(navigate, 110);
  };

  const animatePress = (
    scale: Animated.Value,
    arrow: Animated.Value,
    pressed: boolean,
  ) => {
    if (motionPreference !== 'full') return;
    scale.stopAnimation();
    arrow.stopAnimation();
    Animated.parallel([
      Animated.spring(scale, {
        toValue: pressed ? 0.98 : 1,
        speed: 32,
        bounciness: pressed ? 0 : 3,
        useNativeDriver: true,
      }),
      Animated.timing(arrow, {
        toValue: pressed ? 5 : 0,
        duration: pressed ? 110 : 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const artworkMotion = {
    opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
  };
  const brandMotion = {
    opacity: reveal.interpolate({
      inputRange: [0, 0.28],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0, 0.28],
          outputRange: [10, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  const panelRevealOpacity = reveal.interpolate({
    inputRange: [0.14, 0.72],
    outputRange: [0, 1],
    extrapolate: 'clamp' as const,
  });
  const panelExitOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });
  const panelMotion = {
    opacity: Animated.multiply(panelRevealOpacity, panelExitOpacity),
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0.14, 0.72],
          outputRange: [20, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: transition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -14],
        }),
      },
    ],
  };
  const actionsMotion = {
    opacity: reveal.interpolate({
      inputRange: [0.38, 0.94],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0.38, 0.94],
          outputRange: [22, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  const primarySelectionOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, transitioningTo === 'signup' ? 0.55 : 1],
  });
  const secondarySelectionOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, transitioningTo === 'login' ? 0.55 : 1],
  });
  const primarySelectionLift = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, transitioningTo === 'login' ? -4 : 0],
  });
  const secondarySelectionLift = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, transitioningTo === 'signup' ? -4 : 0],
  });

  return (
    <View style={styles.screen}>
      <Animated.Image source={welcomeArtwork} style={[styles.artwork, artworkMotion]} resizeMode="cover" accessible={false} fadeDuration={0} testID="welcome-hero-artwork" />
      <NativeLinearGradient
        colors={[
          'rgba(5,6,10,0.05)',
          'rgba(5,6,10,0.12)',
          'rgba(5,6,10,0.60)',
          'rgba(5,6,10,0.90)',
          '#05060a',
        ]}
        locations={[0, 0.36, 0.57, 0.8, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <NativeLinearGradient
        colors={['rgba(5,6,10,0.76)', 'rgba(5,6,10,0.18)', 'rgba(5,6,10,0.02)']}
        locations={[0, 0.62, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            minHeight: height,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + contentBottomInset,
          },
        ]}
      >
        <Animated.View style={[styles.brandRow, brandMotion]}>
          <NativeLinearGradient
            colors={['rgba(5,6,10,0.74)', 'rgba(5,6,10,0.30)', 'rgba(5,6,10,0)']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.brandBlend}
            pointerEvents="none"
          />
          <Logo height={compact ? 31 : 35} showTagline={false} />
        </Animated.View>

        <Animated.View style={[styles.welcomeContent, panelMotion]}>
          <View style={styles.message}>
            <Text style={[styles.title, compact && styles.titleCompact]} accessibilityRole="header">Your Personal Trainer. Anytime, Anywhere.</Text>
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
              Affordable Training, Nutrition and Progress shaped around your goals and routine
            </Text>
          </View>

          <Animated.View style={[styles.actions, actionsMotion]}>
            <Animated.View
              style={{
                opacity: primarySelectionOpacity,
                transform: [
                  { scale: primaryPress },
                  { translateY: primarySelectionLift },
                ],
              }}
            >
              <TouchableOpacity
                style={styles.primaryCta}
                onPress={() => continueToLogin('login')}
                onPressIn={() => animatePress(primaryPress, primaryArrow, true)}
                onPressOut={() => animatePress(primaryPress, primaryArrow, false)}
                activeOpacity={0.96}
                disabled={transitioning}
                accessibilityRole="button"
                accessibilityLabel="Sign in to FormBae"
                accessibilityHint="Opens sign in"
                accessibilityState={{ disabled: transitioning, busy: transitioningTo === 'login' }}
              >
                <View style={styles.ctaCopy}>
                  <Text style={styles.primaryCtaLabel}>CONTINUE YOUR PLAN</Text>
                  <Text style={styles.ctaTitle}>Sign in</Text>
                </View>
                <View style={styles.ctaArrowArea}>
                  <View style={[styles.ctaArrowDivider, styles.primaryArrowDivider]} />
                  <Animated.View style={{ transform: [{ translateX: primaryArrow }] }}>
                    <Feather name="arrow-right" size={24} color={colors.onPrimary} />
                  </Animated.View>
                </View>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View
              style={{
                opacity: secondarySelectionOpacity,
                transform: [
                  { scale: secondaryPress },
                  { translateY: secondarySelectionLift },
                ],
              }}
            >
              <TouchableOpacity
                style={styles.secondaryCta}
                onPress={() => continueToLogin('signup')}
                onPressIn={() => animatePress(secondaryPress, secondaryArrow, true)}
                onPressOut={() => animatePress(secondaryPress, secondaryArrow, false)}
                activeOpacity={0.9}
                disabled={transitioning}
                accessibilityRole="button"
                accessibilityLabel="Start my free analysis"
                accessibilityHint="Opens the free analysis"
                accessibilityState={{ disabled: transitioning, busy: transitioningTo === 'signup' }}
              >
                <View style={styles.ctaCopy}>
                  <Text style={styles.secondaryCtaLabel}>NEW TO FORMBAE?</Text>
                  <Text style={styles.secondaryCtaText}>Start free analysis</Text>
                </View>
                <View style={styles.ctaArrowArea}>
                  <View style={[styles.ctaArrowDivider, styles.secondaryArrowDivider]} />
                  <Animated.View style={{ transform: [{ translateX: secondaryArrow }] }}>
                    <Feather name="arrow-right" size={24} color={colors.ink} />
                  </Animated.View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  artwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: spacing.md },
  brandRow: {
    minHeight: 54,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  },
  brandBlend: {
    position: 'absolute',
    left: -spacing.md,
    top: -spacing.sm,
    width: 270,
    height: 72,
  },
  welcomeContent: {
    width: '100%',
    maxWidth: 520,
    marginTop: spacing.xxl,
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
  },
  message: { maxWidth: 430 },
  title: { fontSize: 33, lineHeight: 38, letterSpacing: -0.9, fontWeight: '800', color: colors.inkStrong, maxWidth: 380 },
  titleCompact: { fontSize: 30, lineHeight: 35 },
  subtitle: { ...typography.body, fontSize: 15, lineHeight: 22, color: 'rgba(247,247,248,0.70)', maxWidth: 410, marginTop: 10 },
  subtitleCompact: { fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  actions: { width: '100%', gap: 12, marginTop: spacing.lg },
  primaryCta: {
    minHeight: 78,
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryAction,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    elevation: 8,
  },
  ctaCopy: { flex: 1, gap: 3 },
  primaryCtaLabel: { ...typography.overline, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, color: 'rgba(8,9,12,0.60)' },
  ctaTitle: { ...typography.button, fontSize: 18, lineHeight: 22, color: colors.onPrimary },
  secondaryCta: {
    minHeight: 74,
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 18,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(5,6,10,0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  secondaryCtaLabel: { ...typography.overline, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, color: colors.inkMuted },
  secondaryCtaText: { ...typography.button, fontSize: 18, lineHeight: 22, color: colors.ink },
  ctaArrowArea: { minWidth: 48, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  ctaArrowDivider: { width: 1, height: 30 },
  primaryArrowDivider: { backgroundColor: 'rgba(8,9,12,0.14)' },
  secondaryArrowDivider: { backgroundColor: 'rgba(255,255,255,0.15)' },
});
