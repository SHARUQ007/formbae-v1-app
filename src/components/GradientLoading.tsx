import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark } from './Logo';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function GradientLoading({
  title,
  subtitle,
  showSpinner = true,
  showBrand = true,
}: {
  title: string;
  subtitle?: string;
  showSpinner?: boolean;
  showBrand?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.blob} />
      {showBrand ? <LogoMark size={84} /> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {showSpinner ? <ActivityIndicator color={colors.white} style={styles.spinner} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.accentDark, overflow: 'hidden' },
  blob: { position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: colors.accent, opacity: 0.6 },
  title: { ...typography.title, color: colors.white, textAlign: 'center', marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.onAccentMuted, textAlign: 'center', marginTop: spacing.sm },
  spinner: { marginTop: spacing.lg },
});
