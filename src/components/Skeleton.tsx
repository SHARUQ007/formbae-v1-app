import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

function usePulse() {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 720, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = usePulse();
  return <Animated.View style={[styles.block, { opacity }, style]} />;
}

export function ScreenSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.wrap}>
      <SkeletonBlock style={styles.title} />
      <SkeletonBlock style={styles.subtitle} />
      <View style={styles.card}>
        <View style={styles.row}>
          <SkeletonBlock style={styles.icon} />
          <View style={styles.flex}>
            <SkeletonBlock style={styles.lineWide} />
            <SkeletonBlock style={styles.line} />
          </View>
        </View>
      </View>
      {!compact ? (
        <>
          <View style={styles.card}>
            <SkeletonBlock style={styles.lineWide} />
            <SkeletonBlock style={styles.line} />
            <SkeletonBlock style={styles.button} />
          </View>
          <View style={styles.grid}>
            <SkeletonBlock style={styles.tile} />
            <SkeletonBlock style={styles.tile} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingTop: spacing.sm },
  block: { backgroundColor: colors.border, borderRadius: radius.md },
  title: { width: '64%', height: 28 },
  subtitle: { width: '86%', height: 16, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1, gap: spacing.sm },
  icon: { width: 44, height: 44, borderRadius: radius.md },
  lineWide: { width: '78%', height: 16 },
  line: { width: '52%', height: 14 },
  button: { width: '100%', height: 46, borderRadius: radius.lg, marginTop: spacing.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, height: 78, borderRadius: radius.lg },
});
