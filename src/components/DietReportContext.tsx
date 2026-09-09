import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';

export function DietReportContext({ goal, training, workoutsCompleted, reportKey }: {
  goal: string;
  training: string;
  workoutsCompleted: number | null;
  reportKey: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 340 || fontScale >= 1.4;
  if (!goal && !training) return null;
  return <View style={[styles.grid, stacked && styles.stacked]} testID="diet-report-context">
    {goal ? <View style={[styles.card, stacked && styles.cardStacked]}>
      <View style={styles.heading}>
        <ReportIllustration kind="reportPlan" size={52} reportKey={reportKey} slot={2} />
        <Text style={[styles.title, { minHeight: stacked ? undefined : 44 * fontScale }]} accessibilityRole="header">Your goal</Text>
      </View>
      <Text style={styles.body}>{goal}</Text>
    </View> : null}
    {training ? <View style={[styles.card, stacked && styles.cardStacked]}>
      <View style={styles.heading}>
        <ReportIllustration kind="training" size={52} reportKey={reportKey} slot={2} />
        <Text style={[styles.title, { minHeight: stacked ? undefined : 44 * fontScale }]} accessibilityRole="header">Training nutrition</Text>
      </View>
      <Text style={styles.body}>{training}</Text>
      {workoutsCompleted !== null ? <View style={styles.footer}>
        <Text style={[styles.count, workoutsCompleted === 0 && styles.countMuted]}>{workoutsCompleted}</Text>
        <Text style={styles.countLabel}>linked workout{workoutsCompleted === 1 ? '' : 's'}</Text>
      </View> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', alignItems: 'stretch', gap: 12, marginTop: 24 },
  stacked: { flexDirection: 'column' },
  card: { flexGrow: 1, flexBasis: 0, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.panel, padding: 14 },
  cardStacked: { flexGrow: 0, flexBasis: 'auto' },
  heading: { alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { ...reportTypography.bodyStrong, fontSize: 15, lineHeight: 22, color: colors.ink },
  body: { ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.inkMuted, flexGrow: 1 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 16 },
  count: { ...reportTypography.data, fontSize: 17, lineHeight: 23, color: colors.accent },
  countMuted: { color: colors.inkMuted },
  countLabel: { ...reportTypography.label, fontSize: 10, lineHeight: 16, color: colors.inkMuted, flexShrink: 1 },
});
