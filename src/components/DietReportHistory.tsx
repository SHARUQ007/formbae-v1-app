import { StableImage } from './StableImage';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { DietCoachFeedback } from '../services/dietDiaryService';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { normalizeDietReportForDisplay } from '../utils/dietReportContract';
import { dietScoreComparison } from '../utils/dietScoreComparison';
import { getReportArchiveArt } from '../utils/reportArtworkLibrary';
import { ReportIllustration } from './ReportIllustration';

const journalArtwork = require('../assets/editorial/history/nutrition-journal.jpg');
const text = (value?: string) => (value || '').trim();
const sameCopy = (left: string, right: string) => left.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === right.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

type Props = {
  reports: DietCoachFeedback[];
  onOpen: (report: DietCoachFeedback) => void;
  formatPeriod: (start: string, end?: string) => string;
  formatGenerated: (date: string) => string;
};

export function DietReportHistory({ reports, onOpen, formatPeriod, formatGenerated }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const entries = reports.map(source => ({ source, report: normalizeDietReportForDisplay(source) }))
    .sort((a, b) => (Date.parse(b.report.generatedAt) || 0) - (Date.parse(a.report.generatedAt) || 0));
  const history = entries.map(entry => entry.report);
  const artwork = getReportArchiveArt(entries.length, history[0]?.weekStartDate || '');
  return <View style={styles.document} testID="diet-report-history">
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>NUTRITION JOURNAL</Text>
      <View style={[styles.introRow, compact && styles.introStacked]}>
        <View style={[styles.introCopy, compact && styles.introCopyStacked]}>
          <Text style={styles.title} accessibilityRole="header">Your weeks, collected.</Text>
          <Text style={styles.introSubtitle}>{entries.length ? 'Your food patterns, week by week.' : 'A little more insight with every report.'}</Text>
        </View>
        <ArchiveArtwork source={journalArtwork} hero wide={compact} />
      </View>
    </View>
    {entries.length ? <View style={styles.list}>
      {entries.map(({ source, report }, index) => <ArchiveCard key={`${report.generatedAt}-${index}`} report={report} history={history}
        artwork={artwork[index]} index={index} onOpen={() => onOpen(source)} formatPeriod={formatPeriod} formatGenerated={formatGenerated} />)}
    </View> : <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Your collection starts here</Text>
      <Text style={styles.subtitle}>When your next report is ready, the current one will be saved here.</Text>
    </View>}
  </View>;
}

function ArchiveArtwork({ source, hero = false, wide = false, slot = 0 }: { source?: ImageSourcePropType; hero?: boolean; wide?: boolean; slot?: number }) {
  const [failed, setFailed] = useState<ImageSourcePropType>();
  if (hero) {
    // A bounded frame prevents the bundled image's intrinsic height from
    // expanding the intro on native platforms. Keep the full composition.
    return <View style={[styles.heroArt, wide && styles.heroArtWide, styles.artFallback]}>
      {source && source !== failed
        ? <StableImage source={source} onError={() => setFailed(source)} style={styles.heroImage} resizeMode="contain" accessible={false} />
        : <ReportIllustration kind="reportReview" size={64} slot={slot} />}
    </View>;
  }
  return source && source !== failed
    ? <StableImage source={source} onError={() => setFailed(source)} style={styles.thumbnail} resizeMode="cover" accessible={false} />
    : <View style={[styles.thumbnail, styles.artFallback]}><ReportIllustration kind="reportReview" size={56} slot={slot} /></View>;
}

