import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

type Tone = 'accent' | 'neutral' | 'success' | 'warn' | 'error' | 'info';

const tones: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: colors.accentLight, fg: colors.accentDark },
  neutral: { bg: colors.panelMuted, fg: colors.inkMuted },
  success: { bg: colors.successLight, fg: colors.success },
  warn: { bg: colors.warnLight, fg: colors.warn },
  error: { bg: colors.errorLight, fg: colors.error },
  info: { bg: colors.infoLight, fg: colors.info },
};

export function Badge({ label, tone = 'accent', icon }: { label: string; tone?: Tone; icon?: string }) {
  const c = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon ? <Feather name={icon} size={12} color={c.fg} /> : null}
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  text: { ...typography.caption, fontWeight: '700' },
});
