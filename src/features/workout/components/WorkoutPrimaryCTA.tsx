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
  large?: boolean;
  style?: ViewStyle;
};

export function WorkoutPrimaryCTA({ title, subtitle, icon = 'arrow-right', trailing, onPress, disabled, large, style }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, large && styles.buttonLarge, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, large && styles.titleLarge]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, large && styles.subtitleLarge]}>{subtitle}</Text> : null}
      </View>
      {trailing || (
        <View style={[styles.icon, large && styles.iconLarge]}>
          <Feather
            name={icon}
            size={large ? 25 : 20}
            color={colors.onPrimary}
            style={icon === 'play' ? styles.playGlyph : undefined}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.card,
  },
  buttonLarge: {
    minHeight: 88,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  copy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { ...typography.button, color: colors.onPrimary, flexShrink: 1 },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  subtitle: { ...typography.caption, color: 'rgba(8,9,12,0.64)', marginTop: 1, flexShrink: 1 },
  subtitleLarge: { fontSize: 15, lineHeight: 21, marginTop: 2 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(8,9,12,0.22)',
    flexShrink: 0,
    alignSelf: 'center',
  },
  iconLarge: {
    width: 56,
    height: 56,
    borderWidth: 1,
    backgroundColor: 'rgba(8,9,12,0.025)',
  },
  playGlyph: { transform: [{ translateX: 1 }] },
  disabled: { opacity: 0.48 },
});
