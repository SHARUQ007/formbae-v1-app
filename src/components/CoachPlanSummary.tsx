import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const inputs = [
  { label: 'Your logs', detail: 'What you do', color: '#97bdad', art: '<rect x="10" y="8" width="24" height="30" rx="4" fill="#243a34"/><rect x="17" y="5" width="10" height="7" rx="2" fill="#97bdad"/><path d="m15 20 2 2 4-4m4 3h4m-14 9 2 2 4-4m4 3h4"/>' },
  { label: 'Your feedback', detail: 'How you feel', color: '#c1abd8', art: '<path d="M8 10h28v21H21l-9 7v-7H8Z" fill="#342c40"/><path d="M15 18h14m-14 6h9"/><circle cx="34" cy="33" r="7" fill="#c1abd8" stroke="#c1abd8"/><path d="m31 33 2 2 4-4" stroke="#342c40"/>' },
  { label: 'Your schedule', detail: 'When you train', color: '#e8ca80', art: '<rect x="7" y="9" width="30" height="29" rx="4" fill="#3a3322"/><path d="M7 18h30M15 6v7m14-7v7"/><rect x="13" y="23" width="6" height="6" rx="1" fill="#e8ca80"/><path d="M25 25h5m-15 9h4m6 0h5"/>' },
] as const;

export function CoachPlanSummary() {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.2;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>A plan built around you</Text>
      <Text style={styles.caption}>Three inputs shape your next two weeks.</Text>
      <View style={[styles.inputs, stacked && styles.inputsStacked]}>
        {inputs.map(input => (
          <View key={input.label} style={[styles.input, stacked && styles.inputStacked]}>
            <SvgXml
              xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><g fill="none" stroke="${input.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${input.art}</g></svg>`}
              width={38}
              height={38}
              accessible={false}
            />
            <View style={styles.copy}>
              <Text style={styles.label}>{input.label}</Text>
              <Text style={styles.detail}>{input.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  title: { ...typography.bodyBold, color: colors.inkStrong },
  caption: { ...typography.caption, color: colors.inkMuted, marginTop: 4 },
  inputs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  inputsStacked: { flexDirection: 'column' },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 12, gap: 8, borderRadius: 12, backgroundColor: colors.panelRaised },
  inputStacked: { flex: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flexShrink: 1 },
  label: { ...typography.caption, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 11, lineHeight: 16, color: colors.inkMuted, marginTop: 3 },
});
