import { StyleSheet, Text, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

export function WorkoutMetricChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.root}>
      <Feather name={icon} size={16} color="#9a5b00" />
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 5,
  },
  copy: { gap: 1 },
  label: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase' },
  value: { ...typography.subtitle, color: colors.ink },
});
