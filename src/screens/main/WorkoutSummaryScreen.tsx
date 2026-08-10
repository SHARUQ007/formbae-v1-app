import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Badge } from '../../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import { WorkoutScreenHeader } from '../../features/workout/components/WorkoutScreenHeader';
import { loadWorkoutDayCached } from '../../services/preloadService';
import { loadWorkoutProgress, saveWorkoutProgress } from '../../store/workoutStore';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutDayDetail, WorkoutExerciseAlternative, WorkoutExerciseDetail } from '../../types/api';
import { buildWorkoutSummary } from '../../utils/workoutSummary';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
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

function exerciseWithAlternate(exercise: WorkoutExerciseDetail, selectedIndex?: number): WorkoutExerciseDetail {
  const alternate = selectedIndex !== undefined && selectedIndex >= 0 ? exercise.alternatives?.[selectedIndex] : null;
  if (!alternate) return exercise;
  return {
    ...exercise,
    exerciseName: alternate.exerciseName || exercise.exerciseName,
    sets: alternate.sets || exercise.sets,
    reps: alternate.reps || exercise.reps,
    restSec: alternate.restSec || exercise.restSec,
    notes: alternate.notes || exercise.notes,
    videoUrl: alternate.videoUrl || exercise.videoUrl,
  };
}

const CTA_BASE_HEIGHT = 158;

