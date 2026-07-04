import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export function PrimaryButton({ title, onPress, loading, variant = 'primary', style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, variant === 'secondary' ? styles.secondary : styles.primary, style]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.accent : colors.white} />
      ) : (
        <Text style={[styles.text, variant === 'secondary' ? styles.secondaryText : styles.primaryText]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.border },
  text: { ...typography.button },
  primaryText: { color: colors.white },
  secondaryText: { color: colors.accentDark },
});
