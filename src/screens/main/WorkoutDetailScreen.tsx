import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { Badge } from '../../components/Badge';
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

export function WorkoutDetailScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout');
    } finally {
      setLoading(false);
    }
  }, [planDayId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next: Set<string>) => {
      await saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(next),
        updatedAt: new Date().toISOString(),
      });
    },
    [planDayId],
  );

  const toggleExercise = useCallback(
    async (exerciseId: string, restSec: string) => {
      if (!detail) return;
      const next = new Set(completed);
      const isDone = next.has(exerciseId);
      if (isDone) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
        const rest = Number(restSec);
        if (Number.isFinite(rest) && rest > 0) timer.start(rest);
      }
      setCompleted(next);
      await persist(next);
      await completeWithQueue({
        planId: detail.planId,
        planDayId: detail.planDayId,
        action: isDone ? 'exerciseUndo' : 'exercise',
        exerciseId,
        workoutMode: detail.workoutMode,
      });
    },
    [detail, completed, persist, timer],
  );

  const progress = useMemo(() => {
    if (!detail || detail.exercises.length === 0) return 0;
    return completed.size / detail.exercises.length;
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
              {completed.size}/{detail.exercises.length} done
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
          </View>
          <ProgressBar value={progress} />
        </View>

        {detail.exercises.length === 0 ? (
          <EmptyState icon="coffee" title="Rest day" message="No exercises for this day. Recover well!" />
        ) : (
          detail.exercises.map((exercise, index) => {
            const done = completed.has(exercise.exerciseId);
            return (
              <Card key={`${exercise.exerciseId}_${index}`} style={StyleSheet.flatten([styles.exCard, done && styles.exDone])}>
                <View style={styles.exHeader}>
                  <View style={[styles.exNum, done && styles.exNumDone]}>
                    {done ? <Feather name="check" size={16} color={colors.white} /> : <Text style={styles.exNumText}>{index + 1}</Text>}
                  </View>
                  <Text style={styles.exName}>{exercise.exerciseName}</Text>
                </View>

                <View style={styles.chips}>
                  {exercise.sets ? <Badge label={`${exercise.sets} sets`} tone="neutral" icon="layers" /> : null}
                  {exercise.reps ? <Badge label={`${exercise.reps} reps`} tone="neutral" icon="repeat" /> : null}
                  {exercise.restSec ? <Badge label={`${exercise.restSec}s rest`} tone="neutral" icon="clock" /> : null}
                </View>

                {exercise.notes ? <Text style={styles.notes}>{exercise.notes}</Text> : null}

                <View style={styles.videoBox}>
                  <ExerciseVideo url={exercise.videoUrl} />
                </View>

                <PrimaryButton
                  title={done ? 'Mark not done' : 'Mark complete'}
                  icon={done ? 'rotate-ccw' : 'check'}
                  variant={done ? 'secondary' : 'primary'}
                  onPress={() => toggleExercise(exercise.exerciseId, exercise.restSec)}
                  style={styles.exBtn}
                />
              </Card>
            );
          })
        )}

        <PrimaryButton title="Finish workout" icon="flag" onPress={onFinish} loading={finishing} style={styles.finish} />
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
  exCard: { marginBottom: spacing.sm },
  exDone: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
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
  exName: { ...typography.subtitle, color: colors.ink, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  notes: { ...typography.body, color: colors.inkMuted, fontStyle: 'italic', marginBottom: spacing.sm },
  videoBox: { marginBottom: spacing.sm },
  exBtn: { marginTop: spacing.xs },
  finish: { marginTop: spacing.md },
  safetyRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md, alignItems: 'flex-start' },
  safety: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17, fontStyle: 'italic' },
});
