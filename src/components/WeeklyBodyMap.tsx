import { StyleSheet, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import type { BodyGender, BodyMuscle } from '../utils/weeklyMuscles';

type Props = {
  gender: BodyGender;
  muscles: BodyMuscle[];
  compact?: boolean;
  mini?: boolean;
  showLabels?: boolean;
};

const ALL_PARTS: Slug[] = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hamstring',
  'hands',
  'hair',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
];

const MUSCLE_PARTS: Record<BodyMuscle, Slug[]> = {
  Chest: ['chest'],
  Shoulders: ['deltoids'],
  Back: ['trapezius', 'upper-back', 'lower-back'],
  Biceps: ['biceps'],
  Triceps: ['triceps'],
  Core: ['abs', 'obliques'],
  Glutes: ['gluteal'],
  Quads: ['quadriceps'],
  Hamstrings: ['hamstring'],
  Calves: ['calves'],
};

function bodyData(muscles: BodyMuscle[]): ExtendedBodyPart[] {
  const active = new Set(muscles.flatMap((muscle) => MUSCLE_PARTS[muscle]));
  return ALL_PARTS.map((slug) => ({
    slug,
    styles: {
      fill: active.has(slug) ? colors.gold : '#34353c',
      stroke: active.has(slug) ? '#ffebae' : '#17181d',
      strokeWidth: active.has(slug) ? 1.8 : 1.15,
    },
  }));
}

function AnatomicalFigure({
  gender,
  side,
  data,
  compact,
  mini,
  showLabels,
}: {
  gender: 'male' | 'female';
  side: 'front' | 'back';
  data: ExtendedBodyPart[];
  compact: boolean;
  mini: boolean;
  showLabels: boolean;
}) {
  return (
    <View style={styles.figure}>
      <View pointerEvents="none" style={[styles.bodyCanvas, compact && styles.bodyCanvasCompact, mini && styles.bodyCanvasMini]}>
        <Body
          data={data}
          gender={gender}
          side={side}
          scale={mini ? 0.29 : compact ? 0.45 : 0.53}
          border={colors.borderStrong}
          defaultFill="#34353c"
          defaultStroke="#17181d"
          defaultStrokeWidth={1.15}
        />
      </View>
      {showLabels ? <Text style={styles.figureLabel}>{side === 'front' ? 'Front' : 'Back'}</Text> : null}
    </View>
  );
}

export function WeeklyBodyMap({ gender, muscles, compact = false, mini = false, showLabels = true }: Props) {
  const modelGender = gender === 'female' ? 'female' : 'male';
  const data = bodyData(muscles);

  return (
    <View style={[styles.map, compact && styles.mapCompact, mini && styles.mapMini]}>
      <AnatomicalFigure gender={modelGender} side="front" data={data} compact={compact} mini={mini} showLabels={showLabels} />
      <View style={[styles.divider, compact && styles.dividerCompact, mini && styles.dividerMini]} />
      <AnatomicalFigure gender={modelGender} side="back" data={data} compact={compact} mini={mini} showLabels={showLabels} />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    minHeight: 244,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
  },
  mapCompact: { minHeight: 204, paddingTop: spacing.sm },
  mapMini: { minHeight: 116, paddingTop: 0 },
  figure: { flex: 1, alignItems: 'center' },
  bodyCanvas: { height: 212, alignItems: 'center', justifyContent: 'center' },
  bodyCanvasCompact: { height: 176 },
  bodyCanvasMini: { height: 112 },
  figureLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
  divider: { width: 1, height: 178, backgroundColor: colors.border },
  dividerCompact: { height: 146 },
  dividerMini: { height: 92 },
});
