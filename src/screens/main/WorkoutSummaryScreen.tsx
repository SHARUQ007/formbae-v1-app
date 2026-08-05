import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Badge } from '../../components/Badge';
import { ScreenHeader } from '../../components/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { loadWorkoutDayCached } from '../../services/preloadService';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutDayDetail, WorkoutExerciseDetail } from '../../types/api';
import { buildWorkoutSummary } from '../../utils/workoutSummary';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSummary'>;

function isSectionMarker(notes: string) {
  return /(?:^|[|\n])\s*Type:\s*Section/i.test(notes || '');
}

function displayValue(value?: string, fallback = '-') {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
}

function modeLabel(mode: 'standard' | 'quick') {
  return mode === 'quick' ? 'Short on time' : "Today's workout";
}

function exerciseMeta(exercise: WorkoutExerciseDetail) {
  const parts = [`${displayValue(exercise.sets, '1')} sets`, displayValue(exercise.reps, 'guided reps')];
  return parts.join(' · ');
}

export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, spacing.sm);
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadWorkoutDayCached(planDayId, mode);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout summary');
    } finally {
      setLoading(false);
    }
  }, [mode, planDayId]);

  useEffect(() => {
    load();
  }, [load]);

  const exercises = useMemo(
    () => (detail?.exercises ?? []).filter((exercise) => !isSectionMarker(exercise.notes)),
    [detail?.exercises],
  );
  const summary = useMemo(
    () => (detail ? buildWorkoutSummary({ ...detail, exercises }) : null),
    [detail, exercises],
  );
  const canStartWorkout = Boolean(!loading && !error && detail && summary && exercises.length);
  const headerSubtitle = detail
    ? `Day ${detail.dayNumber} - ${detail.focus || detail.planTitle}`
    : route.params.title
      ? `Day workout - ${route.params.title}`
      : undefined;
  const startLabel = loading
    ? 'Preparing...'
    : error || !detail || !summary
      ? 'Workout unavailable'
      : !exercises.length
        ? 'Rest day'
        : 'Start workout';

  const startWorkout = () => {
    if (!canStartWorkout || !detail) return;
    loadWorkoutDayCached(detail.planDayId, mode).catch(() => undefined);
    navigation.navigate('WorkoutDetail', { planDayId: detail.planDayId, title: detail.focus, mode });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScreenHeader title={modeLabel(mode)} subtitle={headerSubtitle} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {loading ? (
          <View style={styles.statePanel}>
            <LoadingState message="Preparing workout summary..." />
          </View>
        ) : error || !detail || !summary ? (
          <View style={styles.statePanel}>
            <ErrorState message={error || 'Workout summary not found'} onRetry={load} />
          </View>
        ) : !exercises.length ? (
          <View style={styles.statePanel}>
            <EmptyState icon="coffee" title="Rest day" message="No movements are scheduled for this day." />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroCopy}>
                  <Badge label={mode === 'quick' ? 'Quick' : 'Full'} tone="accent" icon={mode === 'quick' ? 'clock' : 'activity'} />
                  <Text style={styles.heroTitle}>{detail.focus || detail.planTitle}</Text>
                  <Text style={styles.heroSubline}>{exercises.length} moves · {summary.intensity}</Text>
                </View>
                <View style={styles.heroGraphic}>
                  <View style={styles.graphicRing}>
                    <MaterialCommunityIcon name={mode === 'quick' ? 'run' : 'weight-lifter'} size={46} color={colors.white} />
                  </View>
                </View>
              </View>
              <View style={styles.metricStrip}>
                <Metric icon="timer-outline" label="Time" value={summary.duration} />
                <Metric icon="fire" label="Burn" value={summary.calories} />
              </View>
            </View>

            <View style={styles.cardSection}>
              <View style={styles.sectionHead}>
                <MaterialCommunityIcon name="arm-flex" size={20} color={colors.accentDark} />
                <Text style={styles.sectionTitle}>Muscles</Text>
              </View>
              <View style={styles.chips}>
                {summary.muscles.slice(0, 5).map((muscle) => (
                  <View key={muscle} style={styles.muscleChip}>
                    <Text style={styles.muscleText}>{muscle}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.cardSection}>
              <View style={styles.sectionHead}>
                <MaterialCommunityIcon name="chart-line" size={20} color={colors.accentDark} />
                <Text style={styles.sectionTitle}>Why it matters</Text>
              </View>
              <View style={styles.benefitList}>
                {summary.benefits.slice(0, 2).map((benefit) => (
                  <View key={benefit} style={styles.benefitRow}>
                    <View style={styles.checkDot}>
                      <Feather name="check" size={13} color={colors.white} />
                    </View>
                    <Text style={styles.benefitText}>{benefit}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.cardSection}>
              <View style={styles.sectionHead}>
                <MaterialCommunityIcon name="dumbbell" size={20} color={colors.accentDark} />
                <Text style={styles.sectionTitle}>Plan preview</Text>
                <Text style={styles.exerciseCount}>{exercises.length} moves</Text>
              </View>
              <View style={styles.exerciseList}>
                {exercises.slice(0, 5).map((exercise, index) => (
                  <View key={`${exercise.exerciseId}-${index}`} style={styles.exerciseRow}>
                    <View style={styles.exerciseIndex}>
                      <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.exerciseCopy}>
                      <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                      <Text style={styles.exerciseMeta}>{exerciseMeta(exercise)}</Text>
                    </View>
                  </View>
                ))}
                {exercises.length > 5 ? <Text style={styles.moreExercises}>+ {exercises.length - 5} more inside the workout</Text> : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.startDock, { paddingBottom: bottomInset }]}>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={startWorkout}
          disabled={!canStartWorkout}
          style={[styles.startButton, !canStartWorkout && styles.startButtonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStartWorkout }}
          accessibilityLabel={startLabel}
        >
          <View style={styles.startIcon}>
            <Feather name={loading ? 'loader' : 'play'} size={24} color={colors.accentDark} />
          </View>
          <Text style={styles.startText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{startLabel}</Text>
          {canStartWorkout ? <Feather name="arrow-right" size={22} color={colors.white} /> : <View style={styles.startSpacer} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcon name={icon} size={20} color={colors.accentDark} />
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, gap: spacing.sm, paddingBottom: spacing.md },
  statePanel: {
    flexGrow: 1,
    minHeight: 420,
    borderRadius: 28,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: {
    borderRadius: 28,
    backgroundColor: colors.accentDarker,
    padding: spacing.lg,
    ...shadows.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heroCopy: { flex: 1 },
  heroTitle: { fontSize: 21, lineHeight: 26, fontWeight: '800', color: colors.white, marginTop: spacing.sm },
  heroSubline: { ...typography.bodyBold, color: colors.onAccentMuted, marginTop: spacing.xs },
  heroGraphic: {
    width: 104,
    height: 104,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  graphicRing: {
    width: 78,
    height: 78,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  metricStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  metric: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '800', textTransform: 'uppercase' },
  metricValue: { fontSize: 14, lineHeight: 17, color: colors.ink, marginTop: 1, fontWeight: '800' },
  cardSection: {
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muscleChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  muscleText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  benefitList: { gap: spacing.xs },
  benefitRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitText: { ...typography.body, color: colors.inkMuted, flex: 1, lineHeight: 22 },
  exerciseCount: { ...typography.caption, color: colors.inkSubtle, fontWeight: '800' },
  exerciseList: { gap: spacing.xs },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  exerciseIndex: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseIndexText: { ...typography.bodyBold, color: colors.accentDark },
  exerciseCopy: { flex: 1 },
  exerciseName: { ...typography.subtitle, color: colors.ink, lineHeight: 22 },
  exerciseMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  moreExercises: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.xs },
  startDock: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(248,252,249,0.97)',
  },
  startButton: {
    width: '100%',
    height: 84,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.white,
    ...shadows.accent,
  },
  startButtonDisabled: {
    backgroundColor: colors.accentDark,
    opacity: 0.72,
  },
  startIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startText: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: colors.white },
  startSpacer: {
    width: 22,
    height: 22,
  },
});