function ArchiveCard({ report, history, artwork, index, onOpen, formatPeriod, formatGenerated }: {
  report: DietCoachFeedback; history: DietCoachFeedback[]; artwork?: ImageSourcePropType; index: number; onOpen: () => void;
  formatPeriod: Props['formatPeriod']; formatGenerated: Props['formatGenerated'];
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  const value = report.score?.overall;
  const score = (!report.score?.availability || report.score.availability === 'available') && typeof value === 'number' && value >= 0 && value <= 100 ? Math.round(value) : null;
  const comparison = dietScoreComparison(report, history);
  const delta = 'change' in comparison ? `${comparison.change > 0 ? '+' : '−'}${Math.abs(comparison.change)} ${Math.abs(comparison.change) === 1 ? 'point' : 'points'}` : '';
  const headline = text(report.headline) || text(report.title) || 'Weekly nutrition review';
  const priority = report.priorityInsights?.[0];
  const insight = text(priority?.title) || text(report.summary);
  const action = text(report.nextWeek?.actionPlan?.[0]?.title) || text(report.nextWeek?.primaryFocus) || text(priority?.nextStep) || text(report.nextWeek?.actions?.[0]) || text(report.nextFocus);
  const period = formatPeriod(report.weekStartDate, report.weekEndDate);
  const generated = formatGenerated(report.generatedAt);
  return <TouchableOpacity style={styles.card} activeOpacity={0.82} onPress={onOpen} testID="diet-report-history-card"
    accessibilityRole="button" accessibilityLabel={`Open diet report for ${period}. ${generated}. ${headline}${score !== null ? `. Score ${score} out of 100` : ''}`}
    accessibilityHint="Opens the complete saved report">
    <View style={[styles.top, stacked && styles.topStacked]}>
      <View style={styles.periodCopy}>
        <Text style={[styles.edition, index === 0 && styles.latest]}>{index === 0 ? 'LATEST SAVED' : 'SAVED REPORT'}</Text>
        <Text style={styles.period}>{period}</Text>
      </View>
      <View style={[styles.score, stacked && styles.scoreStacked]}>
        <Text style={styles.scoreValue}>{score ?? '—'}<Text style={styles.scoreMax}> /100</Text></Text>
        <Text style={styles.scoreLabel}>{score === null ? 'Not assessed' : 'Diary score'}</Text>
      </View>
    </View>
    <View style={[styles.identity, stacked && styles.identityStacked]}>
      <ArchiveArtwork source={artwork} slot={index} />
      <Text style={styles.headline} accessibilityRole="header">{headline}</Text>
    </View>
    {insight && !sameCopy(insight, headline) ? <View style={styles.insight}>
      <Text style={styles.label}>KEY INSIGHT</Text>
      <Text style={styles.insightText}>{insight}</Text>
    </View> : null}
    {action && !sameCopy(action, headline) && !sameCopy(action, insight) ? <View style={styles.action}>
      <View style={styles.actionArt}><ReportIllustration kind="reportPlan" size={32} reportKey={report.weekStartDate} slot={index + 1} /></View>
      <View style={styles.actionCopy}><Text style={styles.label}>NEXT STEP</Text><Text style={styles.actionText}>{action}</Text></View>
    </View> : null}
    {'change' in comparison && score !== null ? <View style={styles.change}>
      <Text style={styles.changeValue}>{comparison.change === 0 ? 'No score change' : delta}</Text>
      <Text style={styles.changeNote}>{comparison.note ? `${comparison.note} · score revision` : 'vs previous saved report'}</Text>
    </View> : null}
    <View style={styles.footer}>
      <Text style={styles.generated}>{generated}</Text>
      <View style={styles.open}><Feather name="arrow-up-right" size={17} color={colors.ink} accessible={false} /></View>
    </View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  document: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  intro: { padding: 16, marginBottom: 20, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  introStacked: { flexDirection: 'column-reverse', alignItems: 'stretch', gap: 12 },
  introCopy: { flex: 1, minWidth: 0 },
  introCopyStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  introSubtitle: { ...reportTypography.body, fontSize: 12, lineHeight: 19, color: colors.inkMuted, marginTop: 8 },
  heroArt: { width: 120, height: 100, flexShrink: 0, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bg },
  heroArtWide: { width: '100%', height: 112 },
  heroImage: { width: '100%', height: '100%' },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...reportTypography.label, fontSize: 9, lineHeight: 15, letterSpacing: 1.2, color: colors.accent },
  title: { ...reportTypography.heading, fontSize: 22, lineHeight: 29, color: colors.ink },
  subtitle: { ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.inkMuted, marginTop: 6 },
  list: { gap: 16 },
  card: { padding: 16, borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  topStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  periodCopy: { flex: 1, minWidth: 0, gap: 4 },
  edition: { ...reportTypography.label, fontSize: 9, lineHeight: 15, letterSpacing: 0.8, color: colors.inkSubtle },
  latest: { color: colors.accent },
  period: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 21, color: colors.ink },
  score: { alignItems: 'flex-end' },
  scoreStacked: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  scoreValue: { ...reportTypography.bodyStrong, fontSize: 26, lineHeight: 32, fontVariant: ['tabular-nums'], color: colors.ink },
  scoreMax: { fontSize: 11, lineHeight: 17, color: colors.inkSubtle },
  scoreLabel: { ...reportTypography.body, fontSize: 9, lineHeight: 15, color: colors.inkSubtle },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  identityStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  thumbnail: { width: 76, height: 76, borderRadius: 16, flexShrink: 0, backgroundColor: colors.bg },
  headline: { ...reportTypography.heading, flexShrink: 1, minWidth: 0, fontSize: 18, lineHeight: 25, color: colors.ink },
  insight: { marginTop: 16, gap: 4 },
  label: { ...reportTypography.label, fontSize: 9, lineHeight: 15, letterSpacing: 0.7, color: colors.inkSubtle },
  insightText: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  action: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  actionArt: { width: 32, flexShrink: 0, paddingTop: 2 },
  actionCopy: { flex: 1, minWidth: 0, gap: 3 },
  actionText: { ...reportTypography.bodyStrong, fontSize: 13, lineHeight: 20, color: colors.ink },
  change: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  changeValue: { ...reportTypography.bodyStrong, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  changeNote: { ...reportTypography.body, fontSize: 11, lineHeight: 17, color: colors.inkSubtle },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 14, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  generated: { ...reportTypography.body, flex: 1, minWidth: 0, fontSize: 10, lineHeight: 17, color: colors.inkSubtle },
  open: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderColor: colors.border, padding: 20, borderRadius: 18 },
  emptyTitle: { ...reportTypography.bodyStrong, fontSize: 17, lineHeight: 24, color: colors.ink },
});
