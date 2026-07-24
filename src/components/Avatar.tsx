import { View, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';

const AVATAR_ICONS: Record<string, string> = {
  panther: 'cat',
  wolf: 'dog',
  eagle: 'bird',
  shark: 'fish',
  rabbit: 'rabbit',
  cobra: 'snake',
};

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

export function Avatar({
  name,
  size = 48,
  tone = 'accent',
  iconId,
}: {
  name?: string;
  size?: number;
  tone?: 'accent' | 'neutral';
  iconId?: string;
}) {
  const bg = tone === 'accent' ? colors.accent : colors.panelMuted;
  const fg = tone === 'accent' ? colors.white : colors.inkMuted;
  const iconName = iconId ? AVATAR_ICONS[iconId] : undefined;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius.pill, backgroundColor: bg }]}>
      {iconName ? (
        <MaterialCommunityIcon name={iconName} size={size * 0.48} color={fg} />
      ) : (
        <Text style={[styles.text, { color: fg, fontSize: size * 0.38 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800', letterSpacing: 0.3 },
});
