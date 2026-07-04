import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'sm';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: string;
  style?: ViewStyle;
};

const heights: Record<Size, number> = { sm: 44, md: 52, lg: 56 };

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'md',
  icon,
  style,
}: Props) {
  const isDisabled = !!loading || !!disabled;
  const fg =
    variant === 'primary' ? colors.white : variant === 'danger' ? colors.error : colors.accentDark;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { minHeight: heights[size] },
        variantStyles[variant],
        variant === 'primary' && shadows.accent,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.errorLight, borderWidth: 1, borderColor: '#f6caca' },
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  text: { ...typography.button },
});
