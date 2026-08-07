import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { shadows } from '../../../theme/shadows';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

type Props = {
  title: string;
  subtitle?: string;
  icon?: string;
  trailing?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function WorkoutPrimaryCTA({ title, subtitle, icon = 'arrow-right', trailing, onPress, disabled, style }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing || (
        <View style={styles.icon}>
          <Feather name={icon} size={20} color={colors.white} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.accent,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { ...typography.button, color: colors.white },
  subtitle: { ...typography.caption, color: colors.onAccentMuted, marginTop: 1 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  disabled: { opacity: 0.48 },
});
