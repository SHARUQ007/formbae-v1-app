import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';

type Variant = 'gold' | 'green';

// Colour sets per variant. Gold marks banked completions from earlier days;
// light green marks today's fresh win.
const PALETTES: Record<Variant, { wash: string[]; band: string[]; sparkle: string }> = {
  gold: {
    wash: ['rgba(245,179,1,0.22)', 'rgba(245,179,1,0.06)', 'rgba(245,179,1,0)'],
    band: ['rgba(255,236,179,0)', 'rgba(255,236,179,0.55)', 'rgba(255,236,179,0)'],
    sparkle: '#ffe08a',
  },
  green: {
    wash: ['rgba(52,199,89,0.2)', 'rgba(52,199,89,0.05)', 'rgba(52,199,89,0)'],
    band: ['rgba(187,247,208,0)', 'rgba(187,247,208,0.6)', 'rgba(187,247,208,0)'],
    sparkle: '#bbf7d0',
  },
};

// Glints framing the completion check on the left of the card. They stay
// clear of the title and the "Done" badge so nothing crowds the text. Each
// twinkles on its own staggered cadence rather than one synchronized pulse.
const SPARKLES = [
  { top: 5, left: 50, size: 12, delay: 0, gap: 1700 },
  { top: 45, left: 11, size: 8, delay: 850, gap: 2100 },
  { top: 29, left: 3, size: 6, delay: 1500, gap: 1900 },
];

function Sparkle({ top, left, size, delay, gap, color }: { top: number; left: number; size: number; delay: number; gap: number; color: string }) {
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
      <MaterialCommunityIcon name="star-four-points" size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Decorative "reward" overlay for a completed workout card. Render it as the
 * first child of the card so it sits behind the content; it never intercepts
 * touches.
 *
 * A gilded wash always warms the card (the static look). When `animated` is
 * true — reserved for today's freshly completed workout — a highlight sweeps
 * across on a calm loop and a few glints twinkle by the check. Previously
 * completed days keep the coloured look without any motion.
 */
export function CompletionGlow({ radius = 22, variant = 'gold', animated = true }: { radius?: number; variant?: Variant; animated?: boolean }) {
  const shine = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const palette = PALETTES[variant];

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
      <LinearGradient colors={palette.wash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
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
          <LinearGradient colors={palette.band} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      {animated ? SPARKLES.map((s, i) => <Sparkle key={i} {...s} color={palette.sparkle} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0 },
  sparkle: { position: 'absolute' },
});
