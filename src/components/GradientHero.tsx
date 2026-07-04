import { Text, View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

export function GradientHero({
  eyebrow,
  title,
  subtitle,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.hero, style]}>
      <View style={styles.blob} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.accent,
  },
  blob: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.gradientStart,
    opacity: 0.55,
  },
  eyebrow: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase', marginBottom: 8 },
  title: { ...typography.hero, color: colors.white },
  subtitle: { ...typography.body, color: colors.onAccentMuted, marginTop: 8 },
});
