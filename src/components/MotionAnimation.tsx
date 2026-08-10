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
const EMPTY_MS = 1800;
const SUCCESS_MS = 520;

export function MotionAnimation({ kind, size = 96, style }: MotionAnimationProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    spin.stopAnimation();
    reveal.stopAnimation();
    spin.setValue(0);
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
      spinLoop.start();
      return () => spinLoop.stop();
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
  }, [kind, reveal, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const revealScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const revealOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] });

  if (kind === 'loading') {
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]}>
        <View style={styles.loadingTrack} />
        <Animated.View style={[styles.loadingArc, { transform: [{ rotate }] }]} />
        <View style={styles.loadingCore}><Feather name="activity" size={Math.round(size * 0.21)} color={colors.inkStrong} /></View>
      </View>
    );
  }

  if (kind === 'empty') {
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]}>
        <Animated.View style={[styles.emptyShell, { opacity: revealOpacity, transform: [{ scale: revealScale }] }]}>
          <Feather name="inbox" size={Math.round(size * 0.34)} color={colors.accent} />
        </Animated.View>
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
  loadingTrack: {
    position: 'absolute',
    width: '76%',
    height: '76%',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingArc: {
    position: 'absolute',
    width: '76%',
    height: '76%',
    borderRadius: radius.pill,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: colors.goldMuted,
    borderRightColor: colors.goldMuted,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  loadingCore: {
    width: '44%',
    height: '44%',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  emptyShell: {
    width: '78%',
    height: '78%',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
