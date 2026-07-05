import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { PrimaryButton } from './PrimaryButton';
import { ScreenSkeleton } from './Skeleton';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.loadingWrap} accessibilityLabel={message} accessibilityLiveRegion="polite">
      <ScreenSkeleton />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
        <Feather name="alert-triangle" size={26} color={colors.error} />
      </View>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <PrimaryButton title="Try again" icon="refresh-cw" variant="secondary" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: colors.accentLight }]}>
        <Feather name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} style={styles.retry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.sm },
  loadingText: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.md },
  wrap: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 60, height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  text: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xs },
  errorTitle: { ...typography.subtitle, color: colors.ink },
  emptyTitle: { ...typography.subtitle, color: colors.ink },
  retry: { marginTop: spacing.md, alignSelf: 'stretch' },
});
