import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

type CardVariant = 'elevated' | 'flat' | 'accent' | 'outline';

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: CardVariant;
  onPress?: () => void;
};

export function Card({ children, style, variant = 'elevated', onPress }: CardProps) {
  const content = <View style={[styles.card, cardVariants[variant], style]}>{children}</View>;
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

type Props = { children: React.ReactNode; style?: ViewStyle };

type ScreenContainerProps = Props & {
  /** Add bottom safe-area inset. Use on screens without a tab bar. Default false. */
  withBottomInset?: boolean;
};

export function ScreenContainer({ children, style, withBottomInset = false }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: withBottomInset ? insets.bottom + spacing.lg : spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function ScreenSubtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <Text style={[styles.section, style]}>{children}</Text>;
}

/** Compact top header with optional back button and right slot. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

const cardVariants: Record<CardVariant, ViewStyle> = {
  elevated: { backgroundColor: colors.panel, borderColor: 'rgba(201,221,209,0.72)', borderWidth: 1, ...shadows.card },
  flat: { backgroundColor: colors.panelMuted, borderColor: 'rgba(201,221,209,0.45)', borderWidth: 1 },
  outline: { backgroundColor: colors.panel, borderColor: colors.borderStrong, borderWidth: 1 },
  accent: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface, borderWidth: 1, ...shadows.sm },
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: spacing.lg,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  title: { ...typography.hero, color: colors.ink, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
  section: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, minHeight: 32 },
  backBtn: { marginRight: spacing.sm, marginLeft: -6 },
  headerText: { flex: 1 },
  headerTitle: { ...typography.title, color: colors.ink },
  headerSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  headerRight: { marginLeft: spacing.sm },
});
