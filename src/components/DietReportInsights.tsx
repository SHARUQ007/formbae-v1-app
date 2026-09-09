import { colors } from '../theme/colors';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';
import { dietTopicIllustration } from '../utils/dietReportArtwork';

type Finding = { title: string; observation: string; meaning: string; evidence: string[]; label: string };

export function DietReportInsights({ findings, reportKey = '', dietPreference }: { findings: Finding[]; reportKey?: string; dietPreference?: string }) {
  return <View style={styles.list}>
    {findings.map((finding, index) => <InsightCard key={`${index}-${finding.title}`} finding={finding} index={index} reportKey={reportKey} dietPreference={dietPreference} />)}
  </View>;
}

function InsightCard({ finding, index, reportKey, dietPreference }: { finding: Finding; index: number; reportKey: string; dietPreference?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  // Keep complete sentences, including decimal figures, with the full passage
  // available in the disclosure. Never cut a line or a word to fit the card.
  const firstSentence = finding.observation.match(/^.*?[.!?](?=\s|$)/s)?.[0];
  const preview = finding.observation.length > 180 && firstSentence ? firstSentence : finding.observation;
  const hasDetails = preview !== finding.observation || finding.evidence.length > 0;
  return <View style={styles.card} testID="diet-report-finding">
    <View style={[styles.header, stacked && styles.headerStacked]}>
      <View style={styles.artwork}>
        <ReportIllustration kind={dietTopicIllustration(finding.title)} size={64} reportKey={reportKey} slot={index + 1} dietPreference={dietPreference} />
      </View>
      <View style={[styles.heading, stacked && styles.headingStacked]}>
        <View style={styles.topline}>
          <Text style={styles.badgeText}>{finding.label === 'Focus' ? 'THIS WEEK’S FOCUS' : finding.label.toLocaleUpperCase()}</Text>
          <Text style={styles.index} accessible={false}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">{finding.title}</Text>
      </View>
    </View>
    {finding.observation ? <Text style={styles.observation}>{expanded ? finding.observation : preview}</Text> : null}
    {finding.meaning ? <View style={styles.meaning}>
      <Text style={styles.meaningLabel}>Why it matters</Text>
      <Text style={styles.meaningText}>{finding.meaning}</Text>
    </View> : null}
    {expanded && finding.evidence.length ? <View style={styles.evidence}>
      <Text style={styles.evidenceLabel}>FROM YOUR DIARY</Text>
      {finding.evidence.map((item, evidenceIndex) => <View key={`${evidenceIndex}-${item}`} style={styles.evidenceRow}>
        <View style={styles.evidenceMarker} accessible={false} />
        <Text style={styles.evidenceText}>{item}</Text>
      </View>)}
    </View> : null}
    {hasDetails ? <TouchableOpacity style={styles.toggle} onPress={() => setExpanded(value => !value)}
      accessibilityRole="button" accessibilityLabel={`${expanded ? 'Close' : 'Read'} insight details: ${finding.title}`}
      accessibilityState={{ expanded }}>
      <Text style={styles.toggleText}>{expanded ? 'Show less' : finding.evidence.length ? `Details · ${finding.evidence.length} diary ${finding.evidence.length === 1 ? 'note' : 'notes'}` : 'Read more'}</Text>
      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.inkMuted} accessible={false} />
    </TouchableOpacity> : null}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  artwork: { width: 72, height: 76, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heading: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  headingStacked: { flex: 0 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  badgeText: { ...reportTypography.label, flexShrink: 1, fontSize: 9, lineHeight: 15, letterSpacing: 0.5, color: colors.accent },
  index: { ...reportTypography.data, color: colors.inkSubtle, fontSize: 10, lineHeight: 16 },
  title: { ...reportTypography.bodyStrong, fontSize: 17, lineHeight: 24, color: colors.ink },
  observation: { ...reportTypography.body, fontSize: 13, lineHeight: 22, color: colors.inkMuted, marginTop: 16 },
  meaning: { marginTop: 16, backgroundColor: colors.panelRaised, borderRadius: 14, padding: 14 },
  meaningLabel: { ...reportTypography.label, fontSize: 11, lineHeight: 17, color: colors.accent, marginBottom: 4 },
  meaningText: { ...reportTypography.body, fontSize: 13, lineHeight: 22, color: colors.ink },
  evidence: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 },
  evidenceLabel: { ...reportTypography.label, fontSize: 10, lineHeight: 16, letterSpacing: 0.8, color: colors.inkMuted },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  evidenceMarker: { width: 4, height: 4, borderRadius: 2, marginTop: 8, backgroundColor: colors.inkSubtle },
  evidenceText: { flex: 1, ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.inkMuted },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  toggleText: { flex: 1, ...reportTypography.bodyStrong, fontSize: 12, lineHeight: 19, color: colors.inkMuted },
});
