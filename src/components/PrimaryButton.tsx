import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { trackMobileInteraction } from '../services/activityService';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverted' | 'heroSecondary';
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

const heights: Record<Size, number> = { sm: 42, md: 52, lg: 58 };

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
    variant === 'primary' || variant === 'heroSecondary'
      ? colors.white
      : variant === 'danger'
        ? colors.error
        : colors.accentDark;

  const handlePress = () => {
    trackMobileInteraction(`/button/${title}`);
    onPress();
  };

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
      onPress={handlePress}
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
  secondary: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.accent },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.errorLight, borderWidth: 1, borderColor: '#f6caca' },
  inverted: { backgroundColor: colors.white },
  heroSecondary: { backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.5 },
  text: { ...typography.button, textAlign: 'center' },
});
