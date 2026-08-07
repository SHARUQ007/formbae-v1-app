import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

/**
 * Cinematic "dark gym" backdrop for the technique-video card. Renders a moody
 * gradient (or a supplied photo), a warm SVG spotlight + vignette, and a
 * softly pulsing play button. Absolutely fills its parent; never intercepts
 * touches (the parent card handles the press).
 *
 * Pass `imageSource={require('../assets/gym-bg.jpg')}` once a real photo is
 * added to swap the gradient for the image.
 */
export function TechniqueVideoBackdrop({ resolving, imageSource }: { resolving?: boolean; imageSource?: ImageSourcePropType }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringAScale = pulse.interpolate({ inputRange: [0, 0.6], outputRange: [1, 2], extrapolate: 'clamp' });
  const ringAOpacity = pulse.interpolate({ inputRange: [0, 0.08, 0.6], outputRange: [0, 0.45, 0], extrapolate: 'clamp' });
  const ringBScale = pulse.interpolate({ inputRange: [0.42, 1], outputRange: [1, 2], extrapolate: 'clamp' });
  const ringBOpacity = pulse.interpolate({ inputRange: [0.42, 0.5, 1], outputRange: [0, 0.45, 0], extrapolate: 'clamp' });
  const coreScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] });

  return (
    <View style={styles.root} pointerEvents="none">
      {imageSource ? (
        <Image source={imageSource} style={styles.fill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#16161a', '#1e1a14', '#0a0a0c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      )}
      <Svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={styles.fill}>
        <Defs>
          <RadialGradient id="spotlight" cx="58%" cy="12%" r="62%">
            <Stop offset="0" stopColor="#d59a58" stopOpacity={imageSource ? 0.2 : 0.42} />
            <Stop offset="0.55" stopColor="#7a5733" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="vignette" cx="50%" cy="52%" r="78%">
            <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="60" fill="url(#spotlight)" />
        <Rect x="0" y="0" width="100" height="60" fill="url(#vignette)" />
      </Svg>

      <View style={styles.center}>
        {resolving ? (
          <View style={styles.playCore}>
            <ActivityIndicator color={colors.white} />
          </View>
        ) : (
          <>
            <Animated.View style={[styles.ring, { opacity: ringAOpacity, transform: [{ scale: ringAScale }] }]} />
            <Animated.View style={[styles.ring, { opacity: ringBOpacity, transform: [{ scale: ringBScale }] }]} />
            <Animated.View style={[styles.playCore, { transform: [{ scale: coreScale }] }]}>
              <Feather name="play" size={26} color={colors.white} style={styles.playIcon} />
            </Animated.View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  playCore: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { marginLeft: 3 },
});
