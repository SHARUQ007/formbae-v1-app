import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import type { WeeklyScoreCriterion } from '../utils/weeklyReport';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';
import { weeklyReadingBlocks } from '../utils/weeklyReportPresentation';
import { ReportIllustration } from './ReportIllustration';

const PRESENTATION: Record<string, { illustration: ReportIllustrationKind; color: string; caption: string }> = {
  'training-target': { illustration: 'training', color: colors.gold, caption: 'Quick sessions are tracked separately.' },
  'food-detail': { illustration: 'diaryCapture', color: colors.gold, caption: 'Measures written diary coverage.' },
  'session-feedback': { illustration: 'evidence', color: colors.gold, caption: 'Each rated session counts once.' },
};

export function WeeklyScoreCard({ criterion, reportKey }: { criterion: WeeklyScoreCriterion; reportKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stackMetric = width < 360 || fontScale >= 1.3;
  const available = criterion.value !== null;
  const presentation = PRESENTATION[criterion.key] || { illustration: 'reportScore', color: colors.inkMuted, caption: '' };
  const fraction = criterion.numerator !== null && criterion.denominator !== null
    ? `${criterion.numerator} of ${criterion.denominator} ${criterion.key === 'food-detail' ? 'days described' : criterion.key === 'session-feedback' ? 'sessions rated' : 'sessions completed'}`
    : null;
  return <View style={styles.card} testID={`weekly-score-${criterion.key}`}>
    <View style={styles.heading}>
      <View style={styles.artwork}><ReportIllustration kind={presentation.illustration} size={44} reportKey={reportKey} /></View>
      <View style={styles.headingCopy}>
        <Text style={styles.title} accessibilityRole="header">{criterion.title}</Text>
        {!stackMetric && available && fraction ? <Text style={styles.headerFraction}>{fraction}</Text> : null}
      </View>
      {!stackMetric && available ? <Text style={[styles.value, { color: presentation.color }]}>{criterion.value}<Text style={styles.percent}>%</Text></Text> : null}
    </View>

    {available ? <>
      {stackMetric ? <View style={styles.measurement}>
        {fraction ? <Text style={styles.fraction}>{fraction}</Text> : <View style={styles.flex} />}
        <Text style={[styles.value, { color: presentation.color }]}>{criterion.value}<Text style={styles.percent}>%</Text></Text>
      </View> : null}
      <View style={styles.track} accessible accessibilityRole="progressbar"
        accessibilityLabel={`${criterion.title}. ${fraction || criterion.calculation}`}
        accessibilityValue={{ min: 0, max: 100, now: criterion.value! }}>
        <View style={[styles.fill, { width: `${criterion.value ?? 0}%`, backgroundColor: presentation.color }]} />
      </View>
      <Text style={styles.caption}>{presentation.caption}</Text>
    </> : <View style={styles.unavailable}>
      <Text style={styles.unavailableLabel}>Not available</Text>
      {weeklyReadingBlocks(criterion.meaning).map(sentence => <Text key={sentence} style={styles.caption}>{sentence}</Text>)}
    </View>}

    <TouchableOpacity style={styles.toggle} activeOpacity={0.8}
      accessibilityRole="button" accessibilityLabel={`How it's calculated: ${criterion.title}`}
      accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>
      <Text style={styles.toggleLabel}>How it’s calculated</Text>
      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
    </TouchableOpacity>
    {expanded ? <View style={styles.details}>
      <Text style={styles.formula}>{criterion.calculation}</Text>
      {available ? weeklyReadingBlocks(criterion.meaning).map(sentence => <Text key={sentence} style={styles.detailText}>{sentence}</Text>) : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.panel, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingCopy: { flex: 1, minWidth: 0 },
  headerFraction: { ...reportTypography.body, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 4 },
  artwork: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  title: { ...reportTypography.bodyStrong, fontSize: 17, lineHeight: 24, color: colors.ink },
  measurement: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 },
  fraction: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 21, color: colors.inkMuted, flexGrow: 1, flexShrink: 1, flexBasis: '50%' },
  value: { ...reportTypography.dataLarge, fontSize: 29, lineHeight: 38 },
  percent: { ...reportTypography.data, fontSize: 14, color: colors.inkMuted },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.panelRaised, marginTop: 16, marginBottom: 10 },
  fill: { height: '100%', borderRadius: 3 },
  caption: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  unavailable: { gap: 8, marginTop: 16 },
  unavailableLabel: { ...reportTypography.label, color: colors.inkMuted, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.panelRaised },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toggleLabel: { ...reportTypography.label, fontSize: 12, lineHeight: 18, color: colors.inkMuted, flex: 1 },
  details: { gap: 8, padding: 12, marginTop: 8, borderRadius: 12, backgroundColor: colors.bg },
  formula: { ...reportTypography.bodyStrong, fontSize: 13, lineHeight: 20, color: colors.ink },
  detailText: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
});
