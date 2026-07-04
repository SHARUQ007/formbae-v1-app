import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

export function StatTile({
  icon,
  value,
  label,
  tone = 'accent',
}: {
  icon?: string;
  value: string;
  label: string;
  tone?: 'accent' | 'neutral';
}) {
  const iconFg = tone === 'accent' ? colors.accent : colors.inkMuted;
  return (
    <View style={styles.tile}>
      {icon ? <Feather name={icon} size={18} color={iconFg} style={styles.icon} /> : null}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  icon: { marginBottom: 6 },
  value: { ...typography.title, color: colors.ink },
  label: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
