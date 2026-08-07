import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const GOLD_LIGHT = '#ffe08a';

// A few gold glints near the top-right corner. Each twinkles gently on its
// own cadence (staggered), so the effect reads as a soft sparkle rather than
// one synchronized pulse.
const SPARKLES = [
  { top: 7, right: 16, size: 13, delay: 0, gap: 1700 },
  { top: 24, right: 42, size: 8, delay: 850, gap: 2100 },
  { top: 33, right: 9, size: 7, delay: 1500, gap: 1900 },
];

function Sparkle({ top, right, size, delay, gap }: { top: number; right: number; size: number; delay: number; gap: number }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 640, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 760, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(gap),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay, gap]);

  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '80deg'] });

  return (
    <Animated.View style={[styles.sparkle, { top, right, opacity, transform: [{ scale }, { rotate }] }]}>
      <MaterialCommunityIcon name="star-four-points" size={size} color={GOLD_LIGHT} />
    </Animated.View>
  );
}

/**
 * Decorative "reward" overlay for a completed workout card. Render it as the
 * first child of the card so it sits behind the content; it never intercepts
 * touches. A static gilded wash warms the card, a single highlight sweeps
 * across on a calm loop, and a few glints twinkle near the corner.
 */
export function GoldenCompletionGlow({ radius = 22 }: { radius?: number }) {
  const shine = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(2800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shine]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const bandWidth = 62;
  const translateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, (size.width || 320) + bandWidth],
  });
  const shineOpacity = shine.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={[styles.root, { borderRadius: radius }]} pointerEvents="none" onLayout={onLayout}>
      <LinearGradient
        colors={['rgba(245,179,1,0.2)', 'rgba(245,179,1,0.06)', 'rgba(245,179,1,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {size.width > 0 ? (
        <Animated.View
          style={[
            styles.band,
            {
              width: bandWidth,
              height: size.height * 2.4,
              opacity: shineOpacity,
              transform: [{ translateX }, { translateY: -size.height * 0.7 }, { rotate: '18deg' }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,236,179,0)', 'rgba(255,236,179,0.55)', 'rgba(255,236,179,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0 },
  sparkle: { position: 'absolute' },
});
