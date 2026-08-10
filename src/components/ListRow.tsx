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
  const iconBg = danger ? colors.errorLight : 'transparent';
  const iconFg = danger ? colors.error : colors.inkMuted;

  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Feather name={icon} size={18} color={iconFg} />
        </View>
      ) : null}
      <Text style={[styles.label, { color: fg }]}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value}>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, minHeight: 58, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconWrap: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.bodyBold, flex: 1, minWidth: 0 },
  value: { ...typography.body, color: colors.inkMuted, flexShrink: 1, maxWidth: '46%', textAlign: 'right' },
});
