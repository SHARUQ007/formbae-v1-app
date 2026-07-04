import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ExerciseVideo } from '../../components/ExerciseVideo';
import { fetchWorkoutDay } from '../../services/workoutService';
import {
  completeWithQueue,
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress,
} from '../../store/workoutStore';
import { useRestTimer } from '../../hooks/useRestTimer';
import { displayLocalNotification } from '../../services/notificationService';
import type { WorkoutDayDetail } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

export function WorkoutDetailScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
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
      Alert.alert(
        'Workout complete',
        result.synced ? 'Great work! Your progress is saved.' : 'Saved offline — it will sync when you are back online.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } finally {
      setFinishing(false);
    }
  }, [detail, planDayId, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Workout not found'}</Text>
        <PrimaryButton title="Retry" onPress={load} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {timer.running ? (
        <View style={styles.timerBar}>
          <Text style={styles.timerText}>Rest: {timer.remaining}s</Text>
          <View style={styles.timerActions}>
            <TouchableOpacity onPress={() => timer.addTime(15)}>
              <Text style={styles.timerBtn}>+15s</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={timer.stop}>
              <Text style={styles.timerBtn}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.day}>Day {detail.dayNumber}</Text>
        <Text style={styles.focus}>{detail.focus || detail.planTitle}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {completed.size}/{detail.exercises.length} exercises done
        </Text>

        {detail.exercises.length === 0 ? (
          <Card>
            <Text style={styles.empty}>No exercises for this day. It may be a rest day.</Text>
          </Card>
        ) : (
          detail.exercises.map((exercise, index) => {
            const done = completed.has(exercise.exerciseId);
            return (
              <Card key={`${exercise.exerciseId}_${index}`} style={done ? styles.doneCard : undefined}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName}>
                    {index + 1}. {exercise.exerciseName}
                  </Text>
                  {done ? <Text style={styles.doneTag}>✓ Done</Text> : null}
                </View>
                <Text style={styles.meta}>
                  {exercise.sets ? `${exercise.sets} sets` : ''}
                  {exercise.reps ? ` · ${exercise.reps} reps` : ''}
                  {exercise.restSec ? ` · ${exercise.restSec}s rest` : ''}
                </Text>
                {exercise.notes ? <Text style={styles.notes}>{exercise.notes}</Text> : null}
                <View style={styles.videoBox}>
                  <ExerciseVideo url={exercise.videoUrl} />
                </View>
                <PrimaryButton
                  title={done ? 'Mark not done' : 'Mark complete'}
                  variant={done ? 'secondary' : 'primary'}
                  onPress={() => toggleExercise(exercise.exerciseId, exercise.restSec)}
                  style={{ marginTop: 12 }}
                />
              </Card>
            );
          })
        )}

        <PrimaryButton title="Finish workout" onPress={onFinish} loading={finishing} style={{ marginTop: 20 }} />
        <Text style={styles.safety}>
          Warm up before you start and use good form. Stop immediately and rest if you feel pain, dizziness, or
          discomfort, and consult a healthcare professional if it continues.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  error: { color: colors.error, textAlign: 'center' },
  scroll: { padding: 24 },
  day: { color: colors.accent, fontWeight: '700' },
  focus: { fontSize: 24, fontWeight: '700', color: colors.ink, marginVertical: 6 },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 99, marginTop: 8 },
  progressFill: { height: 6, backgroundColor: colors.accent, borderRadius: 99 },
  progressLabel: { color: colors.inkMuted, marginTop: 6, marginBottom: 12 },
  empty: { color: colors.inkMuted },
  doneCard: { backgroundColor: colors.accentLight, marginBottom: 12 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 17, fontWeight: '700', color: colors.ink, flex: 1, paddingRight: 8 },
  doneTag: { color: colors.accent, fontWeight: '700' },
  meta: { color: colors.inkMuted, marginTop: 4 },
  notes: { color: colors.inkMuted, marginTop: 6, fontStyle: 'italic' },
  videoBox: { marginTop: 12 },
  timerBar: {
    backgroundColor: colors.accentDark,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  timerText: { color: colors.white, fontSize: 18, fontWeight: '700' },
  timerActions: { flexDirection: 'row', gap: 20 },
  timerBtn: { color: colors.white, fontWeight: '700' },
  safety: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 16, fontStyle: 'italic' },
});
