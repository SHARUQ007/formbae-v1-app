import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Badge } from '../../components/Badge';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { loadWorkoutDayCached } from '../../services/preloadService';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutDayDetail, WorkoutExerciseDetail } from '../../types/api';
import { buildWorkoutSummary, cleanWorkoutNotes } from '../../utils/workoutSummary';
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
  const parts = [
    `${displayValue(exercise.sets, '1')} sets`,
    displayValue(exercise.reps, 'guided reps'),
    `${displayValue(exercise.restSec, '0')}s rest`,
  ];
  return parts.join(' · ');
}

export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const insets = useSafeAreaInsets();
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

  const startWorkout = () => {
    if (!detail) return;
    loadWorkoutDayCached(detail.planDayId, mode).catch(() => undefined);
    navigation.navigate('WorkoutDetail', { planDayId: detail.planDayId, title: detail.focus, mode });
  };

  if (loading) {
    return (
      <ScreenContainer withBottomInset>
        <LoadingState message="Preparing workout summary..." />
      </ScreenContainer>
    );
  }

  if (error || !detail || !summary) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="Workout summary" onBack={() => navigation.goBack()} />
        <ErrorState message={error || 'Workout summary not found'} onRetry={load} />
      </ScreenContainer>
    );
  }

  if (!exercises.length) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="Workout summary" onBack={() => navigation.goBack()} />
        <EmptyState icon="coffee" title="Rest day" message="No movements are scheduled for this day." />
      </ScreenContainer>
    );
  }

  const dayNotes = cleanWorkoutNotes(detail.notes);

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader title={modeLabel(mode)} subtitle={`Day ${detail.dayNumber} - ${detail.focus || detail.planTitle}`} onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 118 }]}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Badge label={mode === 'quick' ? 'Fast track' : 'Full session'} tone="accent" icon={mode === 'quick' ? 'clock' : 'activity'} />
            <Text style={styles.heroDay}>Day {detail.dayNumber}</Text>
          </View>
          <Text style={styles.heroTitle}>{detail.focus || detail.planTitle}</Text>
          <Text style={styles.heroText}>{summary.overview}</Text>
          <View style={styles.estimateGrid}>
            <Metric icon="clock" label="Duration" value={summary.duration} />
            <Metric icon="zap" label="Calories" value={summary.calories} />
            <Metric icon="trending-up" label="Muscle gain" value={summary.muscleGain} />
            <Metric icon="bar-chart-2" label="Intensity" value={summary.intensity} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muscles worked</Text>
          <View style={styles.chips}>
            {summary.muscles.map((muscle) => (
              <View key={muscle} style={styles.muscleChip}>
                <Feather name="target" size={14} color={colors.accentDark} />
                <Text style={styles.muscleText}>{muscle}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why this helps</Text>
          <View style={styles.benefitList}>
            {summary.benefits.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <View style={styles.checkDot}>
                  <Feather name="check" size={13} color={colors.white} />
                </View>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        {dayNotes ? (
          <View style={styles.noteBox}>
            <Feather name="info" size={16} color={colors.accentDark} />
            <Text style={styles.noteText}>{dayNotes}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise flow</Text>
          <View style={styles.exerciseList}>
            {exercises.map((exercise, index) => (
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
          </View>
        </View>
      </ScrollView>

      <View style={[styles.startDock, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TouchableOpacity activeOpacity={0.86} onPress={startWorkout} style={styles.startButton} accessibilityRole="button" accessibilityLabel={`Start ${modeLabel(mode)}`}>
          <View style={styles.startIcon}>
            <Feather name="play" size={26} color={colors.accentDark} />
          </View>
          <Text style={styles.startText}>Start</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Feather name={icon} size={16} color={colors.accentDark} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md },
  hero: {
    borderRadius: 30,
    backgroundColor: colors.accentDarker,
    padding: spacing.lg,
    ...shadows.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroDay: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '800' },
  heroTitle: { ...typography.hero, color: colors.white, marginTop: spacing.md },
  heroText: { ...typography.body, color: colors.onAccentMuted, marginTop: spacing.sm, lineHeight: 24 },
  estimateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  metric: {
    width: '48%',
    minHeight: 104,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  metricLabel: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },
  metricValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  section: {
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muscleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  muscleText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  benefitList: { gap: spacing.sm },
  benefitRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitText: { ...typography.body, color: colors.inkMuted, flex: 1, lineHeight: 23 },
  noteBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.accentLight,
    padding: spacing.md,
  },
  noteText: { ...typography.caption, color: colors.accentDark, flex: 1, lineHeight: 20 },
  exerciseList: { gap: spacing.sm },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  exerciseIndex: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseIndexText: { ...typography.subtitle, color: colors.accentDark },
  exerciseCopy: { flex: 1 },
  exerciseName: { ...typography.bodyBold, color: colors.ink },
  exerciseMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  startDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: spacing.md,
    backgroundColor: 'rgba(248,252,249,0.94)',
  },
  startButton: {
    width: 118,
    height: 118,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 8,
    borderColor: colors.white,
    ...shadows.accent,
  },
  startIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  startText: { ...typography.button, color: colors.white },
});
