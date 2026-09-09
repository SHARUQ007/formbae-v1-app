import { formatWorkoutTitle } from '../../utils/workoutTitle';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { WorkoutOverviewArt } from '../../features/workout/components/WorkoutOverviewArt';
import { useProfileBodyGender } from '../../hooks/useProfileBodyGender';
import { deriveWorkoutMuscles } from '../../utils/weeklyMuscles';
import { workoutOverviewVisuals } from '../../utils/workoutOverviewVisuals';
import { useDailyReadingDate } from '../../hooks/useDailyReadingDate';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import { WorkoutScreenHeader } from '../../features/workout/components/WorkoutScreenHeader';
import { loadWorkoutDayCached } from '../../services/preloadService';
import { hasWorkoutStarted, loadWorkoutProgress } from '../../store/workoutStore';
import type { WorkoutStackParamList } from '../../navigation/types';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import type { WorkoutDayDetail, WorkoutExerciseDetail } from '../../types/api';
import { exerciseWithSelectedVariant } from '../../utils/workoutExerciseVariant';
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

export function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard', initialDetail } = route.params;
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, spacing.sm);
  const { fontScale } = useWindowDimensions();
  const bodyGender = useProfileBodyGender();
  const dateKey = useDailyReadingDate();
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(initialDetail || null);
  const [selectedAlternates, setSelectedAlternates] = useState<Record<string, number>>({});
  const [startedDayId, setStartedDayId] = useState('');
  const [loading, setLoading] = useState(!initialDetail);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

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

  useFocusEffect(useCallback(() => {
    let active = true;
    loadWorkoutProgress(planDayId)
      .then((progress) => {
        if (active) {
          setSelectedAlternates(progress.selectedAlternatesByExercise || {});
          setStartedDayId(hasWorkoutStarted(progress) ? planDayId : '');
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [planDayId]));

  const exercises = useMemo(
    () => (detail?.exercises ?? []).filter((exercise) => !isSectionMarker(exercise.notes)),
    [detail?.exercises],
  );
  const summary = useMemo(
    () => (detail ? buildWorkoutSummary(detail) : null),
    [detail],
  );
  const canStartWorkout = Boolean(!loading && !error && detail && exercises.length);
  const muscles = useMemo(() => deriveWorkoutMuscles(detail), [detail]);
  const visuals = workoutOverviewVisuals(planDayId, mode, dateKey, detail?.focus);
  const startWorkout = () => {
    if (!canStartWorkout || !detail) return;
    navigation.navigate('WorkoutDetail', {
      planDayId: detail.planDayId,
      title: detail.focus,
      mode,
      initialDetail: detail,
    });
  };

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: bottomInset + spacing.lg }]}>
        <WorkoutScreenHeader title={modeLabel(mode)} onBack={() => navigation.goBack()} largeText />
        <View style={styles.centerStateRoot}><LoadingState message="Preparing workout summary..." /></View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <WorkoutScreenHeader eyebrow="Your session" title={modeLabel(mode)} onBack={() => navigation.goBack()} largeText />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: canStartWorkout ? spacing.lg : bottomInset + spacing.lg }]}
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
              <View style={styles.heroArtworkFrame}>
                <Image source={visuals.artwork} style={styles.heroImage} resizeMode="cover" accessible={false} testID="workout-summary-artwork" />
                <View style={styles.heroBadges}>
                  <Text style={styles.dayBadge}>DAY {detail.dayNumber}</Text>
                  <Text style={styles.modeBadge}>{mode === 'quick' ? 'Short workout' : 'Full session'}</Text>
                </View>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>{formatWorkoutTitle(detail.focus || detail.planTitle)}</Text>
                <View style={styles.heroFacts}><Text style={styles.heroSubline}>{exercises.length} movements</Text><View style={styles.factDot} /><Text style={styles.heroSubline}>{summary.intensity}</Text></View>
              </View>
              <View style={styles.sessionDetails}>
                <View style={[styles.metricStrip, fontScale >= 1.3 && styles.metricsStacked]}>
                  <Metric kind="time" variant={visuals.variant} label="Session time" value={summary.duration} />
                  <View style={[styles.metricDivider, fontScale >= 1.3 && styles.metricDividerHorizontal]} />
                  <Metric kind="energy" variant={visuals.variant} label="Estimated burn" value={summary.calories} />
                </View>
                <View style={styles.targetSection}>
                  <Text style={styles.targetTitle}>Target areas</Text>
                  {muscles.length ? <View style={styles.bodyMap}><WeeklyBodyMap gender={bodyGender} muscles={muscles} mini showLabels={false} /></View> : null}
                    <View style={styles.chips}>
                      {summary.muscles.map((muscle) => (
                        <View key={muscle} style={styles.muscleChip}>
                          <Text style={styles.muscleText}>{muscle}</Text>
                        </View>
                      ))}
                    </View>
                </View>
                <View style={styles.benefitSection}>
                  <View style={styles.benefitHeading}>
                    <WorkoutOverviewArt kind="growth" variant={visuals.variant} size={26} />
                    <Text style={styles.insightLabel}>What this builds</Text>
                  </View>
                    <View style={styles.benefitList}>
                      {summary.benefits.slice(0, 2).map((benefit) => (
                        <View key={benefit} style={styles.benefitRow}>
                          <View style={styles.benefitDot} />
                          <Text style={styles.benefitText}>{benefit}</Text>
                        </View>
                      ))}
                    </View>
                </View>
              </View>
            </View>
            <View style={styles.planSection}>
              <View style={styles.planHeader}>
                <WorkoutOverviewArt kind="flow" variant={visuals.variant} size={38} />
                <View style={styles.exerciseCopy}>
                  <Text style={styles.planEyebrow}>Session flow</Text>
                  <Text style={styles.planTitle}>Movement plan</Text>
                </View>
                <Text style={styles.exerciseCount}>{exercises.length} moves</Text>
              </View>
              <View style={styles.exerciseList}>
                {exercises.map((exercise, index) => {
                  const activeChoice = exerciseWithSelectedVariant(exercise, selectedAlternates[exercise.exerciseId]);
                  return (
                  <View
                    key={`${exercise.exerciseId}-${index}`}
                    style={[
                      styles.exerciseRow,
                      index === exercises.length - 1 && styles.exerciseRowLast,
                    ]}
                  >
                    <View style={styles.exerciseIndex}>
                      <Text style={styles.exerciseIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                    <View style={styles.exerciseCopy}>
                      <Text style={styles.exerciseName}>{activeChoice.exerciseName}</Text>
                      <Text style={styles.exerciseMeta}>{exerciseMeta(activeChoice)}</Text>
                    </View>
                  </View>
                );})}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {canStartWorkout ? (
        <View style={[styles.fixedCtaLayer, { paddingBottom: bottomInset }]}>
          <WorkoutPrimaryCTA
            title={startedDayId === planDayId ? 'Continue workout' : 'Start workout'}
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

function Metric({ kind, variant, label, value }: { kind: 'time' | 'energy'; variant: number; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeading}>
        <WorkoutOverviewArt kind={kind} variant={variant} size={22} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  centerStateRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1, minHeight: 0, marginTop: 16 },
  scroll: { flexGrow: 1, gap: 16, paddingTop: 8, width: '100%', maxWidth: 680, alignSelf: 'center' },
  statePanel: { flexGrow: 1, minHeight: 300, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  summarySurface: { borderRadius: 24, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  heroArtworkFrame: { width: '100%', aspectRatio: 2.6, backgroundColor: colors.panelRaised, overflow: 'hidden' },
  // Explicit dimensions override a bundled image's intrinsic size on native.
  heroImage: { width: '100%', height: '100%' },
  heroBadges: { position: 'absolute', top: 0, left: 0, right: 0, padding: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  dayBadge: { ...typography.label, fontSize: 11, color: colors.onPrimary, backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  modeBadge: { ...typography.caption, color: colors.ink, backgroundColor: colors.panel, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  heroCopy: { padding: 18, paddingBottom: 14, gap: 6, backgroundColor: colors.panel },
  heroTitle: { fontSize: 23, lineHeight: 30, fontWeight: '700', color: colors.ink },
  heroFacts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 },
  heroSubline: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  factDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.inkSubtle },
  sessionDetails: { paddingHorizontal: 18, paddingBottom: 18 },
  metricStrip: { flexDirection: 'row', gap: 12, alignItems: 'stretch', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  metricDividerHorizontal: { width: '100%', height: StyleSheet.hairlineWidth },
  metricsStacked: { flexDirection: 'column' },
  metric: { flex: 1, minWidth: 0, gap: 5 },
  metricHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  metricLabel: { ...typography.caption, fontSize: 11, lineHeight: 16, color: colors.inkMuted, flexShrink: 1 },
  metricValue: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: colors.ink },
  targetSection: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  targetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: colors.ink },
  bodyMap: { marginTop: 4 },
  insightLabel: { ...typography.overline, color: colors.ink, textTransform: 'uppercase', fontSize: 11, lineHeight: 16 },
  benefitSection: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  benefitHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold, marginTop: 8 },
  benefitList: { gap: 6 },
  benefitRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  benefitText: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, flex: 1 },
  planSection: { borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 18, paddingBottom: 4 },
  planHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 8 },
  planEyebrow: { ...typography.overline, fontSize: 10, lineHeight: 15, color: colors.gold, textTransform: 'uppercase' },
  planTitle: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: colors.ink, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  muscleChip: { minHeight: 25, borderRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  muscleText: { fontSize: 11, lineHeight: 17, color: colors.inkMuted, fontWeight: '500' },
  exerciseCount: { ...typography.caption, color: colors.inkMuted },
  exerciseList: {},
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 12 },
  exerciseRowLast: { borderBottomWidth: 0 },
  exerciseIndex: { minWidth: 28, minHeight: 28, padding: 4, borderRadius: 8, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  exerciseIndexText: { fontSize: 12, lineHeight: 18, color: colors.gold, fontWeight: '600', fontVariant: ['tabular-nums'] },
  exerciseCopy: { flex: 1, minWidth: 0 },
  exerciseName: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink },
  exerciseMeta: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 3 },
  fixedCtaLayer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  startWorkoutCta: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' },
});
