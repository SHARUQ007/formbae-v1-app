import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function TodayWorkoutBadge({ completed = false }: { completed?: boolean }) {
  const accent = completed ? colors.success : colors.gold;
  return <View style={styles.badge} accessible accessibilityLabel={completed ? 'Today’s workout completed' : 'Today’s workout'}>
    <Svg width={26} height={26} viewBox="0 0 32 32" fill="none" accessible={false}>
      <Rect x={5} y={6} width={22} height={23} rx={5} fill="#35434b" stroke="#a8bcc3" strokeWidth={1.2} />
      <Path d="M5 13h22M11 3v6m10-6v6" stroke="#dce4e5" strokeWidth={1.8} strokeLinecap="round" />
      {completed ? <Path d="m11 21 3 3 7-7" stroke={accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> : <>
        <Circle cx={16} cy={21} r={5} fill={accent} />
        <Path d="M16 18v3l2 1" stroke="#35434b" strokeWidth={1.5} strokeLinecap="round" />
      </>}
    </Svg>
    <Text style={[styles.label, { color: accent }]}>Today</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, paddingLeft: 6, paddingRight: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, flexShrink: 0 },
  label: { ...typography.label, fontWeight: '700' },
});
