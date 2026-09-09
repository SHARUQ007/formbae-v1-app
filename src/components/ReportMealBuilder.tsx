import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';

export function ReportMealBuilder({ title, rows, reportKey }: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  reportKey: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.4;
  return <View style={styles.card} testID="report-meal-builder">
    <View style={[styles.header, compact && styles.headerStacked]}>
      <ReportIllustration kind="mealFormula" size={80} reportKey={reportKey} />
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>YOUR MEAL IDEA</Text>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
      </View>
    </View>
    <View style={styles.ingredients}>
      {rows.map((row, index) => <View key={row.label} style={[styles.row, index > 0 && styles.rowDivider]}>
        <Text style={styles.index} accessible={false}>{String(index + 1).padStart(2, '0')}</Text>
        <View style={styles.rowCopy}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flexShrink: 1, minWidth: 0 },
  eyebrow: { ...reportTypography.label, fontSize: 10, letterSpacing: 1.2, color: colors.accent, marginBottom: 6 },
  title: { ...reportTypography.bodyStrong, fontSize: 18, lineHeight: 25, color: colors.ink },
  ingredients: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  index: { ...reportTypography.data, fontSize: 11, lineHeight: 18, color: colors.inkSubtle, paddingTop: 1 },
  rowCopy: { flex: 1, minWidth: 0 },
  label: { ...reportTypography.label, color: colors.inkMuted, marginBottom: 5 },
  value: { ...reportTypography.body, fontSize: 15, lineHeight: 23, color: colors.ink },
});
