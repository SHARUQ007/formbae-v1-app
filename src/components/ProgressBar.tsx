import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';

export function ProgressBar({
  value,
  height = 8,
  trackColor = colors.borderStrong,
  fillColor = colors.accent,
}: {
  value: number; // 0..1
  height?: number;
  trackColor?: string;
  fillColor?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: radius.pill }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor, borderRadius: radius.pill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
