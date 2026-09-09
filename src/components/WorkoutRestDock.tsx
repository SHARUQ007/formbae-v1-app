import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';

type Props = {
  remaining: number;
  nextLabel: string;
  onAddTime: () => void;
  onSkip: () => void;
};

/** Lives in the workout's action area, leaving the scroll view and video interactive. */
export function WorkoutRestDock({ remaining, nextLabel, onAddTime, onSkip }: Props) {
  const seconds = Math.max(0, Math.ceil(remaining));
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <View style={styles.dock} testID="workout-rest-dock">
    <View style={styles.controls}>
      <View style={styles.timer}>
        <Text style={styles.label}>REST</Text>
        <Text style={styles.time} accessibilityLabel={`${seconds} seconds of rest remaining`}>{time}</Text>
      </View>
      <TouchableOpacity onPress={onAddTime} style={styles.addButton}
        accessibilityRole="button" accessibilityLabel="Add fifteen seconds" activeOpacity={0.8}>
        <Text style={styles.addText}>+15 sec</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSkip} style={styles.skipButton}
        accessibilityRole="button" accessibilityLabel="Skip rest" activeOpacity={0.8}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </View>
    <Text style={styles.next} numberOfLines={2}>Up next: {nextLabel}</Text>
  </View>;
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.primaryAction, borderRadius: radius.md, minHeight: 92, paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  timer: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  label: { ...typography.overline, fontSize: 10, color: '#626366' },
  time: { fontSize: 26, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.onPrimary },
  addButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: '#eeeeec', borderWidth: 1, borderColor: '#d3d3d0' },
  addText: { ...typography.label, color: colors.onPrimary, fontWeight: '600' },
  skipButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.onPrimary },
  skipText: { ...typography.label, color: colors.primaryAction, fontWeight: '700' },
  next: { ...typography.caption, color: '#626366' },
});
