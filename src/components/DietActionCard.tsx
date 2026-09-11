import { StableImage } from './StableImage';
import { useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { dietTopicIllustration } from '../utils/dietReportArtwork';
import { getDietActionArtwork } from '../utils/dietActionArtwork';
import { ReportIllustration } from './ReportIllustration';

export function DietActionCard({ action, index, reportKey, dietPreference }: {
  action: { title: string; why: string; cue: string; steps: string[]; fallback: string; successMeasure: string };
  index: number;
  reportKey: string;
  dietPreference?: string;
}) {
  const [failedArtwork, setFailedArtwork] = useState<ImageSourcePropType>();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 370 || fontScale >= 1.3;
  const artwork = getDietActionArtwork(action.title, reportKey, index);
  return <View style={styles.card} testID="diet-report-action">
    <View style={styles.content}>
      <View style={[styles.header, stacked && styles.headerStacked]}>
        {artwork && failedArtwork !== artwork ? <StableImage onError={() => setFailedArtwork(artwork)} source={artwork} style={styles.art} resizeMode="cover" accessible={false} />
          : <View style={[styles.art, styles.vector]}><ReportIllustration kind={dietTopicIllustration(action.title, 'reportPlan')} dietPreference={dietPreference} size={80} reportKey={reportKey} slot={index + 1} /></View>}
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{index === 0 ? 'START HERE' : 'THEN, IF MANAGEABLE'}</Text>
          <Text style={styles.title} accessibilityRole="header">{action.title}</Text>
        </View>
      </View>
      {action.why ? <Text style={styles.why}>{action.why}</Text> : null}
      {action.cue ? <View style={styles.cue}>
        <Text style={styles.cueLabel}>YOUR CUE</Text>
        <Text style={styles.body}>{action.cue}</Text>
      </View> : null}
      {action.steps.length ? <View style={styles.steps}>
        {action.steps.map((step, stepIndex) => <View key={`${stepIndex}-${step}`} style={styles.step}>
          <View style={styles.stepRail} accessible={false}>
            <View style={styles.stepMarker}><Text style={styles.number}>{String(stepIndex + 1).padStart(2, '0')}</Text></View>
            {stepIndex < action.steps.length - 1 ? <View style={styles.stepConnector} /> : null}
          </View>
          <Text style={[styles.stepText, stepIndex < action.steps.length - 1 && styles.stepSpacing]}>{step}</Text>
        </View>)}
      </View> : null}
      {action.fallback ? <View style={styles.backup}>
        <Text style={styles.label}>On a busy day</Text>
        <Text style={styles.body}>{action.fallback}</Text>
      </View> : null}
      {action.successMeasure ? <View style={styles.target}>
        <View style={styles.targetHeading}>
          <View style={styles.targetArt}><ReportIllustration kind="coverageDays" size={40} reportKey={reportKey} slot={index + 2} /></View>
          <Text style={styles.targetLabel}>YOUR CHECK-IN TARGET</Text>
        </View>
        <Text style={styles.targetText}>{action.successMeasure}</Text>
      </View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  content: { padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  art: { width: 94, height: 94, borderRadius: 18, flexShrink: 0, backgroundColor: colors.bg },
  vector: { alignItems: 'center', justifyContent: 'center' },
  heading: { flexShrink: 1, minWidth: 0, gap: 8 },
  eyebrow: { ...reportTypography.label, fontSize: 10, lineHeight: 16, letterSpacing: 0.6, color: colors.accent },
  title: { ...reportTypography.heading, fontSize: 20, lineHeight: 27, color: colors.ink },
  why: { ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.inkMuted, marginTop: 16 },
  cue: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 12, marginTop: 20, gap: 4 },
  cueLabel: { ...reportTypography.label, fontSize: 9, lineHeight: 15, letterSpacing: 1, color: colors.inkSubtle },
  label: { ...reportTypography.label, fontSize: 11, lineHeight: 18, color: colors.inkMuted },
  body: { ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.ink },
  steps: { marginTop: 20 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepRail: { alignSelf: 'stretch', alignItems: 'center', flexShrink: 0 },
  stepMarker: { minWidth: 28, minHeight: 28, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  number: { ...reportTypography.data, fontSize: 10, lineHeight: 18, color: colors.accent },
  stepConnector: { width: 1, flex: 1, minHeight: 12, backgroundColor: colors.border, marginVertical: 5 },
  stepSpacing: { paddingBottom: 18 },
  stepText: { ...reportTypography.body, flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22, paddingTop: 3, color: colors.ink },
  backup: { marginTop: 16, borderRadius: 14, padding: 14, backgroundColor: colors.bg, gap: 5 },
  target: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, padding: 14, gap: 10 },
  targetHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  targetArt: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  targetLabel: { ...reportTypography.label, flex: 1, minWidth: 0, fontSize: 10, lineHeight: 17, letterSpacing: 0.6, color: colors.accent },
  targetText: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 22, color: colors.ink },
});
