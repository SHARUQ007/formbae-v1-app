import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <PrimaryButton title="Try again" variant="secondary" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} style={styles.retry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.inkMuted, fontSize: 15, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  errorTitle: { color: colors.error, fontSize: 17, fontWeight: '700' },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  retry: { marginTop: spacing.md, alignSelf: 'stretch' },
});
