import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { WeeklyProgressReview } from '../types/api';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { ReportIllustration } from './ReportIllustration';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';
import { weeklyContextIllustration, weeklyReadingBlocks } from '../utils/weeklyReportPresentation';
import { WeeklyScoreCard } from './WeeklyScoreCard';
import { WeeklyActivityRecord } from './WeeklyActivityRecord';
import { ReportSourceArticles } from './ReportSourceArticles';
import { getReportEditorialArtwork } from '../utils/reportArtwork';
import {
  buildWeeklyReportModel,
  buildWeeklyScorecard,
  weeklyActivityDays,
  weeklyBodyComparison,
  weeklyDomainLabel,
  weeklyReportDate,
} from '../utils/weeklyReport';

type Props = {
  report: WeeklyProgressReview;
  onAction: (domain: 'workout' | 'diet' | 'body') => void;
};

export function WeeklyReportStory({ report, onAction }: Props) {
  const reportKey = report.period?.start || report.weekStartDate || report.generatedAt || "weekly-report";
  const { width, fontScale } = useWindowDimensions();
  const stackArtwork = width < 360 || fontScale >= 1.3;
  const model = buildWeeklyReportModel(report);
  const { stats, findings, actions, questions } = model;
  const metrics = report.metrics;
  const generatedDate = weeklyReportDate(report.generatedAt);
  const completed = stats?.workoutsCompleted ?? metrics?.trainingSummary?.completed;
  const foodDays = stats?.dietDaysLogged ?? metrics?.nutritionSummary?.daysLogged;
  const foodLogs = stats?.mealsLogged ?? metrics?.nutritionSummary?.foodLogs;
  const standard = stats?.standardWorkoutsCompleted ?? metrics?.trainingSummary?.standardSessions;
  const quick = stats?.quickWorkoutsCompleted ?? metrics?.trainingSummary?.quickSessions;
  const ratedSessions = stats?.ratedSessionCount ?? metrics?.trainingSummary?.ratedSessions;
  const validNumber = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const bodyChanges = (metrics?.bodyChanges ?? []).filter(metric => Number.isFinite(metric.current) && metric.current > 0);
  const activity = weeklyActivityDays(report);
  const scorecard = buildWeeklyScorecard(report);
  const coverageSummary = report.evidenceCoverage?.summary || 'Based on saved activity and meals in this reporting period. Unlogged activity and food are unknown.';

  return (
    <View testID="weekly-report-story">
      <View style={styles.lead}>
        <View style={styles.dateLine}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>YOUR WEEKLY REVIEW</Text>
            <Text style={styles.period}>{model.periodLabel}</Text>
          </View>
          <ReportIllustration kind="training" size={78} reportKey={reportKey} />
        </View>
        <Text style={styles.headline} accessibilityRole="header">{model.headline}</Text>
        {model.summary ? <View style={styles.summaryBlocks}><ReadingBlocks value={model.summary} /></View> : null}
        <Image source={getReportEditorialArtwork('training', reportKey)} style={styles.leadArtwork} resizeMode="cover" accessible={false} testID="weekly-report-context-art" />
        <View style={styles.byline}>
          <View style={styles.bylineDot} />
          <Text style={styles.bylineText}>
            {report.generationMethod === 'data_summary' ? 'Activity summary' : 'Personal weekly review'}
            {generatedDate ? ` · Prepared ${generatedDate}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.snapshot}>
        <View style={styles.snapshotCell}>
          <View style={styles.metricHeading}><ReportIllustration kind="training" size={38} reportKey={reportKey} slot={1} /><Text style={styles.metricLabel}>Training</Text></View>
          <Text style={styles.metricValue}>{validNumber(completed) ? completed : '—'}</Text>
          <Text style={styles.metricCaption}>sessions recorded</Text>
          <Text style={styles.metricNote}>{validNumber(completed) ? 'Standard and quick sessions' : 'Snapshot unavailable'}</Text>
        </View>
        <View style={styles.snapshotDivider} />
        <View style={styles.snapshotCell}>
          <View style={styles.metricHeading}><ReportIllustration kind="nutrition" size={38} reportKey={reportKey} slot={1} /><Text style={styles.metricLabel}>Food diary</Text></View>
          <Text style={styles.metricValue}>{validNumber(foodLogs) ? foodLogs : '—'}</Text>
          <Text style={styles.metricCaption}>food entries saved</Text>
          <Text style={styles.metricNote}>{validNumber(foodDays) ? `Across ${foodDays} of 7 days` : 'Snapshot unavailable'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading index="01" illustration="reportReview" reportKey={reportKey} title="Week in review" />
        {model.weekSummary ? <View style={styles.reviewSummary}><ReadingBlocks value={model.weekSummary} emphasized bullets /></View> : null}
        <View style={styles.coverageNote}><View style={styles.coverageMarker} /><Text style={styles.coverageText}>{coverageSummary}</Text></View>
        {activity.length ? <WeeklyActivityRecord data={activity} reportKey={reportKey} /> : <Text style={styles.detailNote}>Daily activity detail was not saved with this report.</Text>}
      </View>

      <View style={styles.section}>
        <SectionHeading index="02" illustration="reportScore" reportKey={reportKey} title="Your scores & criteria" detail="Three transparent measures of your recorded week." />
        <View style={styles.scorecard}>
          {scorecard.map(criterion => <WeeklyScoreCard key={`${reportKey}-${criterion.key}`} criterion={criterion} reportKey={reportKey} />)}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading index="03" illustration="reportFocus" reportKey={reportKey} title={findings.length ? 'What deserves your attention' : 'An early picture'} detail={findings.length ? 'The meaning behind the records, and where to focus.' : undefined} />
        {findings.length ? findings.map((finding, index) => (
          <View key={finding.id || `${finding.title}-${index}`} style={styles.finding}>
            <View style={[styles.illustratedHeading, stackArtwork && styles.stackedHeading]}>
              <View style={styles.artTile}><ReportIllustration kind={weeklyContextIllustration(finding.domain, finding.title)} size={60} reportKey={reportKey} slot={index} /></View>
              <View style={styles.flex}>
                <View style={styles.findingMeta}><Text style={styles.domain}>{weeklyDomainLabel(finding.domain)}</Text><Text style={styles.findingNumber}>{String(index + 1).padStart(2, '0')}</Text></View>
                <Text style={styles.findingTitle}>{finding.title}</Text>
              </View>
            </View>
            {finding.observation ? <ReadingBlocks value={finding.observation} /> : null}
            {finding.evidence.length ? <RecordDisclosure key={`${report.generatedAt}-${finding.id || finding.title}`} title={finding.title} evidence={finding.evidence} /> : null}
            {finding.meaning ? <View style={styles.takeaway}><Text style={styles.evidenceLabel}>Your takeaway</Text><ReadingBlocks value={finding.meaning} emphasized /></View> : null}
          </View>
        )) : <Text style={styles.body}>This saved report does not include a supported pattern yet. The recorded totals above are the available evidence.</Text>}
      </View>

      <View style={styles.section}>
        <SectionHeading index="04" illustration="training" reportKey={reportKey} title="Training & body detail" />
        {(validNumber(standard) && standard > 0) || (validNumber(quick) && quick > 0) ? (
          <View style={styles.sessionMix}>
            <View style={styles.sessionMixCell}><Text style={styles.sessionMixValue}>{validNumber(standard) ? standard : '—'}</Text><Text style={styles.sessionMixLabel}>Standard sessions</Text></View>
            <View style={styles.snapshotDivider} />
            <View style={styles.sessionMixCell}><Text style={styles.sessionMixValue}>{validNumber(quick) ? quick : '—'}</Text><Text style={styles.sessionMixLabel}>Quick sessions</Text></View>
          </View>
        ) : null}
        {stats && stats.workoutsCompleted > 0 && !validNumber(ratedSessions) ? <DetailRow label="Saved feedback" value={`${stats.workoutFeedbackCount} feedback ${stats.workoutFeedbackCount === 1 ? 'entry' : 'entries'}`} /> : null}
        {metrics?.workoutFocus?.length ? (
          <View style={styles.detailGroup}>
            <Text style={styles.detailTitle}>What your sessions covered</Text>
            {metrics.workoutFocus.map(item => <DetailRow key={item.label} label={item.label} value={`${item.count} ${item.count === 1 ? 'session' : 'sessions'}`} />)}
          </View>
        ) : null}
        {metrics?.feedbackSignals?.length ? (
          <View style={styles.detailGroup}>
            <Text style={styles.detailTitle}>How rated sessions felt</Text>
            {metrics.feedbackSignals.map(item => <DetailRow key={item.label} label={item.label === 'up' ? 'Positive feedback' : item.label === 'down' ? 'Negative feedback' : item.label} value={`${item.count} ${item.count === 1 ? 'rating' : 'ratings'}`} />)}
          </View>
        ) : null}
        <View style={styles.measurementSection}>
          <View style={styles.measurementHeading}><ReportIllustration kind="measurements" size={56} reportKey={reportKey} /><View style={styles.flex}><Text style={styles.detailTitle}>Body measurements</Text>{stats ? <Text style={styles.detailNote}>{stats.bodyLogCount} saved {stats.bodyLogCount === 1 ? 'entry' : 'entries'} in this period</Text> : null}</View></View>
          {bodyChanges.length ? (
            <>
              {bodyChanges.map(metric => (
                <View key={metric.key} style={styles.bodyMetric}>
                  <DetailRow label={metric.label} value={`${metric.current} ${metric.unit}`} />
                  <Text style={styles.detailNote}>{weeklyBodyComparison(metric)}</Text>
                </View>
              ))}
              <Text style={styles.detailNote}>Short-term changes can reflect fluid and measurement conditions. They do not establish a change in body fat or muscle.</Text>
            </>
          ) : <Text style={styles.detailNote}>No comparable measurements were saved for this report. A body trend cannot be established.</Text>}
        </View>
      </View>

      {actions.length ? (
        <View style={styles.section}>
          <SectionHeading index="05" illustration="reportPlan" reportKey={reportKey} title="Your next steps" detail={actions.length === 1 ? 'One practical focus to carry forward.' : 'Start with your first priority; add the others as your week allows.'} />
          <View style={styles.actionStack}>
            {actions.map((action, index) => (
              <View key={action.id || `${action.title}-${index}`} style={styles.action}>
                <View style={styles.actionMeta}>
                  <Text style={styles.actionPriority}>{`PRIORITY ${index + 1}`}</Text>
                  <Text style={styles.actionDomain}>{weeklyDomainLabel(action.domain)}</Text>
                </View>
                <View style={[styles.illustratedHeading, stackArtwork && styles.stackedHeading]}>
                  <View style={styles.artTile}><ReportIllustration kind={weeklyContextIllustration(action.domain, action.title)} size={60} reportKey={reportKey} slot={index + 1} /></View>
                  <Text style={[styles.actionTitle, styles.flex]}>{action.title}</Text>
                </View>
                {action.why ? <ReadingBlocks value={action.why} /> : null}
                {action.cue ? <PlanDetail label="When" value={action.cue} /> : null}
                {action.steps.length ? (
                  <View style={styles.steps}>
                    {action.steps.map((step, stepIndex) => (
                      <View key={step} style={styles.step}>
                        <View style={styles.stepBadge}><Text style={styles.stepNumber}>{String(stepIndex + 1).padStart(2, '0')}</Text></View>
                        <View style={styles.flex}><ReadingBlocks value={step} emphasized /></View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {action.fallback ? <View style={styles.busyDay}><PlanDetail label="On a busy day" value={action.fallback} inset /></View> : null}
                {action.successMeasure ? (
                  <View style={styles.success}>
                    <View style={styles.targetHeading}>
                      <ReportIllustration kind="coverageDays" size={36} reportKey={reportKey} slot={index} />
                      <Text style={styles.successLabel}>Your check-in target</Text>
                    </View>
                    <ReadingBlocks value={action.successMeasure} emphasized />
                  </View>
                ) : null}
                {action.destination ? (
                  <TouchableOpacity
                    style={[styles.actionButton, index > 0 && styles.actionButtonSecondary]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${action.destination.label}: ${action.title}`}
                    onPress={() => onAction(action.destination!.domain)}
                  >
                    <Text style={[styles.actionButtonText, index > 0 && styles.actionButtonTextSecondary]}>{action.destination.label}</Text>
                    <Feather name="arrow-right" size={17} color={index === 0 ? colors.onPrimary : colors.ink} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {questions.length ? <View style={styles.section}>
        <SectionHeading index="06" illustration="evidence" reportKey={reportKey} title="To clarify next week" detail="A little context can make the next review more useful." />
        {questions.map(question => <View key={question.title} style={styles.finding}>
          <Text style={styles.findingTitle}>{question.title}</Text>
          {question.reason ? <ReadingBlocks value={question.reason} /> : null}
          {question.response ? <PlanDetail label="Next check" value={question.response} /> : null}
        </View>)}
      </View> : null}

      <View style={styles.section}>
        <ReportSourceArticles sources={report.evidenceBasis || []} reportKey={reportKey} family="weekly" />
      </View>
      <Text style={styles.footer}>{report.generationMethod === 'data_summary' ? 'Prepared from saved activity counts. Personalized interpretation was unavailable when this report was created.' : 'This review brings together your saved activity, food diary and reported experience for the dates shown above.'}</Text>
    </View>
  );
}

