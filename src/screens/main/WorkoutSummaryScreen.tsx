import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

const CTA_BASE_HEIGHT = 118;

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
    () => (detail ? buildWorkoutSummary({ ...detail, exercises }) : null),
    [detail, exercises],
  );
  const canStartWorkout = Boolean(!loading && !error && detail && summary && exercises.length);
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
      <WorkoutScreenHeader eyebrow={mode === 'quick' ? 'Short on time' : 'Your session'} title={modeLabel(mode)} subtitle={headerSubtitle} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: ctaSpace }]}
      >
        {error || !detail || !summary ? (
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
                {exercises.slice(0, 5).map((exercise, index) => {
                  const activeChoice = exerciseWithAlternate(exercise, selectedAlternates[exercise.exerciseId]);
                  return (
                  <View key={`${exercise.exerciseId}-${index}`} style={styles.exerciseRow}>
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
                {exercises.length > 5 ? <Text style={styles.moreExercises}>+ {exercises.length - 5} more inside the workout</Text> : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {canStartWorkout ? (
        <View pointerEvents="box-none" style={[styles.fixedCtaLayer, { paddingBottom: bottomInset }]}>
          <WorkoutPrimaryCTA
            title="Start workout"
            subtitle={`${exercises.length} movements · ${summary?.duration || 'Ready when you are'}`}
            icon="play"
            onPress={startWorkout}
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
  if (!alternatives.length) {
    return (
      <View style={styles.alternateEmpty}>
        <Feather name="repeat" size={13} color={colors.inkMuted} />
        <Text style={styles.alternateEmptyText}>Alternates will appear on newly built plans</Text>
      </View>
    );
  }
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
            <Text style={[styles.alternateChipText, active && styles.alternateChipTextActive]} numberOfLines={1}>{choice.label}</Text>
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
  scroll: { flexGrow: 1, gap: spacing.sm },
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
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.white, marginTop: spacing.sm },
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
  metricLabel: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase' },
  metricValue: { ...typography.label, color: colors.ink, marginTop: 1 },
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
  alternateRail: { gap: spacing.xs, paddingTop: spacing.sm, paddingRight: spacing.sm },
  alternateChip: {
    maxWidth: 180,
    minHeight: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  alternateChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  alternateChipText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', maxWidth: 138 },
  alternateChipTextActive: { color: colors.white },
  alternateEmpty: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  alternateEmptyText: { ...typography.caption, color: colors.inkMuted },
  moreExercises: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.xs },
  fixedCtaLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: CTA_BASE_HEIGHT,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: 'rgba(247,250,247,0.98)',
  },
});
