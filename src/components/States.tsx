import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { PrimaryButton } from './PrimaryButton';
import { MotionAnimation } from './MotionAnimation';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadows } from '../theme/shadows';

type LoadingStateProps = {
  message?: string;
  eyebrow?: string;
  hint?: string;
  card?: boolean;
};

export function LoadingState({ message = 'Loading…', eyebrow, hint, card = false }: LoadingStateProps) {
  return (
    <View
      style={[styles.loadingWrap, card && styles.loadingCard]}
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
    >
      {eyebrow ? <Text style={styles.loadingEyebrow}>{eyebrow}</Text> : null}
      <MotionAnimation kind="loading" size={card ? 84 : 76} />
      <Text style={[styles.loadingText, card && styles.loadingTitle]}>{message}</Text>
      {hint ? <Text style={styles.loadingHint}>{hint}</Text> : null}
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
      {icon === 'inbox' ? (
        <MotionAnimation kind="empty" size={92} />
      ) : (
        <View style={[styles.iconCircle, { backgroundColor: colors.accentLight }]}>
          <Feather name={icon} size={26} color={colors.accent} />
        </View>
      )}
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.text}>{message}</Text> : null}
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} style={styles.retry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  loadingCard: {
    width: '100%',
    maxWidth: 330,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  loadingEyebrow: {
    ...typography.overline,
    color: colors.inkSubtle,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  loadingText: { ...typography.bodyBold, color: colors.ink, textAlign: 'center', marginTop: spacing.md },
  loadingTitle: { ...typography.subtitle, color: colors.inkStrong, marginTop: spacing.lg },
  loadingHint: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 250,
  },
  wrap: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  text: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xs },
  errorTitle: { ...typography.subtitle, color: colors.ink },
  emptyTitle: { ...typography.subtitle, color: colors.ink },
  retry: { marginTop: spacing.md, alignSelf: 'stretch' },
});
