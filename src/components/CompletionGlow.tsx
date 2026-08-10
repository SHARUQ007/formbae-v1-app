import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const WASH = ['rgba(240,206,120,0.08)', 'rgba(240,206,120,0.025)', 'rgba(240,206,120,0)'];
const BAND = ['rgba(255,236,179,0)', 'rgba(255,236,179,0.28)', 'rgba(255,236,179,0)'];
const SPARKLE_COLOR = '#ffe08a';

// Glints framing the completion check on the left of the card. They stay
// clear of the title and the "Done" badge so nothing crowds the text. Each
// twinkles on its own staggered cadence rather than one synchronized pulse.
const SPARKLES = [
  { top: 5, left: 50, size: 12, delay: 0, gap: 1700 },
  { top: 45, left: 11, size: 8, delay: 850, gap: 2100 },
  { top: 29, left: 3, size: 6, delay: 1500, gap: 1900 },
];

function Sparkle({ top, left, size, delay, gap }: { top: number; left: number; size: number; delay: number; gap: number }) {
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
    <Animated.View style={[styles.sparkle, { top, left, opacity, transform: [{ scale }, { rotate }] }]}>
      <MaterialCommunityIcon name="star-four-points" size={size} color={SPARKLE_COLOR} />
    </Animated.View>
  );
}

/**
 * Decorative golden "reward" overlay for a completed workout card. Render it
 * as the first child of the card so it sits behind the content; it never
 * intercepts touches.
 *
 * A restrained wash appears only for the workout that was just completed.
 * Previously completed days stay neutral and use their status badge as the
 * sole completion cue, keeping a long plan from becoming visually noisy.
 */
export function CompletionGlow({ radius = 22, animated = true }: { radius?: number; animated?: boolean }) {
  const shine = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!animated) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(2800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shine, animated]);

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
      {animated ? <LinearGradient colors={WASH} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {animated && size.width > 0 ? (
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
          <LinearGradient colors={BAND} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      {animated ? SPARKLES.map((s, i) => <Sparkle key={i} {...s} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0 },
  sparkle: { position: 'absolute' },
});
