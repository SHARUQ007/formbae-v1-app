import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';

type MotionKind = 'loading' | 'empty' | 'success';

type MotionAnimationProps = {
  kind: MotionKind;
  size?: number;
  style?: ViewStyle;
};

const LOOP_MS = 1400;
const PULSE_MS = 1100;
const EMPTY_MS = 1800;
const SUCCESS_MS = 520;

export function MotionAnimation({ kind, size = 96, style }: MotionAnimationProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    spin.stopAnimation();
    pulse.stopAnimation();
    reveal.stopAnimation();
    spin.setValue(0);
    pulse.setValue(0);
    reveal.setValue(0);

    if (kind === 'loading') {
      const spinLoop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: LOOP_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
      spinLoop.start();
      pulseLoop.start();
      return () => {
        spinLoop.stop();
        pulseLoop.stop();
      };
    }

    if (kind === 'empty') {
      const emptyLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(reveal, {
            toValue: 1,
            duration: EMPTY_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(reveal, {
            toValue: 0,
            duration: EMPTY_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
      emptyLoop.start();
      return () => emptyLoop.stop();
    }

    Animated.timing(reveal, {
      toValue: 1,
      duration: SUCCESS_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [kind, pulse, reveal, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });
  const revealScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const revealOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] });

  if (kind === 'loading') {
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]}>
        <Animated.View style={[styles.loadingHalo, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
        <Animated.View style={[styles.loadingArc, { transform: [{ rotate }] }]} />
        <View style={styles.loadingDot} />
      </View>
    );
  }

  if (kind === 'empty') {
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]}>
        <Animated.View style={[styles.emptyShell, { opacity: revealOpacity, transform: [{ scale: revealScale }] }]}>
          <Feather name="inbox" size={Math.round(size * 0.34)} color={colors.accent} />
        </Animated.View>
        <Animated.View style={[styles.spark, styles.sparkTop, { opacity: revealOpacity }]} />
        <Animated.View style={[styles.spark, styles.sparkBottom, { opacity: revealOpacity }]} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Animated.View style={[styles.successShell, { opacity: revealOpacity, transform: [{ scale: revealScale }] }]}>
        <Feather name="check" size={Math.round(size * 0.42)} color={colors.white} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingHalo: {
    position: 'absolute',
    width: '78%',
    height: '78%',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelMuted,
  },
  loadingArc: {
    position: 'absolute',
    width: '78%',
    height: '78%',
    borderRadius: radius.pill,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderTopColor: colors.black,
    borderRightColor: colors.black,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  loadingDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.black,
  },
  emptyShell: {
    width: '78%',
    height: '78%',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  spark: {
    position: 'absolute',
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.black,
  },
  sparkTop: {
    top: '16%',
    right: '14%',
    transform: [{ rotate: '-24deg' }],
  },
  sparkBottom: {
    bottom: '18%',
    left: '14%',
    transform: [{ rotate: '-24deg' }],
  },
  successShell: {
    width: '78%',
    height: '78%',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
});
