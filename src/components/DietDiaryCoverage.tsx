import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';

export function DietDiaryCoverage({ days, meals, countsMealMoments, limited, note, dataSummary, reportKey }: {
  days: number | null;
  meals: number | null;
  countsMealMoments: boolean;
  limited: boolean;
  note: string;
  dataSummary: boolean;
  reportKey: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  const metrics = [
    { value: days, label: days === 1 ? 'day with detail' : 'days with detail', art: 'coverageDays' as const },
    { value: meals, label: countsMealMoments ? (meals === 1 ? 'described meal' : 'described meals') : (meals === 1 ? 'food description' : 'food descriptions'), art: 'coverageMeals' as const },
  ].filter(metric => metric.value !== null);

  return <View style={styles.card} testID="diet-report-diary-coverage">
    <View style={styles.heading}>
      <Text style={styles.title} accessibilityRole="header">Diary coverage</Text>
      {limited ? <Text style={styles.badge}>Limited evidence</Text> : null}
    </View>
    {metrics.length ? <View style={[styles.metrics, stacked && styles.stacked]}>
      {metrics.map(metric => <View key={metric.art} style={[styles.metric, stacked && styles.metricStacked]}
        accessible accessibilityLabel={`${metric.value} ${metric.label}`}>
        <View style={[styles.visual, stacked && styles.visualStacked]}>
          <ReportIllustration kind={metric.art} size={52} reportKey={reportKey} />
          <Text style={styles.value}>{metric.value}</Text>
        </View>
        <Text style={[styles.label, stacked && styles.labelStacked]}>{metric.label}</Text>
      </View>)}
    </View> : null}
    <View style={styles.note}>
      <Text style={styles.noteText}>{note}</Text>
      {dataSummary ? <Text style={styles.noteText}>Personalised analysis is temporarily unavailable; this review uses saved diary data.</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 16, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...reportTypography.bodyStrong, fontSize: 17, lineHeight: 24, color: colors.ink },
  badge: { ...reportTypography.label, fontSize: 10, lineHeight: 16, color: colors.inkMuted, backgroundColor: colors.panelRaised, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stacked: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 0, backgroundColor: colors.panelMuted, borderRadius: 16, padding: 12 },
  metricStacked: { flex: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  visual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  visualStacked: { justifyContent: 'flex-start', gap: 10 },
  value: { ...reportTypography.dataLarge, fontSize: 30, lineHeight: 38, color: colors.ink },
  label: { ...reportTypography.body, fontSize: 12, lineHeight: 19, color: colors.inkMuted, marginTop: 10 },
  labelStacked: { flex: 1, minWidth: 0, marginTop: 0 },
  note: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  noteText: { ...reportTypography.body, fontSize: 12, lineHeight: 20, color: colors.inkMuted },
});