function SectionHeading({ index, title, detail, illustration, reportKey = '' }: { index: string; title: string; detail?: string; illustration?: ReportIllustrationKind; reportKey?: string }) {
  return <View style={styles.sectionHeading}>{illustration ? <View style={styles.sectionArt}><ReportIllustration kind={illustration} size={48} reportKey={reportKey} slot={1} /></View> : <Text style={styles.sectionIndex}>{index}</Text>}<View style={styles.flex}><Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>{detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}</View></View>;
}

function RecordDisclosure({ title, evidence }: { title: string; evidence: string[] }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.recordDisclosure}>
    <TouchableOpacity
      style={styles.recordToggle}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`In your records: ${title}`}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)}
    >
      <Text style={styles.recordLabel}>In your records</Text>
      <Text style={styles.recordCount}>{evidence.length} {evidence.length === 1 ? 'note' : 'notes'}</Text>
      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
    </TouchableOpacity>
    {expanded ? <View style={styles.evidence}>{evidence.map(item => <Text key={item} style={styles.evidenceText}>{item}</Text>)}</View> : null}
  </View>;
}

function ReadingBlocks({ value, emphasized = false, bullets = false }: { value: string; emphasized?: boolean; bullets?: boolean }) {
  const blocks = weeklyReadingBlocks(value);
  return <View style={styles.readingBlocks}>{blocks.map((block, index) => (
    <View key={`${index}-${block}`} style={styles.readingRow}>
      {bullets ? <View style={styles.readingDot} /> : null}
      <Text style={[styles.readingText, emphasized && styles.readingTextEmphasized]}>{block}</Text>
    </View>
  ))}</View>;
}