export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard', initialDetail } = route.params;
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, spacing.sm);
  const ctaSpace = CTA_BASE_HEIGHT + bottomInset;
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(initialDetail || null);
  const [selectedAlternates, setSelectedAlternates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!initialDetail);
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
    if (initialDetail?.planDayId === planDayId) return;
    load();
  }, [initialDetail?.planDayId, load, planDayId]);

  useEffect(() => {
    loadWorkoutProgress(planDayId)
      .then((progress) => setSelectedAlternates(progress.selectedAlternatesByExercise || {}))
      .catch(() => undefined);
  }, [planDayId]);

  const exercises = useMemo(
    () => (detail?.exercises ?? []).filter((exercise) => !isSectionMarker(exercise.notes)),
    [detail?.exercises],
  );
  const summary = useMemo(
    () => (detail ? buildWorkoutSummary(detail) : null),
    [detail],
  );
  const canStartWorkout = Boolean(!loading && !error && detail && exercises.length);
  const headerSubtitle = detail
    ? `Day ${detail.dayNumber} - ${detail.focus || detail.planTitle}`
    : route.params.title
      ? `Day workout - ${route.params.title}`
      : undefined;
  const startWorkout = () => {
    if (!canStartWorkout || !detail) return;
    navigation.navigate('WorkoutDetail', {
      planDayId: detail.planDayId,
      title: detail.focus,
      mode,
      initialDetail: detail,
    });
  };

  const selectAlternate = async (exercise: WorkoutExerciseDetail, index: number | null) => {
    const next = { ...selectedAlternates };
    if (index === null) {
      delete next[exercise.exerciseId];
    } else {
      next[exercise.exerciseId] = index;
    }
    setSelectedAlternates(next);
    const progress = await loadWorkoutProgress(planDayId);
    await saveWorkoutProgress({
      ...progress,
      planDayId,
      selectedAlternatesByExercise: next,
      updatedAt: new Date().toISOString(),
    });
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centerStateRoot, { paddingTop: insets.top + spacing.md, paddingBottom: bottomInset + spacing.lg }]}>
        <LoadingState message="Preparing workout summary..." />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <WorkoutScreenHeader eyebrow={mode === 'quick' ? 'Short on time' : 'Your session'} title={modeLabel(mode)} subtitle={headerSubtitle} onBack={() => navigation.goBack()} largeText />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: ctaSpace }]}
      >
        {error || !detail ? (
          <View style={styles.statePanel}>
            <ErrorState message={error || 'Workout summary not found'} onRetry={load} />
          </View>
        ) : !exercises.length ? (
          <View style={styles.statePanel}>
            <EmptyState icon="coffee" title="Rest day" message="No movements are scheduled for this day." />
          </View>
        ) : !summary ? (
          <View style={styles.statePanel}>
            <EmptyState
              icon="cpu"
              title="AI analysis unavailable"
              message="Your trainer needs to re-save this plan before personalized workout insights can be shown. You can still start the workout."
            />
          </View>
        ) : (
          <>
            <View style={styles.summarySurface}>
              <View style={styles.heroTop}>
                <View style={styles.heroCopy}>
                  <Badge label={mode === 'quick' ? 'Quick' : 'Full'} tone="accent" icon={mode === 'quick' ? 'clock' : 'activity'} />
                  <Text style={styles.heroTitle}>{detail.focus || detail.planTitle}</Text>
                  <Text style={styles.heroSubline}>{exercises.length} moves · {summary.intensity}</Text>
                </View>
              </View>
              <View style={styles.metricStrip}>
                <Metric icon="timer-outline" label="Time" value={summary.duration} />
                <View style={styles.metricDivider} />
                <Metric icon="fire" label="Burn" value={summary.calories} />
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.insightBlock}>
                <Text style={styles.insightLabel}>Target areas</Text>
                <View style={styles.chips}>
                  {summary.muscles.slice(0, 5).map((muscle) => (
                    <View key={muscle} style={styles.muscleChip}>
                      <Text style={styles.muscleText}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.insightBlock}>
                <Text style={styles.insightLabel}>Why this session</Text>
                <View style={styles.benefitList}>
                  {summary.benefits.slice(0, 2).map((benefit) => (
                    <View key={benefit} style={styles.benefitRow}>
                      <View style={styles.checkDot}><Feather name="check" size={12} color={colors.goldMuted} /></View>
                      <Text style={styles.benefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.planSection}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planEyebrow}>Session flow</Text>
                  <Text style={styles.planTitle}>Movement plan</Text>
                </View>
                <Text style={styles.exerciseCount}>{exercises.length} moves</Text>
              </View>
              <View style={styles.exerciseList}>
                {exercises.map((exercise, index) => {
                  const activeChoice = exerciseWithAlternate(exercise, selectedAlternates[exercise.exerciseId]);
                  return (
                  <View
                    key={`${exercise.exerciseId}-${index}`}
                    style={[
                      styles.exerciseRow,
                      index === exercises.length - 1 && styles.exerciseRowLast,
                    ]}
                  >
                    <View style={styles.exerciseIndex}>
                      <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.exerciseCopy}>
                      <Text style={styles.exerciseName}>{activeChoice.exerciseName}</Text>
                      <Text style={styles.exerciseMeta}>{exerciseMeta(activeChoice)}</Text>
                      <AlternateCarousel
                        exercise={exercise}
                        selectedIndex={selectedAlternates[exercise.exerciseId]}
                        onSelect={(nextIndex) => selectAlternate(exercise, nextIndex)}
                      />
                    </View>
                  </View>
                );})}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {canStartWorkout ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.fixedCtaLayer,
            { height: CTA_BASE_HEIGHT + bottomInset, paddingBottom: bottomInset },
          ]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(5,6,10,0)', 'rgba(5,6,10,0.94)', colors.bg]}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <WorkoutPrimaryCTA
            title="Start workout"
            subtitle={`${exercises.length} movements · ${summary?.duration || 'Ready when you are'}`}
            icon="play"
            onPress={startWorkout}
            large
            style={styles.startWorkoutCta}
          />
        </View>
      ) : null}
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

function AlternateCarousel({
  exercise,
  selectedIndex,
  onSelect,
}: {
  exercise: WorkoutExerciseDetail;
  selectedIndex?: number;
  onSelect: (index: number | null) => void;
}) {
  const alternatives = exercise.alternatives?.filter((alternate: WorkoutExerciseAlternative) => alternate.exerciseName?.trim()).slice(0, 3) || [];
  if (!alternatives.length) return null;
  const choices: Array<{ label: string; index: number | null }> = [
    { label: 'Original', index: null },
    ...alternatives.map((alternate, index) => ({ label: alternate.exerciseName, index })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.alternateRail}
    >
      {choices.map((choice) => {
        const active = choice.index === null ? selectedIndex === undefined : selectedIndex === choice.index;
        return (
          <TouchableOpacity
            key={`${choice.index ?? 'original'}-${choice.label}`}
            activeOpacity={0.86}
            onPress={() => onSelect(choice.index)}
            style={[styles.alternateChip, active && styles.alternateChipActive]}
          >
            <Feather name={active ? 'check' : 'repeat'} size={12} color={active ? colors.white : colors.inkMuted} />
            <Text style={[styles.alternateChipText, active && styles.alternateChipTextActive]}>{choice.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  centerStateRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, gap: spacing.md, paddingTop: spacing.md },
  statePanel: {
    flexGrow: 1,
    minHeight: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  summarySurface: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
  heroCopy: { flex: 1 },
  heroTitle: { fontSize: 26, lineHeight: 33, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  heroSubline: { fontSize: 17, lineHeight: 25, fontWeight: '400', color: colors.inkMuted, marginTop: spacing.xs },
  metricStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    paddingVertical: spacing.sm,
  },
  metric: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.inkMuted, textTransform: 'uppercase' },
  metricValue: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink, marginTop: 1 },
  summaryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.lg },
  insightBlock: { gap: spacing.sm, marginBottom: spacing.md },
  insightLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.inkSubtle, textTransform: 'uppercase' },
  planSection: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  planHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  planEyebrow: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.accentDark, textTransform: 'uppercase' },
  planTitle: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muscleChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  muscleText: { fontSize: 14, lineHeight: 19, color: colors.ink, fontWeight: '700' },
  benefitList: { gap: spacing.xs },
  benefitRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitText: { fontSize: 17, lineHeight: 25, fontWeight: '400', color: colors.inkMuted, flex: 1 },
  exerciseCount: { fontSize: 14, lineHeight: 20, color: colors.inkSubtle, fontWeight: '800' },
  exerciseList: {},
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 18,
  },
  exerciseRowLast: { borderBottomWidth: 0 },
  exerciseIndex: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  exerciseIndexText: { fontSize: 14, lineHeight: 19, color: colors.accentDark, fontWeight: '800' },
  exerciseCopy: { flex: 1 },
  exerciseName: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  exerciseMeta: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: colors.inkMuted, marginTop: 3 },
  alternateRail: { gap: spacing.xs, paddingTop: spacing.sm, paddingRight: spacing.sm },
  alternateChip: {
    maxWidth: 280,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  alternateChipActive: {
    backgroundColor: colors.accentFill,
    borderColor: colors.goldMuted,
  },
  alternateChipText: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, fontWeight: '700', maxWidth: 230, flexShrink: 1 },
  alternateChipTextActive: { color: colors.white },
  fixedCtaLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    justifyContent: 'flex-end',
    zIndex: 50,
    elevation: 20,
    overflow: 'visible',
  },
  startWorkoutCta: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
});
