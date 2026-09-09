import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { weeklyReportDate, type WeeklyActivityDay } from '../utils/weeklyReport';
import { ReportIllustration } from './ReportIllustration';

type Metric = 'workouts' | 'foodLogs';
const METRICS = [
  { key: 'workouts' as const, label: 'Training', illustration: 'training' as const },
  { key: 'foodLogs' as const, label: 'Food logs', illustration: 'nutrition' as const },
];

function weekday(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
}

function EntryCount({ day, metric }: { day: WeeklyActivityDay; metric: Metric }) {
  const value = day[metric];
  const active = value !== null && value > 0;
  const label = metric === 'workouts' ? 'Training' : 'Food logs';
  return <View
    accessible
    accessibilityLabel={`${weeklyReportDate(day.date)}, ${label}: ${value === null ? 'detail unavailable' : value === 0 ? 'no saved entry' : `${value} saved ${value === 1 ? 'entry' : 'entries'}`}`}
    style={[styles.entry, active && styles.activeEntry, value === null && styles.unknownEntry]}
  >
    <Text style={[styles.count, active && styles.activeCount]}>{value ?? '—'}</Text>
  </View>;
}

export function WeeklyActivityRecord({ data, reportKey }: { data: WeeklyActivityDay[]; reportKey: string }) {
  const { width, fontScale } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(0);
  const compact = width < 360 || fontScale >= 1.3 || (cardWidth > 0 && cardWidth < 300);
  return <View style={styles.card} onLayout={event => setCardWidth(event.nativeEvent.layout.width)} testID="weekly-activity-record">
    <View style={styles.heading}>
      <ReportIllustration kind="coverageDays" size={42} reportKey={reportKey} />
      <View style={styles.headingCopy}>
        <Text style={styles.title} accessibilityRole="header">The seven-day record</Text>
        <Text style={styles.subtitle}>Your saved activity, day by day</Text>
      </View>
    </View>

    {compact ? <View testID="weekly-activity-day-list">
      <View style={styles.listHeading}>
        <Text style={[styles.dayColumn, styles.label]}>Day</Text>
        {METRICS.map(metric => <View key={metric.key} style={styles.metricColumn}>
          <ReportIllustration kind={metric.illustration} size={28} reportKey={reportKey} />
          <Text style={styles.columnLabel}>{metric.label}</Text>
        </View>)}
      </View>
      {data.map(day => <View key={day.date} style={styles.dayRow}>
        <View style={styles.dayColumn}>
          <Text style={styles.weekday}>{weekday(day.date)}</Text>
          <Text style={styles.listDate}>{Number(day.date.slice(8, 10))}</Text>
        </View>
        {METRICS.map(metric => <View key={metric.key} style={styles.metricColumn}><EntryCount day={day} metric={metric.key} /></View>)}
      </View>)}
    </View> : <View testID="weekly-activity-grid">
      <View style={styles.columns}>
        {data.map(day => <View key={day.date} style={styles.dateColumn}>
          <Text style={styles.weekday}>{weekday(day.date)}</Text>
          <Text style={styles.date}>{Number(day.date.slice(8, 10))}</Text>
        </View>)}
      </View>
      {METRICS.map(metric => <View key={metric.key} style={styles.lane}>
        <View style={styles.laneHeading}>
          <ReportIllustration kind={metric.illustration} size={30} reportKey={reportKey} />
          <Text style={styles.laneLabel}>{metric.label}</Text>
          <View style={styles.laneRule} />
        </View>
        <View style={styles.columns}>
          {data.map(day => <View key={day.date} style={styles.dateColumn}><EntryCount day={day} metric={metric.key} /></View>)}
        </View>
      </View>)}
    </View>}

    <View style={styles.footer}>
      <View style={styles.legend}>
        <View style={styles.legendItem}><Text style={styles.legendSymbol}>0</Text><Text style={styles.legendText}>No saved entry</Text></View>
        <View style={styles.legendItem}><Text style={styles.legendSymbol}>—</Text><Text style={styles.legendText}>Detail unavailable</Text></View>
      </View>
      <Text style={styles.note}>Unlogged food and activity remain unknown.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 20, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.panel },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { ...reportTypography.bodyStrong, fontSize: 17, lineHeight: 24, color: colors.ink },
  subtitle: { ...reportTypography.body, fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 3 },
  columns: { flexDirection: 'row', alignItems: 'stretch', gap: 5 },
  dateColumn: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  weekday: { ...reportTypography.label, fontSize: 10, lineHeight: 16, textAlign: 'center', color: colors.inkMuted },
  date: { ...reportTypography.data, fontSize: 15, lineHeight: 22, textAlign: 'center', color: colors.ink, marginTop: 3 },
  lane: { marginTop: 10 },
  laneHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  laneLabel: { ...reportTypography.label, fontSize: 12, lineHeight: 18, color: colors.ink },
  laneRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 3 },
  entry: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  activeEntry: { borderColor: colors.goldMuted },
  unknownEntry: { backgroundColor: colors.panel, borderStyle: 'dashed' },
  count: { ...reportTypography.data, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  activeCount: { color: colors.gold },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10 },
  dayColumn: { width: 58, minWidth: 0 },
  label: { ...reportTypography.label, color: colors.inkMuted },
  metricColumn: { flex: 1, minWidth: 0, alignItems: 'stretch', gap: 3 },
  columnLabel: { ...reportTypography.label, color: colors.inkMuted },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 8 },
  listDate: { ...reportTypography.data, fontSize: 12, lineHeight: 18, color: colors.ink, textAlign: 'center', marginTop: 2 },
  footer: { marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  legendSymbol: { ...reportTypography.data, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  legendText: { ...reportTypography.body, fontSize: 10, lineHeight: 16, color: colors.inkMuted, flexShrink: 1 },
  note: { ...reportTypography.body, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
});
