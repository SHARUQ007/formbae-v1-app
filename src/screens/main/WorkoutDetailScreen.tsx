import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { ExerciseVideo } from '../../components/ExerciseVideo';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { fetchWorkoutDay } from '../../services/workoutService';
import {
  completeWithQueue,
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress,
} from '../../store/workoutStore';
import { useRestTimer } from '../../hooks/useRestTimer';
import { displayBehavioralNotification, displayLocalNotification } from '../../services/notificationService';
import { useAuthStore } from '../../store/authStore';
import type { WorkoutDayDetail } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

const VIEWPORT_HEIGHT = Dimensions.get('window').height;

function getSectionLabel(notes: string, fallback: string) {
  const section = notes.match(/(?:^|[|\n])\s*Section:\s*([^|\n]+)/i)?.[1]?.trim();
  return section || fallback;
}

function isSectionMarker(notes: string) {
  return /(?:^|[|\n])\s*Type:\s*Section/i.test(notes || '');
}

function cleanExerciseNotes(notes: string) {
  return (notes || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(Type|Section|Meta Name|Meta Sets|Meta Reps|Meta Duration|Meta Rest|Display)\s*:/i.test(part))
    .join(' · ');
}

function displayValue(value: string, fallback = '-') {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
}

export function WorkoutDetailScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [setProgress, setSetProgress] = useState<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const { status } = useAuthStore();
  const timer = useRestTimer(() => {
    displayLocalNotification('Rest complete', 'Time for your next set.').catch(() => undefined);
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkoutDay(planDayId, mode);
      setDetail(data);
      const saved = await loadWorkoutProgress(planDayId);
      setCompleted(new Set(saved.completedExerciseIds));
      setSetProgress(saved.setProgressByExercise || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout');
    } finally {
      setLoading(false);
    }
  }, [planDayId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const persistSets = useCallback(
    async (next: Record<string, number>, completedSet = completed) => {
      await saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(completedSet),
        setProgressByExercise: next,
        updatedAt: new Date().toISOString(),
      });
    },
    [completed, planDayId],
  );

  const progress = useMemo(() => {
    if (!detail || detail.exercises.length === 0) return 0;
    const trackable = detail.exercises.filter((exercise) => !isSectionMarker(exercise.notes));
    if (!trackable.length) return 0;
    const completedTrackable = trackable.filter((exercise) => completed.has(exercise.exerciseId)).length;
    return completedTrackable / trackable.length;
  }, [detail, completed]);

  const onFinish = useCallback(async () => {
    if (!detail) return;
    setFinishing(true);
    try {
      const result = await completeWithQueue({
        planId: detail.planId,
        planDayId: detail.planDayId,
        action: 'day',
        workoutMode: detail.workoutMode,
      });
      await clearWorkoutProgress(planDayId);
      await displayBehavioralNotification('workoutComplete', {
        firstName: (status?.name || 'there').split(' ')[0],
        workoutTitle: detail.focus || detail.planTitle || 'Workout',
      }).catch(() => undefined);
      Alert.alert(
        'Workout complete',
        result.synced ? 'Great work! Your progress is saved.' : 'Saved offline — it will sync when you are back online.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } finally {
      setFinishing(false);
    }
  }, [detail, planDayId, navigation, status?.name]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerPad, { paddingTop: insets.top }]}>
        <Header onBack={() => navigation.goBack()} title="Workout" />
        <LoadingState message="Loading workout…" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.container, styles.centerPad, { paddingTop: insets.top }]}>
        <Header onBack={() => navigation.goBack()} title="Workout" />
        <ErrorState message={error || 'Workout not found'} onRetry={load} />
      </View>
    );
  }

  const trackableExercises = detail.exercises.filter((exercise) => !isSectionMarker(exercise.notes));
  const completedTrackableCount = trackableExercises.filter((exercise) => completed.has(exercise.exerciseId)).length;
  const activeExercise = trackableExercises[Math.min(activeIndex, Math.max(0, trackableExercises.length - 1))] || null;
  const activeExerciseIndex = activeExercise ? trackableExercises.findIndex((exercise) => exercise.exerciseId === activeExercise.exerciseId) : 0;
  const activeDone = activeExercise ? completed.has(activeExercise.exerciseId) : false;
  const activeSets = Math.max(1, Number(activeExercise?.sets || 1));
  const activeSetCount = activeExercise ? Math.min(activeSets, setProgress[activeExercise.exerciseId] || 0) : 0;
  const activeRest = Number(activeExercise?.restSec || 0);
  const activeNotes = cleanExerciseNotes(activeExercise?.notes || '');

  const moveToNext = () => {
    setActiveIndex((current) => Math.min(trackableExercises.length - 1, current + 1));
  };

  const moveToPrevious = () => {
    setActiveIndex((current) => Math.max(0, current - 1));
  };

  const completeActiveExercise = async (setsOverride = setProgress) => {
    if (!activeExercise || !detail || completed.has(activeExercise.exerciseId)) return;
    const nextCompleted = new Set(completed);
    nextCompleted.add(activeExercise.exerciseId);
    setCompleted(nextCompleted);
    await persistSets(setsOverride, nextCompleted);
    await completeWithQueue({
      planId: detail.planId,
      planDayId: detail.planDayId,
      action: 'exercise',
      exerciseId: activeExercise.exerciseId,
      workoutMode: detail.workoutMode,
    });
  };

  const onSetDone = async () => {
    if (!activeExercise) return;
    const nextCount = Math.min(activeSets, activeSetCount + 1);
    const nextSets = { ...setProgress, [activeExercise.exerciseId]: nextCount };
    setSetProgress(nextSets);
    await persistSets(nextSets);
    if (activeRest > 0) timer.start(activeRest);
    if (nextCount >= activeSets) {
      await completeActiveExercise(nextSets);
    }
  };

  const markActiveComplete = async () => {
    if (!activeExercise) return;
    const nextSets = { ...setProgress, [activeExercise.exerciseId]: activeSets };
    setSetProgress(nextSets);
    await completeActiveExercise(nextSets);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header onBack={() => navigation.goBack()} title={`Day ${detail.dayNumber}`} subtitle={detail.focus || detail.planTitle} />

      {timer.running ? (
        <View style={styles.timerBar}>
          <View style={styles.timerLeft}>
            <Feather name="clock" size={18} color={colors.white} />
            <Text style={styles.timerText}>Rest {timer.remaining}s</Text>
          </View>
          <View style={styles.timerActions}>
            <TouchableOpacity onPress={() => timer.addTime(15)} style={styles.timerPill}>
              <Text style={styles.timerBtn}>+15s</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={timer.stop} style={styles.timerPill}>
              <Text style={styles.timerBtn}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>
              {completedTrackableCount}/{trackableExercises.length} movements done
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
          </View>
          <ProgressBar value={progress} />
        </View>

        {trackableExercises.length === 0 ? (
          <EmptyState icon="coffee" title="Rest day" message="No exercises for this day. Recover well!" />
        ) : activeExercise ? (
          <Card style={StyleSheet.flatten([styles.focusCard, activeDone && styles.exDone])}>
            <View style={styles.topExerciseNav}>
              <TouchableOpacity
                onPress={moveToPrevious}
                disabled={activeExerciseIndex === 0}
                style={[styles.arrowButton, activeExerciseIndex === 0 && styles.arrowButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Previous exercise"
              >
                <Feather name="chevron-left" size={22} color={activeExerciseIndex === 0 ? colors.inkSubtle : colors.ink} />
              </TouchableOpacity>
              <View style={styles.exerciseCounter}>
                <Text style={styles.exerciseCounterText}>
                  {activeExerciseIndex + 1} / {trackableExercises.length}
                </Text>
                <Text style={styles.exerciseCounterSub}>Browse exercises</Text>
              </View>
              <TouchableOpacity
                onPress={moveToNext}
                disabled={activeExerciseIndex >= trackableExercises.length - 1}
                style={[styles.arrowButton, activeExerciseIndex >= trackableExercises.length - 1 && styles.arrowButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Next exercise"
              >
                <Feather name="chevron-right" size={22} color={activeExerciseIndex >= trackableExercises.length - 1 ? colors.inkSubtle : colors.ink} />
              </TouchableOpacity>
            </View>

            <View style={styles.focusTop}>
              <View>
                <Text style={styles.focusKicker}>
                  Movement {activeExerciseIndex + 1} of {trackableExercises.length}
                </Text>
                <Text style={styles.focusTitle}>{activeExercise.exerciseName}</Text>
                <Text style={styles.focusSub}>{getSectionLabel(activeExercise.notes, detail.focus || 'Workout')}</Text>
              </View>
              <View style={[styles.focusStatus, activeDone && styles.focusStatusDone]}>
                <Feather name={activeDone ? 'check' : 'activity'} size={18} color={activeDone ? colors.white : colors.accent} />
              </View>
            </View>

            <View style={styles.prescription}>
              <View style={styles.prescriptionTile}>
                <Text style={styles.prescriptionLabel}>Sets</Text>
                <Text style={styles.prescriptionValue}>{activeSets}</Text>
              </View>
              <View style={styles.prescriptionTile}>
                <Text style={styles.prescriptionLabel}>Reps / time</Text>
                <Text style={styles.prescriptionValue}>{displayValue(activeExercise.reps, '-')}</Text>
              </View>
              <View style={styles.prescriptionTile}>
                <Text style={styles.prescriptionLabel}>Rest</Text>
                <Text style={styles.prescriptionValue}>{displayValue(activeExercise.restSec, '0')}s</Text>
              </View>
            </View>

            <View style={styles.setTracker}>
              <View style={styles.setTrackerHead}>
                <Text style={styles.setTrackerTitle}>Set tracker</Text>
                <Text style={styles.setTrackerMeta}>
                  {activeSetCount}/{activeSets} complete
                </Text>
              </View>
              <View style={styles.setDots}>
                {Array.from({ length: activeSets }).map((_, index) => {
                  const done = index < activeSetCount;
                  return (
                    <View key={index} style={[styles.setDot, done && styles.setDotDone]}>
                      <Text style={[styles.setDotText, done && styles.setDotTextDone]}>{index + 1}</Text>
                    </View>
                  );
                })}
              </View>
              <PrimaryButton
                title={activeDone ? 'Movement complete' : activeSetCount >= activeSets ? 'Mark complete' : `Log set ${activeSetCount + 1}`}
                icon={activeDone ? 'check' : 'plus'}
                onPress={activeSetCount >= activeSets ? markActiveComplete : onSetDone}
                disabled={activeDone}
                style={styles.exBtn}
              />
            </View>

            <View style={styles.primaryNavRow}>
              <PrimaryButton
                title={activeExerciseIndex >= trackableExercises.length - 1 ? 'Finish workout' : 'Next movement'}
                icon={activeExerciseIndex >= trackableExercises.length - 1 ? 'flag' : 'chevron-right'}
                onPress={activeExerciseIndex >= trackableExercises.length - 1 ? onFinish : moveToNext}
                loading={finishing}
                style={styles.primaryNavButton}
              />
            </View>

            <View style={styles.videoBox}>
              <ExerciseVideo url={activeExercise.videoUrl} compact />
            </View>

            {activeNotes ? (
              <View style={styles.coachNote}>
                <Feather name="info" size={15} color={colors.accentDark} />
                <Text style={styles.notes}>{activeNotes}</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <EmptyState icon="coffee" title="Rest day" message="No movements for this day. Recover well!" />
        )}

        <View style={styles.safetyRow}>
          <Feather name="alert-circle" size={14} color={colors.inkMuted} />
          <Text style={styles.safety}>
            Warm up first and use good form. Stop and rest if you feel pain, dizziness, or discomfort, and consult a
            healthcare professional if it continues.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
        <Feather name="chevron-left" size={26} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerPad: { paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerText: { flex: 1 },
  headerTitle: { ...typography.title, color: colors.ink },
  headerSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  timerBar: {
    backgroundColor: colors.accentDark,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  timerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerText: { color: colors.white, ...typography.subtitle },
  timerActions: { flexDirection: 'row', gap: spacing.sm },
  timerPill: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  timerBtn: { color: colors.white, fontWeight: '700', fontSize: 13 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  progressCard: { marginBottom: spacing.md },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  progressLabel: { ...typography.bodyBold, color: colors.ink },
  progressPct: { ...typography.bodyBold, color: colors.accent },
  focusCard: { marginBottom: spacing.sm, minHeight: Math.max(620, VIEWPORT_HEIGHT - 190) },
  topExerciseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    padding: spacing.sm,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowButtonDisabled: { opacity: 0.45 },
  exerciseCounter: { alignItems: 'center', flex: 1 },
  exerciseCounterText: { ...typography.bodyBold, color: colors.ink },
  exerciseCounterSub: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  focusTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  focusKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 4 },
  focusTitle: { ...typography.hero, color: colors.ink },
  focusSub: { ...typography.caption, color: colors.inkMuted, marginTop: 4, textTransform: 'uppercase' },
  focusStatus: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  focusStatusDone: { backgroundColor: colors.accent },
  exCard: { marginBottom: spacing.sm },
  exDone: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  exHeaderText: { flex: 1 },
  exNum: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exNumDone: { backgroundColor: colors.accent },
  exNumText: { ...typography.bodyBold, color: colors.inkMuted },
  exName: { ...typography.subtitle, color: colors.ink },
  exSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2, textTransform: 'uppercase' },
  sectionBreak: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.accentDark,
    padding: spacing.lg,
  },
  sectionKicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase', marginBottom: 4 },
  sectionTitle: { ...typography.title, color: colors.white },
  prescription: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  prescriptionTile: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
    minHeight: 76,
    justifyContent: 'center',
  },
  prescriptionLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 4 },
  prescriptionValue: { ...typography.subtitle, color: colors.ink, fontWeight: '800' },
  coachNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.accentLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  notes: { ...typography.body, color: colors.accentDarker, flex: 1 },
  videoBox: { marginBottom: spacing.md, alignItems: 'center' },
  exBtn: { marginTop: spacing.xs },
  setTracker: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  setTrackerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  setTrackerTitle: { ...typography.bodyBold, color: colors.ink },
  setTrackerMeta: { ...typography.caption, color: colors.inkMuted },
  setDots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  setDot: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setDotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  setDotText: { ...typography.bodyBold, color: colors.inkMuted },
  setDotTextDone: { color: colors.white },
  primaryNavRow: { marginTop: spacing.sm, marginBottom: spacing.sm },
  primaryNavButton: { width: '100%' },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  navButton: { flex: 1 },
  finish: { marginTop: spacing.md },
  safetyRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md, alignItems: 'flex-start' },
  safety: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17, fontStyle: 'italic' },
});
