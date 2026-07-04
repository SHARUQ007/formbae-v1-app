import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

export function ListRow({
  icon,
  label,
  value,
  tone = 'default',
  onPress,
  showChevron = true,
}: {
  icon?: string;
  label: string;
  value?: string;
  tone?: 'default' | 'danger';
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const danger = tone === 'danger';
  const fg = danger ? colors.error : colors.ink;
  const iconBg = danger ? colors.errorLight : colors.accentLight;
  const iconFg = danger ? colors.error : colors.accent;

  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Feather name={icon} size={18} color={iconFg} />
        </View>
      ) : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && showChevron ? <Feather name="chevron-right" size={20} color={colors.inkSubtle} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  iconWrap: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.bodyBold, flex: 1 },
  value: { ...typography.body, color: colors.inkMuted },
});