function PlanDetail({ label, value, inset = false }: { label: string; value: string; inset?: boolean }) {
  return <View style={inset ? styles.insetDetail : styles.planDetail}><Text style={styles.planLabel}>{label}</Text><ReadingBlocks value={value} /></View>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailRowLabel}>{label}</Text><Text style={styles.detailRowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  lead: { paddingTop: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  eyebrow: { ...reportTypography.label, color: colors.gold, letterSpacing: 1.2 },
  period: { ...reportTypography.data, color: colors.inkMuted, marginTop: spacing.sm },
  headline: { ...reportTypography.display, fontSize: 31, lineHeight: 40, color: colors.ink, marginTop: spacing.lg },
  leadArtwork: { width: '100%', height: 148, borderRadius: radius.md, marginTop: spacing.lg, backgroundColor: colors.panel },
  summary: { ...reportTypography.body, color: colors.inkMuted, marginTop: spacing.md },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  bylineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  bylineText: { ...reportTypography.label, color: colors.inkMuted, flex: 1 },
  snapshot: { flexDirection: 'row', marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  snapshotCell: { flex: 1, minWidth: 0 },
  snapshotDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginHorizontal: spacing.md },
  metricHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metricLabel: { ...reportTypography.label, color: colors.inkMuted, flexShrink: 1 },
  metricValue: { ...reportTypography.dataLarge, fontSize: 29, lineHeight: 38, color: colors.ink, marginTop: spacing.sm },
  metricDenominator: { ...reportTypography.data, fontSize: 17, color: colors.inkMuted },
  metricCaption: { ...reportTypography.label, fontSize: 12, lineHeight: 18, color: colors.ink },
  metricNote: { ...reportTypography.label, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: spacing.xs },
  coverageNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  coverageText: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted, flex: 1 },
  coverageMarker: { width: 3, alignSelf: 'stretch', backgroundColor: colors.borderStrong, borderRadius: 2 },
  weekSummary: { ...reportTypography.body, fontSize: 17, lineHeight: 28, color: colors.ink },
  scorecard: { gap: 12 },
  findingMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  findingNumber: { ...reportTypography.data, color: colors.inkMuted },
  sessionMix: { flexDirection: 'row', padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  sessionMixCell: { flex: 1, minWidth: 0 },
  sessionMixValue: { ...reportTypography.dataLarge, color: colors.ink },
  sessionMixLabel: { ...reportTypography.label, color: colors.inkMuted, marginTop: spacing.xs },
  measurementSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  measurementHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  section: { marginTop: spacing.xl },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  sectionArt: { width: 48, flexShrink: 0 },
  sectionIndex: { ...reportTypography.data, color: colors.gold, paddingTop: 4 },
  sectionTitle: { ...reportTypography.heading, fontSize: 22, lineHeight: 29, color: colors.ink },
  sectionDetail: { ...reportTypography.body, fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: spacing.xs },
  finding: { padding: 18, marginBottom: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  domain: { ...reportTypography.label, color: colors.gold },
  findingTitle: { ...reportTypography.bodyStrong, fontSize: 18, lineHeight: 26, color: colors.ink, marginTop: spacing.xs, marginBottom: spacing.xs },
  body: { ...reportTypography.body, color: colors.inkMuted },
  recordDisclosure: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  recordToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  recordLabel: { ...reportTypography.label, color: colors.inkMuted, flexGrow: 1, flexShrink: 1 },
  recordCount: { ...reportTypography.label, color: colors.inkMuted },
  evidence: { marginTop: 4, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.goldMuted, gap: 3 },
  evidenceLabel: { ...reportTypography.label, color: colors.gold },
  evidenceText: { ...reportTypography.body, fontSize: 14, lineHeight: 22, color: colors.ink },
  takeaway: { marginTop: spacing.md, gap: 6, padding: 14, borderRadius: 12, backgroundColor: colors.panelRaised },
  meaning: { ...reportTypography.body, color: colors.inkMuted },
  actionStack: { gap: 14 },
  action: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel },
  actionMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs, marginBottom: spacing.sm },
  actionPriority: { ...reportTypography.label, color: colors.gold, letterSpacing: 0.8 },
  actionDomain: { ...reportTypography.label, color: colors.inkMuted },
  actionTitle: { ...reportTypography.heading, fontSize: 21, lineHeight: 28, color: colors.ink },
  illustratedHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  stackedHeading: { flexDirection: 'column', alignItems: 'stretch' },
  artTile: { width: 68, height: 68, borderRadius: 18, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  summaryBlocks: { marginTop: 14 },
  reviewSummary: { padding: 16, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  readingBlocks: { gap: 10 },
  readingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  readingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold, marginTop: 9 },
  readingText: { ...reportTypography.body, fontSize: 14, lineHeight: 22, color: colors.inkMuted, flex: 1, minWidth: 0 },
  readingTextEmphasized: { color: colors.ink },
  busyDay: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: colors.bg },
  insetDetail: { gap: 6 },
  planDetail: { marginTop: spacing.md, gap: 6, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.goldMuted },
  planLabel: { ...reportTypography.label, color: colors.gold },
  steps: { marginTop: spacing.md, gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: { ...reportTypography.data, fontSize: 12, color: colors.gold },
  stepBadge: { width: 28, minHeight: 28, paddingVertical: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  stepText: { ...reportTypography.body, color: colors.ink, flex: 1 },
  success: { gap: 10, marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: colors.panelRaised },
  targetHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successLabel: { ...reportTypography.label, color: colors.gold, flex: 1 },
  successText: { ...reportTypography.bodyStrong, color: colors.ink, marginTop: spacing.xs },
  actionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryAction, marginTop: spacing.lg },
  actionButtonSecondary: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.borderStrong },
  actionButtonText: { ...reportTypography.bodyStrong, color: colors.onPrimary, flexShrink: 1 },
  actionButtonTextSecondary: { color: colors.ink },
  disclosures: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
  disclosureButton: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  disclosureTitle: { ...reportTypography.bodyStrong, color: colors.ink },
  disclosureDetail: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted, marginTop: 3 },
  disclosureBody: { paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailGroup: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  detailTitle: { ...reportTypography.bodyStrong, color: colors.ink },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  detailRowLabel: { ...reportTypography.body, fontSize: 14, lineHeight: 21, color: colors.inkMuted, flex: 1 },
  detailRowValue: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 21, color: colors.ink, flex: 1, textAlign: 'right' },
  detailNote: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  bodyMetric: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  limitation: { ...reportTypography.body, fontSize: 14, lineHeight: 22, color: colors.inkMuted },
  source: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sourceText: { ...reportTypography.body, fontSize: 14, lineHeight: 22, color: colors.ink, flex: 1 },
  footer: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: colors.inkMuted, marginTop: spacing.lg, marginBottom: spacing.md },
});
