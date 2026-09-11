import { StableImage } from './StableImage';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { dietCriterionIllustration } from '../utils/dietReportArtwork';
import type { ImageSourcePropType } from 'react-native';
import { getDietScoreArtwork } from '../utils/dietScoreArtwork';
import { ReportIllustration } from './ReportIllustration';

const COMPACT_TITLES: Record<string, string> = {
  foodVariety: 'Food variety',
  plantFoods: 'Plants & fibre',
  proteinCoverage: 'Protein foods',
  mealBalance: 'Meal balance',
  wholeFoodPattern: 'Food preparation',
  goalAlignment: 'Goal fit',
};

export function DietScoreCriterion({ criterionKey, label, definition, value, maxScore, insight, reportKey, dietPreference, compact = false }: {
  criterionKey: string;
  label: string;
  definition: string;
  value: number | null;
  maxScore: number;
  insight: string;
  reportKey: string;
  dietPreference?: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [failedArtwork, setFailedArtwork] = useState<ImageSourcePropType>();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.4;
  const artwork = getDietScoreArtwork(criterionKey, reportKey, dietPreference);
  const size = Math.round((compact ? 56 : 76) * Math.max(1, fontScale));
  const fraction = value !== null && maxScore > 0 ? Math.max(0, Math.min(1, value / maxScore)) : 0;
  const circumference = 2 * Math.PI * 29;
  const arcLength = circumference * 0.75;
  const showDefinition = expanded || value === null;

  const illustration = artwork && failedArtwork !== artwork ? <StableImage onError={() => setFailedArtwork(artwork)} source={artwork} style={[styles.artwork, compact && styles.artworkCompact]} resizeMode="cover" accessible={false} /> : <View style={[styles.artwork, compact && styles.artworkCompact, styles.vectorFrame]}>
    <ReportIllustration kind={dietCriterionIllustration(criterionKey)} size={56} reportKey={reportKey} dietPreference={dietPreference} slot={1} />
  </View>;
  const score = <View style={[styles.score, { width: size, height: size }]} accessible
        accessibilityRole={value === null ? 'text' : 'progressbar'}
        accessibilityLabel={value === null ? `${label}: score unavailable` : `${label}: ${value} out of ${maxScore}`}
        accessibilityValue={value === null ? undefined : { min: 0, max: maxScore, now: value }}>
        <Svg width={size} height={size} viewBox="0 0 72 72" style={styles.ring} accessible={false}>
          <Circle cx={36} cy={36} r={29} fill="none" stroke={colors.border} strokeWidth={4.5}
            strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round" rotation={135} origin="36, 36" />
          {fraction > 0 ? <Circle cx={36} cy={36} r={29} fill="none" stroke={colors.accent} strokeWidth={4.5}
            strokeDasharray={`${arcLength * fraction} ${circumference}`}
            strokeLinecap="round" rotation={135} origin="36, 36" /> : null}
        </Svg>
        <Text style={[styles.value, compact && styles.valueCompact, { top: size * 0.24 }]} accessible={false}>{value === null ? '—' : value}</Text>
        <Text style={[styles.maximum, { bottom: size * 0.04 }]} accessible={false}>of {maxScore}</Text>
      </View>;

  return <View style={[styles.card, compact && styles.cardCompact]} testID="diet-report-score-criterion">
    {compact ? <>
      <View style={styles.visualRow}>{illustration}{score}</View>
      <Text style={[styles.title, styles.titleCompact]} accessibilityRole="header" accessibilityLabel={label}>{COMPACT_TITLES[criterionKey] || label}</Text>
    </> : <View style={[styles.header, stacked && styles.headerStacked]}>
      <View style={[styles.identity, stacked && styles.identityStacked]}>
        {illustration}
        <Text style={styles.title} accessibilityRole="header">{label}</Text>
      </View>
      {score}
    </View>}
    <View style={[styles.body, compact && styles.bodyCompact]}>
      {value !== null && insight ? <Text style={[styles.insight, compact && styles.insightCompact]}>{insight}</Text> : null}
    </View>
    {definition ? <View style={[styles.definitionBlock, compact && styles.definitionBlockCompact]}>
      {value !== null ? <TouchableOpacity onPress={() => setExpanded(current => !current)} style={styles.disclosure}
        accessibilityRole="button" accessibilityLabel={`Scoring criterion: ${label}`} accessibilityState={{ expanded }}>
        <Text style={styles.disclosureLabel}>{expanded ? 'Close details' : 'How scored'}</Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkMuted} accessible={false} />
      </TouchableOpacity> : null}
      {showDefinition ? <Text style={[styles.definition, value !== null && styles.definitionExpanded]}>{definition}</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.panel, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 },
  cardCompact: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 0, borderRadius: 20 },
  visualRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  identityStacked: { flex: 0, alignSelf: 'stretch' },
  artwork: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.panelMuted, flexShrink: 0 },
  artworkCompact: { width: 64, height: 64, borderRadius: 14 },
  vectorFrame: { alignItems: 'center', justifyContent: 'center' },
  title: { ...reportTypography.bodyStrong, fontSize: 15, lineHeight: 22, color: colors.ink, flex: 1, minWidth: 0 },
  titleCompact: { flex: 0, fontSize: 14, lineHeight: 20, marginTop: 14 },
  score: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0 },
  value: { ...reportTypography.bodyStrong, position: 'absolute', fontVariant: ['tabular-nums'], fontSize: 26, lineHeight: 31, fontWeight: '700', color: colors.ink, includeFontPadding: false, textAlign: 'center' },
  valueCompact: { fontSize: 21, lineHeight: 26 },
  maximum: { ...reportTypography.label, position: 'absolute', fontVariant: ['tabular-nums'], fontSize: 9, lineHeight: 13, color: colors.inkMuted, includeFontPadding: false, textAlign: 'center' },
  insight: { ...reportTypography.body, fontSize: 14, lineHeight: 23, color: colors.ink, marginTop: 16 },
  insightCompact: { fontSize: 13, lineHeight: 21, color: colors.inkMuted, marginTop: 8 },
  body: { flexGrow: 1 },
  bodyCompact: { paddingBottom: 14 },
  definitionBlock: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16 },
  definitionBlockCompact: { marginTop: 0 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  disclosureLabel: { ...reportTypography.label, fontSize: 12, lineHeight: 19, color: colors.inkMuted, flexShrink: 1 },
  definition: { ...reportTypography.body, fontSize: 13, lineHeight: 21, color: colors.inkMuted, paddingTop: 12, paddingBottom: 10 },
  definitionExpanded: { paddingTop: 0 },
});
