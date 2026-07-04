import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function Card({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenContainer({ children, style }: Props) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function ScreenSubtitle({ children }: { children: string }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.inkMuted,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
});
