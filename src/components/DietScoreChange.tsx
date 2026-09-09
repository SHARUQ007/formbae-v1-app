import { colors } from '../theme/colors';
import { StyleSheet, Text, View } from 'react-native';
import type { DietCoachFeedback } from '../services/dietDiaryService';
import { dietScoreComparison } from '../utils/dietScoreComparison';

export function DietScoreChange({ report, history }: { report: DietCoachFeedback; history?: DietCoachFeedback[] }) {
  const comparison = dietScoreComparison(report, history);
  if ('unavailable' in comparison) return <Text style={styles.unavailable}>{comparison.unavailable}</Text>;
  const { previous, change, note } = comparison;
  const label = change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${Math.abs(change)} ${Math.abs(change) === 1 ? 'point' : 'points'}`;
  return <View style={styles.comparison} testID="diet-score-comparison">
    <View style={styles.row}>
      <Text style={[styles.delta, change > 0 && styles.positive, change < 0 && styles.negative]}>{label}</Text>
      <Text style={styles.caption}>vs last report</Text>
    </View>
    <Text style={styles.previous}>Previous score <Text style={styles.previousValue}>{previous}/100</Text></Text>
    {note ? <Text style={styles.note}>{note} · score revision, not weekly progress.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  comparison: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  delta: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.inkMuted, fontVariant: ['tabular-nums'] },
  positive: { color: colors.success },
  negative: { color: colors.error },
  caption: { fontSize: 12, lineHeight: 19, color: colors.inkMuted },
  previous: { fontSize: 12, lineHeight: 19, color: colors.inkMuted },
  previousValue: { fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 19, color: colors.inkMuted },
  unavailable: { marginTop: 14, fontSize: 12, lineHeight: 19, color: colors.inkMuted },
});
