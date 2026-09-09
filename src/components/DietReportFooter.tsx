import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';

export function DietReportFooter({ generatedAt, dataSummary, reportKey, onReportIssue }: {
  generatedAt: string;
  dataSummary: boolean;
  reportKey: string;
  onReportIssue: () => void;
}) {
  return <View style={styles.footer} testID="diet-report-footer">
    <View style={styles.credit}>
      <View style={styles.artwork}>
        <ReportIllustration kind="evidence" size={38} reportKey={reportKey} slot={2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.author}>{dataSummary ? 'Diary summary · based on recorded data' : 'Prepared by Ava from your diary'}</Text>
        {generatedAt ? <Text style={styles.date}>{generatedAt}</Text> : null}
      </View>
    </View>
    <TouchableOpacity style={styles.issue} onPress={onReportIssue} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel="Report an issue with this diet report">
      <Feather name="flag" size={15} color={colors.inkMuted} accessible={false} />
      <Text style={styles.issueText}>Report issue</Text>
      <Feather name="arrow-up-right" size={16} color={colors.inkSubtle} accessible={false} />
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 2, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14 },
  artwork: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  author: { ...reportTypography.bodyStrong, fontSize: 13, lineHeight: 20, color: colors.ink },
  date: { ...reportTypography.body, fontSize: 11, lineHeight: 18, color: colors.inkMuted },
  issue: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  issueText: { ...reportTypography.bodyStrong, flex: 1, minWidth: 0, fontSize: 12, lineHeight: 19, color: colors.inkMuted },
});
