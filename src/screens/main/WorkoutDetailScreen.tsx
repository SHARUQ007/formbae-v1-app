import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { loadWorkoutDayCached } from '../../services/preloadService';
import { submitWorkoutFeedback, type WorkoutFeedbackSentiment } from '../../services/workoutFeedbackService';
import {
  completeWithQueue,
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress,
} from '../../store/workoutStore';
import { useRestTimer } from '../../hooks/useRestTimer';
import { displayBehavioralNotification, displayLocalNotification } from '../../services/notificationService';
import { useAuthStore } from '../../store/authStore';
import type { WorkoutDayDetail, WorkoutExerciseDetail } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

type RewardType = 'set' | 'movement' | 'workout' | 'feedback';
type RewardState = { id: number; type: RewardType; title: string; subtitle: string } | null;
type SetLog = { setNumber: number; reps: string; weight: string; durationSec?: number };

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

function defaultRepsFromPrescription(value: string) {
  const range = String(value || '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range?.[2]) return range[2];
  const exact = String(value || '').match(/(\d+)/);
  return exact?.[1] || '';
}

function isWeightedExercise(exercise?: WorkoutExerciseDetail | null) {
  if (!exercise) return false;
  const text = `${exercise.exerciseName} ${exercise.reps} ${exercise.notes}`.toLowerCase();
  if (/\b(sec|secs|second|seconds|min|mins|minute|minutes|km|meter|metre|mile|cardio|treadmill|walk|run|plank|hold|stretch|mobility|bodyweight)\b/.test(text)) return false;
  return /\b(dumbbell|barbell|kettlebell|machine|cable|smith|press|row|curl|deadlift|squat|lunge|raise|extension|pulldown|thrust)\b/.test(text);
}

function adjustNumberText(value: string, delta: number, step = 1) {
  const current = Number(String(value || '').replace(/[^\d.]/g, '')) || 0;
  const next = Math.max(0, current + delta * step);
  return Number.isInteger(next) ? String(next) : next.toFixed(1).replace(/\.0$/, '');
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function modeCopy(mode: 'standard' | 'quick') {
  if (mode === 'quick') {
    return {
      eyebrow: 'Short on time',
    };
  }
  return {
    eyebrow: "Today's Workout",
  };
}

function FocusedWorkoutDetailScreen({ route, navigation }: Props) {
  const { planDayId, mode = 'standard' } = route.params;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const compactStep = windowHeight < 760;
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [setProgress, setSetProgress] = useState<Record<string, number>>({});
  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  const [repInput, setRepInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [movementStarted, setMovementStarted] = useState(false);
  const [setEntryOpen, setSetEntryOpen] = useState(false);
  const [setPaused, setSetPaused] = useState(false);
  const [setElapsed, setSetElapsed] = useState(0);
  const [pendingNextIndex, setPendingNextIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reward, setReward] = useState<RewardState>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<WorkoutFeedbackSentiment | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const { status } = useAuthStore();
  const pendingNextIndexRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
  }, [navigation]);

  const timer = useRestTimer(() => {
    displayLocalNotification('Rest complete', 'Time for your next set.').catch(() => undefined);
    const nextIndex = pendingNextIndexRef.current;
    pendingNextIndexRef.current = null;
    setPendingNextIndex(null);
    if (nextIndex !== null) {
      setActiveIndex(nextIndex);
      setMovementStarted(false);
    }
  });
  const clearReward = useCallback(() => setReward(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadWorkoutDayCached(planDayId, mode);
      setDetail(data);
      const saved = await loadWorkoutProgress(planDayId);
      setCompleted(new Set(saved.completedExerciseIds));
      setSetProgress(saved.setProgressByExercise || {});
      setSetLogs(saved.setLogsByExercise || {});
      setActiveIndex(0);
      setMovementStarted(false);
      setSetEntryOpen(false);
      setSetPaused(false);
      setSetElapsed(0);
      setPendingNextIndex(null);
      pendingNextIndexRef.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout');
    } finally {
      setLoading(false);
    }
  }, [planDayId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!movementStarted || setPaused || timer.running) return undefined;
    const interval = setInterval(() => {
      setSetElapsed((value) => value + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [movementStarted, setPaused, timer.running]);

  const trackableExercises = useMemo(
    () => (detail?.exercises ?? []).filter((exercise) => !isSectionMarker(exercise.notes)),
    [detail],
  );

  const activeExercise = trackableExercises[Math.min(activeIndex, Math.max(0, trackableExercises.length - 1))] || null;
  const activeExerciseId = activeExercise?.exerciseId || '';
  const activeExerciseReps = activeExercise?.reps || '';
  const activeExerciseIndex = activeExercise ? trackableExercises.findIndex((exercise) => exercise.exerciseId === activeExercise.exerciseId) : 0;
  const activeDone = activeExercise ? completed.has(activeExercise.exerciseId) : false;
  const activeSets = Math.max(1, Number(activeExercise?.sets || 1));
  const activeSetCount = activeExercise ? Math.min(activeSets, setProgress[activeExercise.exerciseId] || 0) : 0;
  const activeSetNumber = Math.min(activeSets, activeSetCount + 1);
  const activeRest = Number(activeExercise?.restSec || 0);
  const activeNotes = cleanExerciseNotes(activeExercise?.notes || '');
  const activeNeedsWeight = isWeightedExercise(activeExercise);
  const activeSetLogs = useMemo(() => (activeExerciseId ? setLogs[activeExerciseId] || [] : []), [activeExerciseId, setLogs]);
  const activeLastLog = activeSetLogs[activeSetCount - 1];
  const copy = modeCopy(mode);
  const restTargetIndex = pendingNextIndex ?? pendingNextIndexRef.current;
  const restTargetExercise = restTargetIndex !== null && restTargetIndex !== undefined ? trackableExercises[restTargetIndex] : null;
  const restTargetLabel = restTargetIndex === activeExerciseIndex && activeExercise
    ? `Set ${Math.min(activeSets, activeSetCount + 1)} of ${activeExercise.exerciseName}`
    : restTargetExercise?.exerciseName || 'finish workout';
  const completedCount = completed.size;
  const progressPct = trackableExercises.length ? Math.min(100, Math.round((completedCount / trackableExercises.length) * 100)) : 0;
  const workoutVideos = useMemo(
    () => trackableExercises
      .filter((exercise) => String(exercise.videoUrl || '').trim())
      .map((exercise) => ({
        id: exercise.exerciseId,
        title: exercise.exerciseName,
        subtitle: getSectionLabel(exercise.notes, detail?.focus || 'Workout'),
        videoUrl: exercise.videoUrl,
      })),
    [detail?.focus, trackableExercises],
  );

  const openExerciseVideo = useCallback(
    (exercise: WorkoutExerciseDetail) => {
      const initialIndex = Math.max(0, workoutVideos.findIndex((item) => item.id === exercise.exerciseId));
      navigation.navigate('WorkoutVideo', {
        title: exercise.exerciseName,
        subtitle: getSectionLabel(exercise.notes, detail?.focus || 'Workout'),
        videoUrl: exercise.videoUrl,
        videos: workoutVideos,
        initialIndex,
      });
    },
    [detail?.focus, navigation, workoutVideos],
  );

  useEffect(() => {
    if (!activeExerciseId || activeDone) {
      setRepInput('');
      setWeightInput('');
      return;
    }
    const existing = activeSetLogs.find((log) => log.setNumber === activeSetNumber);
    setRepInput(existing?.reps || defaultRepsFromPrescription(activeExerciseReps));
    setWeightInput(existing?.weight || '');
  }, [activeDone, activeExerciseId, activeExerciseReps, activeSetLogs, activeSetNumber]);

  const persistSets = useCallback(
    async (next: Record<string, number>, completedSet = completed, logsOverride = setLogs) => {
      await saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(completedSet),
        setProgressByExercise: next,
        setLogsByExercise: logsOverride,
        updatedAt: new Date().toISOString(),
      });
    },
    [completed, planDayId, setLogs],
  );

  const completeActiveExercise = async (setsOverride = setProgress, logsOverride = setLogs) => {
    if (!activeExercise || !detail || completed.has(activeExercise.exerciseId)) return;
    const nextCompleted = new Set(completed);
    nextCompleted.add(activeExercise.exerciseId);
    setCompleted(nextCompleted);
    await persistSets(setsOverride, nextCompleted, logsOverride);
    await completeWithQueue({
      planId: detail.planId,
      planDayId: detail.planDayId,
      action: 'exercise',
      exerciseId: activeExercise.exerciseId,
      workoutMode: detail.workoutMode,
    });
  };

  const moveToExercise = (index: number) => {
    timer.stop();
    setPendingNextIndex(null);
    pendingNextIndexRef.current = null;
    setMovementStarted(false);
    setSetEntryOpen(false);
    setSetPaused(false);
    setSetElapsed(0);
    setActiveIndex(Math.max(0, Math.min(trackableExercises.length - 1, index)));
  };

  const startMovement = () => {
    setMovementStarted(true);
    setSetPaused(false);
    setSetElapsed(0);
    setReward({
      id: Date.now(),
      type: 'set',
      title: 'Set started',
      subtitle: `Set ${activeSetNumber} is now active.`,
    });
  };

  const completeActiveSet = () => {
    if (!activeExercise) return;
    setSetPaused(true);
    setSetEntryOpen(true);
  };

  const logCurrentSetAndAdvance = async () => {
    if (!activeExercise) return;
    const nextSetCount = Math.min(activeSets, activeSetCount + 1);
    const nextLog: SetLog = {
      setNumber: nextSetCount,
      reps: repInput.trim() || defaultRepsFromPrescription(activeExercise.reps),
      weight: activeNeedsWeight ? weightInput.trim() : '',
      durationSec: setElapsed,
    };
    const previousLogs = setLogs[activeExercise.exerciseId] || [];
    const nextLogsForExercise = [
      ...previousLogs.filter((log) => log.setNumber !== nextSetCount),
      nextLog,
    ].sort((a, b) => a.setNumber - b.setNumber);
    const nextLogs = { ...setLogs, [activeExercise.exerciseId]: nextLogsForExercise };
    const nextSets = { ...setProgress, [activeExercise.exerciseId]: nextSetCount };

    setSetProgress(nextSets);
    setSetLogs(nextLogs);
    setMovementStarted(false);
    setSetPaused(false);
    setSetEntryOpen(false);

    const movementComplete = nextSetCount >= activeSets;
    setReward({
      id: Date.now(),
      type: movementComplete ? 'movement' : 'set',
      title: movementComplete ? 'Movement complete' : `Set ${nextSetCount} logged`,
      subtitle: movementComplete
        ? `${activeExercise.exerciseName} done.`
        : `${activeSets - nextSetCount} set${activeSets - nextSetCount === 1 ? '' : 's'} left.`,
    });

    if (movementComplete) {
      await completeActiveExercise(nextSets, nextLogs);
    } else {
      await persistSets(nextSets, completed, nextLogs);
    }

    const nextIndex = movementComplete ? activeExerciseIndex + 1 : activeExerciseIndex;
    if (movementComplete && nextIndex >= trackableExercises.length) return;
    if (activeRest > 0) {
      pendingNextIndexRef.current = nextIndex;
      setPendingNextIndex(nextIndex);
      timer.start(activeRest);
    } else {
      moveToExercise(nextIndex);
    }
    setSetElapsed(0);
  };

  const skipRest = () => {
    const nextIndex = pendingNextIndexRef.current ?? pendingNextIndex;
    timer.stop();
    pendingNextIndexRef.current = null;
    setPendingNextIndex(null);
    if (nextIndex !== null) {
      setActiveIndex(nextIndex);
      setMovementStarted(false);
      setSetPaused(false);
      setSetElapsed(0);
    }
  };

  const primaryCta = () => {
    if (timer.running) return skipRest();
    if (activeDone) {
      if (activeExerciseIndex >= trackableExercises.length - 1) return onFinish();
      return moveToExercise(activeExerciseIndex + 1);
    }
    if (!movementStarted) return startMovement();
    return completeActiveSet();
  };

  const primaryTitle = timer.running
    ? 'Skip rest'
    : activeDone
      ? activeExerciseIndex >= trackableExercises.length - 1
        ? 'Finish workout'
        : 'Next movement'
      : movementStarted
        ? 'Complete set'
        : 'Begin set';

  const onFinish = useCallback(async () => {
    if (!detail) return;
    setFinishing(true);
    try {
      setReward({
        id: Date.now(),
        type: 'workout',
        title: 'Workout complete',
        subtitle: 'Strong finish. Your progress is saved.',
      });
      await wait(900);
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
        result.synced ? 'Great work! Your progress is saved.' : 'Saved offline - it will sync when you are back online.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } finally {
      setFinishing(false);
    }
  }, [detail, planDayId, navigation, status?.name]);

  const submitFeedback = async () => {
    if (!detail || !feedbackSentiment) return;
    setFeedbackSaving(true);
    try {
      await submitWorkoutFeedback({
        planId: detail.planId,
        planDayId: detail.planDayId,
        workoutMode: detail.workoutMode,
        exerciseId: activeExercise?.exerciseId,
        sentiment: feedbackSentiment,
        feedbackText,
      });
      setFeedbackOpen(false);
      setFeedbackText('');
      setFeedbackSentiment(null);
      setReward({
        id: Date.now(),
        type: 'feedback',
        title: 'Feedback sent',
        subtitle: 'Your trainer and team can use this to improve the workout.',
      });
    } catch (e) {
      Alert.alert('Could not send feedback', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setFeedbackSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerPad, { paddingTop: insets.top }]}>
        <LoadingState message="Loading workout..." />
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

  if (!activeExercise) {
    return (
      <View style={[styles.container, styles.centerPad, { paddingTop: insets.top }]}>
        <RewardOverlay reward={reward} onDone={clearReward} />
        <Header onBack={() => navigation.goBack()} title={`Day ${detail.dayNumber}`} subtitle={detail.focus || detail.planTitle} />
        <EmptyState icon="coffee" title="Rest day" message="No movements for this day. Recover well!" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <RewardOverlay reward={reward} onDone={clearReward} />
      <Header
        onBack={() => navigation.goBack()}
        title={copy.eyebrow}
        right={
          <TouchableOpacity
            onPress={() => setFeedbackOpen(true)}
            style={styles.feedbackButton}
            accessibilityRole="button"
            accessibilityLabel="Send workout feedback"
          >
            <Feather name="message-square" size={19} color={colors.accentDark} />
          </TouchableOpacity>
        }
      />

      <View style={styles.sessionProgress}>
        <View style={styles.stepperRow}>
          {trackableExercises.map((exercise, index) => {
            const done = completed.has(exercise.exerciseId);
            const current = index === activeExerciseIndex;
            return (
              <TouchableOpacity
                key={exercise.exerciseId}
                onPress={() => moveToExercise(index)}
                activeOpacity={0.82}
                style={[styles.stepperDot, done && styles.stepperDotDone, current && styles.stepperDotActive]}
                accessibilityRole="button"
                accessibilityLabel={`Open movement ${index + 1}`}
              />
            );
          })}
        </View>
      </View>

      {timer.running ? (
        <View style={[styles.executionShell, compactStep && styles.executionShellCompact]}>
          <View style={styles.restCard}>
            <View style={styles.restIcon}>
              <Feather name="clock" size={30} color={colors.white} />
            </View>
            <Text style={styles.restKicker}>Rest</Text>
            <Text style={styles.restTimer}>{formatTimer(timer.remaining)}</Text>
            <Text style={styles.restText} numberOfLines={2}>
              Next: {restTargetLabel}
            </Text>
            <View style={styles.restActions}>
              <TouchableOpacity onPress={() => timer.addTime(15)} style={styles.restSmallButton} accessibilityRole="button" accessibilityLabel="Add fifteen seconds">
                <Text style={styles.restSmallButtonText}>+15s</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={skipRest} style={styles.restSmallButton} accessibilityRole="button" accessibilityLabel="Skip rest">
                <Text style={styles.restSmallButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.executionShell, compactStep && styles.executionShellCompact]}>
          <View style={styles.movementHead}>
            <View style={styles.activeStep}>
              <Text style={styles.activeStepText}>{activeExerciseIndex + 1}</Text>
            </View>
            <TouchableOpacity onPress={() => setFlowOpen(true)} style={styles.stepFlowButton} accessibilityRole="button" accessibilityLabel="Open workout flow">
              <Text style={styles.stepFlowText}>{activeExerciseIndex + 1}/{trackableExercises.length}</Text>
              <Feather name="list" size={16} color={colors.accentDark} />
            </TouchableOpacity>
          </View>

          <Text style={styles.activeName} adjustsFontSizeToFit minimumFontScale={0.82}>{activeExercise.exerciseName}</Text>

          {!activeDone ? (
            <View style={styles.setLogPanel}>
              <View style={styles.setLogHeader}>
                <View>
                  <Text style={styles.setLogTitle}>{movementStarted ? formatTimer(setElapsed) : `Set ${activeSetNumber} of ${activeSets}`}</Text>
                  <Text style={styles.setLogMeta}>
                    {movementStarted
                      ? setPaused
                        ? 'Paused. Resume when ready or complete the set.'
                        : `Set ${activeSetNumber} in progress.`
                      : 'Start the set when you are ready.'}
                  </Text>
                </View>
                <View style={styles.setLogBadge}>
                  <Feather name={movementStarted ? setPaused ? 'pause' : 'timer' : 'activity'} size={16} color={colors.accentDark} />
                </View>
              </View>

              <Text style={styles.setCompactMeta} numberOfLines={1}>
                {displayValue(activeExercise.reps)} · {displayValue(activeExercise.restSec, '0')}s rest · {activeSetCount}/{activeSets} logged
              </Text>

              {activeLastLog ? (
                <Text style={styles.lastLogText} numberOfLines={1}>
                  Last set: {activeLastLog.reps || '-'} reps{activeLastLog.weight ? ` · ${activeLastLog.weight} kg` : ''}{activeLastLog.durationSec ? ` · ${formatTimer(activeLastLog.durationSec)}` : ''}
                </Text>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => openExerciseVideo(activeExercise)}
            activeOpacity={0.86}
            style={styles.videoStepCard}
            accessibilityRole="button"
            accessibilityLabel={`Open video for ${activeExercise.exerciseName}`}
          >
            <View style={styles.videoStepIcon}>
              <Feather name="play" size={24} color={colors.white} />
            </View>
            <View style={styles.videoStepText}>
              <Text style={styles.videoStepKicker}>Technique video</Text>
              <Text style={styles.videoStepTitle} numberOfLines={1}>Watch form</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.accentDark} />
          </TouchableOpacity>

          {activeNotes ? (
            <View style={styles.stepNote}>
              <Feather name="info" size={15} color={colors.accentDark} />
              <Text style={styles.notes} numberOfLines={3}>{activeNotes}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={[styles.actionDock, { paddingBottom: insets.bottom + spacing.sm }]}>
        {movementStarted && !timer.running ? (
          <View style={styles.activeActionRow}>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => setSetPaused((value) => !value)}
              style={styles.pauseSessionButton}
              accessibilityRole="button"
              accessibilityLabel={setPaused ? 'Resume set' : 'Pause set'}
            >
              <Feather name={setPaused ? 'play' : 'pause'} size={22} color={colors.accentDark} />
              <Text style={styles.pauseSessionText}>{setPaused ? 'Resume' : 'Pause'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={completeActiveSet}
              style={styles.completeSessionButton}
              accessibilityRole="button"
              accessibilityLabel="Complete set"
            >
              <Text style={styles.completeSessionText}>Complete</Text>
              <Feather name="check" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={primaryCta}
            disabled={finishing}
            style={[styles.primarySessionButton, timer.running && styles.restPrimaryButton, activeDone && styles.donePrimaryButton]}
            accessibilityRole="button"
            accessibilityLabel={primaryTitle}
          >
            <View style={styles.primarySessionIcon}>
              <Feather name={timer.running ? 'skip-forward' : activeDone && activeExerciseIndex >= trackableExercises.length - 1 ? 'flag' : 'play'} size={24} color={colors.accentDark} />
            </View>
            <View style={styles.primarySessionLabelBlock}>
              <Text style={styles.primarySessionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{finishing ? 'Finishing...' : primaryTitle}</Text>
              {!timer.running && !activeDone ? <Text style={styles.primarySessionSubText}>Set {activeSetNumber} of {activeSets}</Text> : null}
            </View>
            <Feather name="arrow-right" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
        <View style={styles.secondaryActionRow}>
          <TouchableOpacity onPress={() => setFeedbackOpen(true)} style={styles.secondarySessionButton} accessibilityRole="button" accessibilityLabel="Workout feedback">
            <Feather name="message-square" size={17} color={colors.accentDark} />
            <Text style={styles.secondarySessionText}>Feedback</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStatsOpen(true)} style={styles.secondarySessionButton} accessibilityRole="button" accessibilityLabel="Open workout stats">
            <Feather name="bar-chart-2" size={17} color={colors.accentDark} />
            <Text style={styles.secondarySessionText}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFlowOpen(true)} style={styles.secondarySessionButton} accessibilityRole="button" accessibilityLabel="Open workout flow">
            <Feather name="list" size={17} color={colors.accentDark} />
            <Text style={styles.secondarySessionText}>All moves</Text>
          </TouchableOpacity>
        </View>
      </View>

      <WorkoutFlowModal
        visible={flowOpen}
        exercises={trackableExercises}
        activeExerciseId={activeExercise.exerciseId}
        completed={completed}
        onSelect={(index) => {
          setFlowOpen(false);
          moveToExercise(index);
        }}
        onClose={() => setFlowOpen(false)}
      />

      <WorkoutStatsModal
        visible={statsOpen}
        exercises={trackableExercises}
        completed={completed}
        setProgress={setProgress}
        setLogs={setLogs}
        progressPct={progressPct}
        onClose={() => setStatsOpen(false)}
      />

      <FeedbackModal
        visible={feedbackOpen}
        sentiment={feedbackSentiment}
        text={feedbackText}
        saving={feedbackSaving}
        exerciseName={activeExercise.exerciseName}
        onClose={() => setFeedbackOpen(false)}
        onSentiment={setFeedbackSentiment}
        onText={setFeedbackText}
        onSubmit={submitFeedback}
      />

      <SetEntryModal
        visible={setEntryOpen}
        exerciseName={activeExercise.exerciseName}
        setNumber={activeSetNumber}
        setTotal={activeSets}
        elapsed={setElapsed}
        reps={repInput}
        weight={weightInput}
        needsWeight={activeNeedsWeight}
        targetReps={displayValue(activeExercise.reps, '0')}
        onReps={setRepInput}
        onWeight={setWeightInput}
        onAdjustReps={(delta) => setRepInput((value) => adjustNumberText(value, delta))}
        onAdjustWeight={(delta) => setWeightInput((value) => adjustNumberText(value, delta, 2.5))}
        onCancel={() => {
          setSetEntryOpen(false);
          setSetPaused(false);
        }}
        onSave={logCurrentSetAndAdvance}
      />
    </View>
  );
}

export const WorkoutDetailScreen = FocusedWorkoutDetailScreen;

function Header({
  onBack,
  title,
  subtitle,
  right,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
        <Feather name="chevron-left" size={24} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function ExerciseRow({
  exercise,
  index,
  active,
  done,
  onPress,
}: {
  exercise: WorkoutExerciseDetail;
  index: number;
  active: boolean;
  done: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={[styles.exerciseRow, active && styles.exerciseRowActive]}>
      <View style={[styles.exerciseNum, done && styles.exerciseNumDone, active && styles.exerciseNumActive]}>
        {done ? <Feather name="check" size={15} color={colors.white} /> : <Text style={[styles.exerciseNumText, active && styles.exerciseNumTextActive]}>{index + 1}</Text>}
      </View>
      <View style={styles.exerciseRowText}>
        <Text style={styles.exerciseRowTitle} numberOfLines={1}>{exercise.exerciseName}</Text>
        <Text style={styles.exerciseRowMeta} numberOfLines={1}>{displayValue(exercise.sets, '1')} sets · {displayValue(exercise.reps)} · {displayValue(exercise.restSec, '0')}s rest</Text>
      </View>
      <Feather name={active ? 'play-circle' : 'chevron-right'} size={19} color={active ? colors.accent : colors.inkSubtle} />
    </TouchableOpacity>
  );
}

function WorkoutFlowModal({
  visible,
  exercises,
  activeExerciseId,
  completed,
  onSelect,
  onClose,
}: {
  visible: boolean;
  exercises: WorkoutExerciseDetail[];
  activeExerciseId: string;
  completed: Set<string>;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.flowSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sheetKicker}>Workout flow</Text>
              <Text style={styles.sheetTitle}>Choose a movement</Text>
              <Text style={styles.sheetSub}>{exercises.length} movements in this session</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.exerciseList}>
            {exercises.map((exercise, index) => (
              <ExerciseRow
                key={exercise.exerciseId}
                exercise={exercise}
                index={index}
                active={exercise.exerciseId === activeExerciseId}
                done={completed.has(exercise.exerciseId)}
                onPress={() => onSelect(index)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WorkoutStatsModal({
  visible,
  exercises,
  completed,
  setProgress,
  setLogs,
  progressPct,
  onClose,
}: {
  visible: boolean;
  exercises: WorkoutExerciseDetail[];
  completed: Set<string>;
  setProgress: Record<string, number>;
  setLogs: Record<string, SetLog[]>;
  progressPct: number;
  onClose: () => void;
}) {
  const totalSets = exercises.reduce((sum, exercise) => sum + Math.max(1, Number(exercise.sets || 1)), 0);
  const loggedSets = exercises.reduce((sum, exercise) => sum + Math.min(Math.max(1, Number(exercise.sets || 1)), setProgress[exercise.exerciseId] || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.statsSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sheetKicker}>Workout stats</Text>
              <Text style={styles.sheetTitle}>Progress so far</Text>
              <Text style={styles.sheetSub}>{loggedSets}/{totalSets} sets logged · {progressPct}% complete</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.statsSummaryRow}>
            <View style={styles.statsSummaryCard}>
              <Text style={styles.statsSummaryValue}>{completed.size}/{exercises.length}</Text>
              <Text style={styles.statsSummaryLabel}>Movements</Text>
            </View>
            <View style={styles.statsSummaryCard}>
              <Text style={styles.statsSummaryValue}>{loggedSets}/{totalSets}</Text>
              <Text style={styles.statsSummaryLabel}>Sets</Text>
            </View>
            <View style={styles.statsSummaryCard}>
              <Text style={styles.statsSummaryValue}>{progressPct}%</Text>
              <Text style={styles.statsSummaryLabel}>Done</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.statsList}>
            {exercises.map((exercise, index) => {
              const total = Math.max(1, Number(exercise.sets || 1));
              const logged = Math.min(total, setProgress[exercise.exerciseId] || 0);
              const logs = setLogs[exercise.exerciseId] || [];
              const done = completed.has(exercise.exerciseId);
              return (
                <View key={exercise.exerciseId} style={[styles.statsExerciseCard, done && styles.statsExerciseCardDone]}>
                  <View style={styles.statsExerciseHead}>
                    <View style={[styles.exerciseNum, done && styles.exerciseNumDone]}>
                      {done ? <Feather name="check" size={15} color={colors.white} /> : <Text style={styles.exerciseNumText}>{index + 1}</Text>}
                    </View>
                    <View style={styles.exerciseRowText}>
                      <Text style={styles.exerciseRowTitle} numberOfLines={1}>{exercise.exerciseName}</Text>
                      <Text style={styles.exerciseRowMeta} numberOfLines={1}>{logged}/{total} sets · {displayValue(exercise.reps)} · {displayValue(exercise.restSec, '0')}s rest</Text>
                    </View>
                  </View>
                  {logs.length ? (
                    <View style={styles.loggedSetList}>
                      {logs.map((log) => (
                        <View key={log.setNumber} style={styles.loggedSetPill}>
                          <Text style={styles.loggedSetText}>
                            Set {log.setNumber}: {log.reps || '-'} reps{log.weight ? ` · ${log.weight} kg` : ''}{log.durationSec ? ` · ${formatTimer(log.durationSec)}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FeedbackModal({
  visible,
  sentiment,
  text,
  saving,
  exerciseName,
  onClose,
  onSentiment,
  onText,
  onSubmit,
}: {
  visible: boolean;
  sentiment: WorkoutFeedbackSentiment | null;
  text: string;
  saving: boolean;
  exerciseName: string;
  onClose: () => void;
  onSentiment: (value: WorkoutFeedbackSentiment) => void;
  onText: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.feedbackSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View>
              <Text style={styles.sheetKicker}>Workout feedback</Text>
              <Text style={styles.sheetTitle}>How was this movement?</Text>
              <Text style={styles.sheetSub} numberOfLines={1}>{exerciseName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.sentimentRow}>
            <TouchableOpacity
              onPress={() => onSentiment('up')}
              style={[styles.sentimentButton, sentiment === 'up' && styles.sentimentSelected]}
              accessibilityRole="button"
              accessibilityLabel="Thumbs up"
            >
              <Feather name="thumbs-up" size={21} color={sentiment === 'up' ? colors.white : colors.accentDark} />
              <Text style={[styles.sentimentText, sentiment === 'up' && styles.sentimentTextSelected]}>Good fit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSentiment('down')}
              style={[styles.sentimentButton, sentiment === 'down' && styles.sentimentSelected]}
              accessibilityRole="button"
              accessibilityLabel="Thumbs down"
            >
              <Feather name="thumbs-down" size={21} color={sentiment === 'down' ? colors.white : colors.accentDark} />
              <Text style={[styles.sentimentText, sentiment === 'down' && styles.sentimentTextSelected]}>Needs change</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={text}
            onChangeText={onText}
            placeholder="Tell us what felt good, too hard, painful, boring, or unclear..."
            placeholderTextColor={colors.inkSubtle}
            multiline
            maxLength={1000}
            style={styles.feedbackInput}
            textAlignVertical="top"
          />

          <PrimaryButton title="Send feedback" icon="send" onPress={onSubmit} loading={saving} disabled={!sentiment} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SetEntryModal({
  visible,
  exerciseName,
  setNumber,
  setTotal,
  elapsed,
  reps,
  weight,
  needsWeight,
  targetReps,
  onReps,
  onWeight,
  onAdjustReps,
  onAdjustWeight,
  onCancel,
  onSave,
}: {
  visible: boolean;
  exerciseName: string;
  setNumber: number;
  setTotal: number;
  elapsed: number;
  reps: string;
  weight: string;
  needsWeight: boolean;
  targetReps: string;
  onReps: (value: string) => void;
  onWeight: (value: string) => void;
  onAdjustReps: (delta: number) => void;
  onAdjustWeight: (delta: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onCancel} />
        <View style={styles.setEntrySheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.setEntryHeadText}>
              <Text style={styles.sheetKicker}>Log set {setNumber} of {setTotal}</Text>
              <Text style={styles.sheetTitle} numberOfLines={1}>{exerciseName}</Text>
              <Text style={styles.sheetSub}>Time under work: {formatTimer(elapsed)}</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.setEntryTarget}>
            <Feather name="target" size={18} color={colors.accentDark} />
            <Text style={styles.setEntryTargetText}>Target: {targetReps}</Text>
          </View>

          <View style={styles.sheetInputStack}>
            <View style={styles.sheetInputGroup}>
              <Text style={styles.logInputLabel}>Reps completed</Text>
              <View style={styles.sheetStepperInputRow}>
                <TouchableOpacity onPress={() => onAdjustReps(-1)} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Decrease reps">
                  <Feather name="minus" size={20} color={colors.accentDark} />
                </TouchableOpacity>
                <TextInput
                  value={reps}
                  onChangeText={onReps}
                  keyboardType="number-pad"
                  placeholder={targetReps}
                  placeholderTextColor={colors.inkSubtle}
                  style={styles.sheetLogInput}
                  textAlign="center"
                />
                <TouchableOpacity onPress={() => onAdjustReps(1)} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Increase reps">
                  <Feather name="plus" size={20} color={colors.accentDark} />
                </TouchableOpacity>
              </View>
            </View>

            {needsWeight ? (
              <View style={styles.sheetInputGroup}>
                <Text style={styles.logInputLabel}>Weight used</Text>
                <View style={styles.sheetStepperInputRow}>
                  <TouchableOpacity onPress={() => onAdjustWeight(-1)} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Decrease weight">
                    <Feather name="minus" size={20} color={colors.accentDark} />
                  </TouchableOpacity>
                  <TextInput
                    value={weight}
                    onChangeText={onWeight}
                    keyboardType="decimal-pad"
                    placeholder="0 kg"
                    placeholderTextColor={colors.inkSubtle}
                    style={styles.sheetLogInput}
                    textAlign="center"
                  />
                  <TouchableOpacity onPress={() => onAdjustWeight(1)} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Increase weight">
                    <Feather name="plus" size={20} color={colors.accentDark} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.sheetActionRow}>
            <TouchableOpacity onPress={onCancel} style={styles.sheetSecondaryButton} accessibilityRole="button" accessibilityLabel="Resume set">
              <Text style={styles.sheetSecondaryText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={styles.sheetSaveButton} accessibilityRole="button" accessibilityLabel="Save set">
              <Text style={styles.sheetSaveText}>Save set</Text>
              <Feather name="arrow-right" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RewardOverlay({ reward, onDone }: { reward: RewardState; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.82)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!reward) return;
    scale.setValue(0.82);
    opacity.setValue(0);
    lift.setValue(24);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      Animated.delay(reward.type === 'set' ? 420 : 760),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [lift, onDone, opacity, reward, scale]);

  if (!reward) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.rewardOverlay, { opacity }]}>
      <Animated.View style={[styles.rewardCard, { transform: [{ scale }, { translateY: lift }] }]}>
        <View style={styles.rewardIcon}>
          <Feather name={reward.type === 'set' ? 'plus' : reward.type === 'feedback' ? 'message-square' : reward.type === 'movement' ? 'check' : 'award'} size={26} color={colors.white} />
        </View>
        <Text style={styles.rewardTitle}>{reward.title}</Text>
        <Text style={styles.rewardSubtitle}>{reward.subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerPad: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.subtitle, color: colors.ink },
  headerSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  feedbackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
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
  sessionProgress: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  sessionProgressText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sessionProgressLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  executionShell: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: 30,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  executionShellCompact: {
    padding: spacing.md,
    borderRadius: 26,
  },
  restCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: colors.accentDarker,
    padding: spacing.lg,
  },
  restIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginBottom: spacing.lg,
  },
  restKicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  restTimer: { fontSize: 78, lineHeight: 86, fontWeight: '900', color: colors.white, marginTop: spacing.sm },
  restText: { ...typography.body, color: colors.onAccentMuted, textAlign: 'center', marginTop: spacing.sm },
  restActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  restSmallButton: {
    minWidth: 96,
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  restSmallButtonText: { ...typography.bodyBold, color: colors.white },
  movementHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prescriptionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  prescriptionPill: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  prescriptionLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  prescriptionValue: { ...typography.subtitle, color: colors.ink, marginTop: 4 },
  setLogPanel: {
    borderRadius: 24,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  setLogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  setLogTitle: { ...typography.subtitle, color: colors.ink },
  setLogMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  setLogBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  setRunRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setRunMetric: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  setRunLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  setRunValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  setCompactMeta: { ...typography.bodyBold, color: colors.accentDark, marginTop: spacing.xs },
  logInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  logInputGroup: {
    flex: 1,
    minWidth: 0,
  },
  logInputGroupSplit: {
    flexBasis: 0,
  },
  logInputLabel: { ...typography.caption, color: colors.accentDark, fontWeight: '900', marginBottom: 6 },
  stepperInputRow: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  logInput: {
    flex: 1,
    minWidth: 42,
    paddingHorizontal: 4,
    paddingVertical: 0,
    ...typography.subtitle,
    color: colors.ink,
  },
  lastLogText: { ...typography.caption, color: colors.accentDark, fontWeight: '800', marginTop: spacing.xs },
  statusPanel: {
    borderRadius: 24,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  statusTitle: { ...typography.subtitle, color: colors.ink },
  statusMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  primarySessionButton: {
    height: 78,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  restPrimaryButton: { backgroundColor: colors.accentDark },
  donePrimaryButton: { backgroundColor: colors.accent },
  primarySessionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySessionText: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: colors.white, maxWidth: '58%' },
  primarySessionLabelBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '58%',
  },
  primarySessionSubText: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '800', marginTop: 1 },
  activeActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pauseSessionButton: {
    flex: 0.9,
    minHeight: 74,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pauseSessionText: { fontSize: 18, lineHeight: 23, fontWeight: '900', color: colors.accentDark },
  completeSessionButton: {
    flex: 1.25,
    minHeight: 74,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 7,
  },
  completeSessionText: { fontSize: 19, lineHeight: 24, fontWeight: '900', color: colors.white },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondarySessionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  secondarySessionText: { ...typography.caption, color: colors.accentDark, fontWeight: '900' },
  stepShell: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  stepShellCompact: {
    borderRadius: 24,
    padding: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  stepperDot: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  stepperDotDone: {
    backgroundColor: colors.accentSurface,
  },
  stepperDotActive: {
    height: 7,
    backgroundColor: colors.accent,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepFlowButton: {
    minWidth: 62,
    height: 38,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: spacing.sm,
  },
  stepFlowText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  videoStepCard: {
    minHeight: 104,
    borderRadius: 26,
    backgroundColor: colors.inkStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  videoStepCardCompact: {
    minHeight: 108,
    borderRadius: 22,
    padding: spacing.sm,
  },
  videoStepIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoStepText: { flex: 1 },
  videoStepKicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  videoStepTitle: { ...typography.subtitle, color: colors.white, marginTop: 4 },
  videoStepMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: 4 },
  stepSetPanel: {
    borderRadius: 22,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  stepSetPanelCompact: {
    padding: 10,
    marginTop: 5,
  },
  stepNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    marginTop: spacing.xs,
  },
  stepNoteCompact: {
    paddingVertical: 7,
    marginTop: 5,
  },
  stepFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  stepFooterCompact: {
    paddingTop: 6,
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sessionHero: {
    borderRadius: 24,
    backgroundColor: colors.inkStrong,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressBlock: { marginTop: spacing.sm },
  activeCard: {
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  activeStep: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStepText: { ...typography.subtitle, color: colors.accentDark, fontWeight: '800' },
  activeText: { flex: 1 },
  activeKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  activeName: { fontSize: 31, lineHeight: 37, fontWeight: '900', color: colors.ink, marginTop: spacing.sm },
  activeStatus: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  activeStatusDone: { backgroundColor: colors.accent },
  activeStatusLive: { backgroundColor: colors.warn },
  videoBox: { alignItems: 'center', justifyContent: 'center' },
  videoActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  videoActionButton: { flex: 1 },
  prescription: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  setTracker: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  setTrackerHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  setTrackerTitle: { ...typography.subtitle, color: colors.ink },
  setTrackerMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  inlineFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  inlineFeedbackText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  setDots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  setDot: {
    width: 30,
    height: 30,
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
  coachNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  notes: { ...typography.body, color: colors.accentDarker, flex: 1 },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  navButton: { flex: 1 },
  flowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  flowButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  flowButtonText: { flex: 1 },
  flowButtonTitle: { ...typography.bodyBold, color: colors.ink },
  flowButtonMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  exerciseList: { gap: spacing.sm },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  exerciseRowActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  exerciseNum: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  exerciseNumDone: { backgroundColor: colors.accent },
  exerciseNumActive: { backgroundColor: colors.white },
  exerciseNumText: { ...typography.bodyBold, color: colors.inkMuted },
  exerciseNumTextActive: { color: colors.accentDark },
  exerciseRowText: { flex: 1 },
  exerciseRowTitle: { ...typography.bodyBold, color: colors.ink },
  exerciseRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  feedbackSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  setEntrySheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  setEntryHeadText: { flex: 1 },
  setEntryTarget: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  setEntryTargetText: { ...typography.bodyBold, color: colors.accentDark },
  sheetInputStack: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sheetInputGroup: {
    gap: 6,
  },
  sheetStepperInputRow: {
    minHeight: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  sheetStepperButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  sheetLogInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: colors.ink,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetSecondaryButton: {
    flex: 0.82,
    minHeight: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: { ...typography.bodyBold, color: colors.inkMuted },
  sheetSaveButton: {
    flex: 1.18,
    minHeight: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sheetSaveText: { ...typography.bodyBold, color: colors.white },
  flowSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  statsSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  statsSummaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statsSummaryCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  statsSummaryValue: { ...typography.subtitle, color: colors.accentDark },
  statsSummaryLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', marginTop: 2 },
  statsList: { gap: spacing.sm, paddingBottom: spacing.md },
  statsExerciseCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statsExerciseCardDone: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentSurface,
  },
  statsExerciseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loggedSetList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  loggedSetPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  loggedSetText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  sheetKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  sheetTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  sheetSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  sentimentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  sentimentButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sentimentSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  sentimentText: { ...typography.bodyBold, color: colors.accentDark },
  sentimentTextSelected: { color: colors.white },
  feedbackInput: {
    minHeight: 118,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
    ...typography.body,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  rewardOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  rewardCard: {
    minWidth: 240,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
  rewardIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rewardTitle: { ...typography.title, color: colors.ink, textAlign: 'center' },
  rewardSubtitle: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: 4 },
});
