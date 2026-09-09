import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { DietScoreCriterion } from './DietScoreCriterion';

const GAP = 12;
export function getDietScoreColumns(availableWidth: number, fontScale: number): 1 | 2 {
  return availableWidth >= 2 * 152 * Math.max(1, fontScale) + GAP ? 2 : 1;
}

type Criterion = { key: string; label: string; criterion: string; value: number | null; maxScore: number; insight: string };

export function DietScoreGrid({ criteria, reportKey, dietPreference }: {
  criteria: Criterion[];
  reportKey: string;
  dietPreference?: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const availableWidth = measuredWidth ?? Math.max(0, width - 40);
  const columns = getDietScoreColumns(availableWidth, fontScale);
  const cellWidth: `${number}%` = columns === 2 ? `${(availableWidth - GAP) / availableWidth * 50}%` : '100%';
  return <View style={styles.grid} testID="diet-score-grid" onLayout={event => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0) setMeasuredWidth(nextWidth);
  }}>
    {criteria.map(criterion => <View key={criterion.key} style={[styles.cell, { width: cellWidth }]}>
      <DietScoreCriterion criterionKey={criterion.key} label={criterion.label} definition={criterion.criterion}
        value={criterion.value} maxScore={criterion.maxScore} insight={criterion.insight}
        reportKey={reportKey} dietPreference={dietPreference} compact={columns === 2} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'stretch', rowGap: GAP },
  cell: { minWidth: 0 },
});
