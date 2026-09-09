import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';

export function FoodDiaryOverview({ entries, meals, days, reportStatus, onReport, onLog, empty = false }: {
  entries: number; meals: number; days: number; reportStatus: string; onReport: () => void; onLog: () => void; empty?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const [imageFailed, setImageFailed] = useState(false);
  const stats: { label: string; value: number; kind: ReportIllustrationKind }[] = [
    { label: 'Entries', value: entries, kind: 'diaryCapture' },
    { label: 'Meals logged', value: meals, kind: 'coverageMeals' },
    { label: 'Days logged', value: days, kind: 'coverageDays' },
  ];
  return <View style={styles.overview}>
    <View style={[styles.heading, compact && styles.headingStacked]}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>{empty ? 'YOUR FOOD DIARY' : 'THIS WEEK'}</Text>
        <Text style={styles.title} accessibilityRole="header">{empty ? 'Start with one meal.' : 'Your week in meals.'}</Text>
      </View>
      {imageFailed ? <ReportIllustration kind="diaryCapture" size={80} slot={1} /> : <Image source={require('../assets/editorial/diary/meal-journal.jpg')} style={styles.hero} resizeMode="cover" onError={() => setImageFailed(true)} accessible={false} />}
    </View>
    {empty ? <Text style={styles.emptyCopy}>A photo or a few words is enough to start your diary.</Text> : <View style={[styles.stats, compact && styles.statsStacked]}>
      {stats.map((stat, index) => <View key={stat.label} style={[styles.stat, compact && styles.statCompact]} accessible accessibilityLabel={`${stat.value} ${stat.label.toLowerCase()} this week`}>
        <ReportIllustration kind={stat.kind} size={32} slot={index} />
        <Text style={styles.value}>{stat.value}{stat.kind === 'coverageDays' ? <Text style={styles.maximum}> /7</Text> : null}</Text>
        <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>{stat.label}</Text>
      </View>)}
    </View>}
    <View style={[styles.actions, compact && styles.actionsStacked]}>
      <TouchableOpacity style={[styles.action, compact && styles.actionCompact]} onPress={onLog} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Log a meal with Food Memory">
        <View style={styles.actionHeading}><ReportIllustration kind="diaryCapture" size={32} slot={2} /><Feather name="plus" size={17} color={colors.accent} accessible={false} /></View>
        <Text style={styles.actionTitle}>Log a meal</Text><Text style={styles.actionMeta}>Add a food memory</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.action, compact && styles.actionCompact]} onPress={onReport} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel={`Open diet report. ${reportStatus}`}>
        <View style={styles.actionHeading}><ReportIllustration kind="reportReview" size={32} slot={1} /><Feather name="arrow-up-right" size={17} color={colors.inkMuted} accessible={false} /></View>
        <Text style={styles.actionTitle}>Diet report</Text><Text style={styles.actionMeta}>{reportStatus}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overview: { marginBottom: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headingStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  headingCopy: { flex: 1, minWidth: 0, gap: 6 },
  eyebrow: { ...reportTypography.label, fontSize: 9, lineHeight: 15, letterSpacing: 1, color: colors.accent },
  title: { ...typography.title, fontSize: 22, lineHeight: 29, color: colors.ink },
  hero: { width: 118, height: 80, borderRadius: 16, flexShrink: 0, backgroundColor: colors.panel },
  stats: { flexDirection: 'row', gap: 8 },
  statsStacked: { flexDirection: 'column' },
  stat: { flex: 1, minWidth: 0, padding: 12, borderRadius: 16, backgroundColor: colors.panel, gap: 6 },
  statCompact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { ...reportTypography.bodyStrong, fontSize: 23, lineHeight: 29, fontVariant: ['tabular-nums'], color: colors.ink },
  maximum: { fontSize: 11, color: colors.inkSubtle },
  statLabel: { ...reportTypography.body, fontSize: 10, lineHeight: 16, color: colors.inkMuted },
  statLabelCompact: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionsStacked: { flexDirection: 'column' },
  action: { flex: 1, minWidth: 0, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  actionCompact: { flex: 0 },
  actionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  actionTitle: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 22, color: colors.ink },
  actionMeta: { ...reportTypography.body, fontSize: 11, lineHeight: 18, color: colors.inkMuted, marginTop: 2 },
  emptyCopy: { ...reportTypography.body, fontSize: 14, lineHeight: 22, color: colors.inkMuted, marginBottom: 12 },
});
