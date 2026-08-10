import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

type Tone = 'accent' | 'neutral' | 'success' | 'warn' | 'error' | 'info' | 'dark' | 'gold' | 'goldSolid' | 'greenSolid';

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  accent: { bg: colors.panel, fg: colors.gold, border: colors.accentSurface },
  neutral: { bg: colors.panel, fg: colors.inkMuted, border: colors.border },
  success: { bg: colors.panel, fg: colors.success, border: colors.successLight },
  warn: { bg: colors.panel, fg: colors.warn, border: colors.warnLight },
  error: { bg: colors.panel, fg: colors.error, border: colors.errorLight },
  info: { bg: colors.panel, fg: colors.info, border: colors.infoLight },
  dark: { bg: colors.panelRaised, fg: colors.white, border: colors.borderStrong },
  gold: { bg: colors.panel, fg: colors.gold, border: colors.accentSurface },
  goldSolid: { bg: colors.gold, fg: colors.onPrimary, border: colors.gold },
  greenSolid: { bg: colors.success, fg: colors.onPrimary, border: colors.success },
};

export function Badge({ label, tone = 'accent', icon, style }: { label: string; tone?: Tone; icon?: string; style?: ViewStyle }) {
  const c = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      {icon ? <Feather name={icon} size={12} color={c.fg} /> : null}
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: { ...typography.caption, flexShrink: 1, fontWeight: '700' },
});
