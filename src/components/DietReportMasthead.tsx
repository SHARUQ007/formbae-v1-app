import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';

export function DietReportMasthead({ period, reportKey }: { period: string; reportKey: string }) {
  return <View style={styles.row} testID="diet-report-masthead">
    <View style={styles.artwork}>
      <ReportIllustration kind="coverageDays" size={40} reportKey={reportKey} slot={2} />
    </View>
    <View style={styles.copy}>
      <Text style={styles.label}>Weekly nutrition review</Text>
      {period ? <Text style={styles.period}>{period}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.panel },
  artwork: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  label: { ...reportTypography.label, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  period: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 21, color: colors.ink, fontVariant: ['tabular-nums'] },
});
