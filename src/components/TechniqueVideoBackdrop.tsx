import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

/** A restrained animated preview surface used by the technique-video action. */
export function TechniqueVideoBackdrop({ resolving, imageSource }: { resolving?: boolean; imageSource?: ImageSourcePropType }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.52] });
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <View style={styles.root} pointerEvents="none">
      {imageSource ? (
        <Image source={imageSource} style={styles.fill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#1b1c21', '#111217', '#08090d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      )}
      <Svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={styles.fill}>
        <Defs>
          <RadialGradient id="spotlight" cx="68%" cy="18%" r="70%">
            <Stop offset="0" stopColor="#f0ce78" stopOpacity={imageSource ? 0.14 : 0.2} />
            <Stop offset="0.55" stopColor="#bda45f" stopOpacity={0.05} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="vignette" cx="50%" cy="52%" r="78%">
            <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.66} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="60" fill="url(#spotlight)" />
        <Rect x="0" y="0" width="100" height="60" fill="url(#vignette)" />
      </Svg>

      <View style={styles.center}>
        <Animated.View style={[styles.softGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        {resolving ? (
          <View style={styles.playCore}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : (
          <Animated.View style={[styles.playCore, { transform: [{ scale: coreScale }] }]}>
            <Feather name="play" size={22} color={colors.gold} style={styles.playIcon} />
          </Animated.View>
        )}
      </View>
      <View style={styles.detailRail} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  softGlow: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(240,206,120,0.10)',
  },
  playCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(17,18,23,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(240,206,120,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRail: {
    position: 'absolute',
    left: 18,
    bottom: 10,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(240,206,120,0.72)',
  },
  playIcon: { marginLeft: 2 },
});
