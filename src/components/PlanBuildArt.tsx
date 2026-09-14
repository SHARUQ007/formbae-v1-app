import { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

/** A plan being written: a week of sessions filling in, with a pulse running through it. */
export function PlanBuildArt({ ready = false, reduceMotion = false }: { ready?: boolean; reduceMotion?: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ready || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, reduceMotion, sweep]);

  // A sweep across the card, as if the week were being written in.
  const drift = sweep.interpolate({ inputRange: [0, 1], outputRange: [26, 104] });
  const fade = sweep.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={styles.wrap} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 132 132" preserveAspectRatio="xMidYMid meet">
        <Circle cx="66" cy="66" r="60" fill={colors.accentLight} />
        <Circle cx="66" cy="66" r="60" fill="none" stroke={ready ? colors.success : colors.goldMuted} strokeWidth="1.5" />

        {/* The week taking shape */}
        <Rect x="30" y="34" width="72" height="64" rx="12" fill={colors.panel} stroke={colors.border} strokeWidth="1.5" />
        <Path d="M30 50h72" stroke={colors.border} strokeWidth="1.5" />
        <Circle cx="46" cy="42" r="2.4" fill={colors.goldMuted} />
        <Circle cx="66" cy="42" r="2.4" fill={colors.goldMuted} />
        <Circle cx="86" cy="42" r="2.4" fill={colors.goldMuted} />

        {/* Sessions, the later ones still faint while they are written */}
        <Rect x="40" y="60" width="30" height="7" rx="3.5" fill={colors.gold} />
        <Rect x="76" y="60" width="16" height="7" rx="3.5" fill={colors.goldMuted} opacity={ready ? 1 : 0.55} />
        <Rect x="40" y="74" width="20" height="7" rx="3.5" fill={colors.goldMuted} opacity={ready ? 1 : 0.45} />
        <Rect x="66" y="74" width="26" height="7" rx="3.5" fill={colors.goldMuted} opacity={ready ? 1 : 0.3} />

        {ready ? (
          <G>
            <Circle cx="99" cy="99" r="17" fill={colors.bg} />
            <Circle cx="99" cy="99" r="15" fill="rgba(131,214,164,0.14)" stroke={colors.success} strokeWidth="2" />
            <Path d="M92 99.5l4.6 4.6L107 94" fill="none" stroke={colors.success} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ) : null}

        {/* The pulse that runs under everything on this screen */}
        <Path
          d="M34 112h14l5-9 7 17 6-11h32"
          fill="none"
          stroke={ready ? colors.success : colors.gold}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M108 26l1.7 3.8 3.8 1.7-3.8 1.7-1.7 3.8-1.7-3.8-3.8-1.7 3.8-1.7L108 26z" fill={colors.gold} />
        <Circle cx="24" cy="40" r="2" fill={colors.goldMuted} />
      </Svg>
      {ready || reduceMotion ? null : (
        <Animated.View
          pointerEvents="none"
          style={[styles.sweep, { opacity: fade, transform: [{ translateX: drift }] }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignSelf: 'stretch', minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  sweep: { position: 'absolute', width: 2, height: '34%', backgroundColor: colors.gold, borderRadius: 1, opacity: 0.8 },
});
