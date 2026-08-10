import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../../../theme/colors';
import { radius } from '../../../theme/radius';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  largeText?: boolean;
};

export function WorkoutScreenHeader({ eyebrow, title, subtitle, onBack, right, largeText = false }: Props) {
  return (
    <View style={styles.root}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={23} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.copy}>
        {eyebrow ? <Text style={[styles.eyebrow, largeText && styles.eyebrowLarge]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, largeText && styles.titleLarge]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, largeText && styles.subtitleLarge]}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase', marginBottom: 1 },
  eyebrowLarge: { fontSize: 12, lineHeight: 17 },
  title: { ...typography.title, color: colors.ink },
  titleLarge: { fontSize: 23, lineHeight: 30 },
  subtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  subtitleLarge: { fontSize: 15, lineHeight: 22, marginTop: 2 },
  right: { marginLeft: spacing.xs },
});
