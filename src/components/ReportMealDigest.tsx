import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportMealIllustration } from './ReportMealIllustration';

export function ReportMealDigest({ mealType, observed, unit, pattern, reportKey }: {
  mealType: string;
  observed: number | null;
  unit: string;
  pattern: string;
  reportKey: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.4;
  return <View style={styles.card} testID="report-meal-digest">
    <View style={[styles.header, stacked && styles.headerStacked]}>
      <ReportMealIllustration mealType={mealType} reportKey={reportKey} />
      <View style={styles.headingCopy}>
        <Text style={styles.title} accessibilityRole="header">{mealType}</Text>
        <View style={styles.countRow}>
          {observed !== null && observed > 0 ? <Text style={styles.count}>{observed}</Text> : null}
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
    </View>
    {pattern ? <View style={styles.body}>
      <Text style={styles.pattern}>{pattern}</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flexShrink: 1, minWidth: 0 },
  title: { ...reportTypography.bodyStrong, fontSize: 19, lineHeight: 26, color: colors.ink },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, marginTop: 6 },
  count: { ...reportTypography.data, fontSize: 18, lineHeight: 24, color: colors.accent },
  unit: { ...reportTypography.label, fontSize: 12, lineHeight: 19, fontWeight: '400', color: colors.inkMuted, flexShrink: 1 },
  body: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 18, paddingVertical: 16 },
  pattern: { ...reportTypography.body, fontSize: 14, lineHeight: 23, color: colors.ink },
});
