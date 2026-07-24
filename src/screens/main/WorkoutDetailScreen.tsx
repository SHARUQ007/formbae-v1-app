import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ProgressBar } from '../../components/ProgressBar';
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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function modeCopy(mode: 'standard' | 'quick') {
  if (mode === 'quick') {
    return {
      eyebrow: 'Short on time',
    };
  }
  return {
    eyebrow: "Today's workout",
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reward, setReward] = useState<RewardState>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<WorkoutFeedbackSentiment | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const { status } = useAuthStore();
  const timer = useRestTimer(() => {
    displayLocalNotification('Rest complete', 'Time for your next set.').catch(() => undefined);
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
      setActiveIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout');
    } finally {
      setLoading(false);
    }
  }, [planDayId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const trackableExercises = useMemo(
    () => (detail?.exercises ?? []).filter((exercise) => !isSectionMarker(exercise.notes)),
    [detail],
  );

  const completedTrackableCount = useMemo(
    () => trackableExercises.filter((exercise) => completed.has(exercise.exerciseId)).length,
    [completed, trackableExercises],
  );

  const progress = trackableExercises.length ? completedTrackableCount / trackableExercises.length : 0;
  const activeExercise = trackableExercises[Math.min(activeIndex, Math.max(0, trackableExercises.length - 1))] || null;
  const activeExerciseIndex = activeExercise ? trackableExercises.findIndex((exercise) => exercise.exerciseId === activeExercise.exerciseId) : 0;
  const activeDone = activeExercise ? completed.has(activeExercise.exerciseId) : false;
  const activeSets = Math.max(1, Number(activeExercise?.sets || 1));
  const activeSetCount = activeExercise ? Math.min(activeSets, setProgress[activeExercise.exerciseId] || 0) : 0;
  const activeRest = Number(activeExercise?.restSec || 0);
  const activeNotes = cleanExerciseNotes(activeExercise?.notes || '');
  const copy = modeCopy(mode);
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
      setReward({
        id: Date.now(),
        type: 'movement',
        title: 'Movement complete',
        subtitle: `${activeExercise.exerciseName} done.`,
      });
      await completeActiveExercise(nextSets);
    } else {
      setReward({
        id: Date.now(),
        type: 'set',
        title: `Set ${nextCount} logged`,
        subtitle: `${activeSets - nextCount} set${activeSets - nextCount === 1 ? '' : 's'} left.`,
      });
    }
  };

  const markActiveComplete = async () => {
    if (!activeExercise) return;
    const nextSets = { ...setProgress, [activeExercise.exerciseId]: activeSets };
    setSetProgress(nextSets);
    setReward({
      id: Date.now(),
      type: 'movement',
      title: 'Movement complete',
      subtitle: `${activeExercise.exerciseName} done.`,
    });
    await completeActiveExercise(nextSets);
  };

  const moveToExercise = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(trackableExercises.length - 1, index)));
  };

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
        subtitle={`Day ${detail.dayNumber} - ${detail.focus || detail.planTitle}`}
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

      <View style={[styles.stepProgressCard, compactStep && styles.stepProgressCardCompact]}>
        <View style={styles.progressTop}>
          <Text style={styles.progressLabel}>Session progress</Text>
          <Text style={styles.heroCount}>{completedTrackableCount}/{trackableExercises.length}</Text>
        </View>
        <View style={styles.progressTop}>
          <Text style={styles.progressSubLabel}>Overall completion</Text>
          <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
        </View>
        <ProgressBar value={progress} />
      </View>

      <View style={[styles.stepShell, compactStep && styles.stepShellCompact]}>
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

        <View style={styles.stepHeader}>
          <View style={styles.activeStep}>
            <Text style={styles.activeStepText}>{activeExerciseIndex + 1}</Text>
          </View>
          <View style={styles.activeText}>
            <Text style={styles.activeKicker} numberOfLines={1}>{getSectionLabel(activeExercise.notes, detail.focus || 'Workout')}</Text>
            <Text style={styles.activeName} numberOfLines={2}>{activeExercise.exerciseName}</Text>
          </View>
          <TouchableOpacity onPress={() => setFlowOpen(true)} style={styles.stepFlowButton} accessibilityRole="button" accessibilityLabel="Open workout flow">
            <Text style={styles.stepFlowText}>{activeExerciseIndex + 1}/{trackableExercises.length}</Text>
            <Feather name="list" size={16} color={colors.accentDark} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => openExerciseVideo(activeExercise)}
          activeOpacity={0.86}
          style={[styles.videoStepCard, compactStep && styles.videoStepCardCompact]}
          accessibilityRole="button"
          accessibilityLabel={`Open video for ${activeExercise.exerciseName}`}
        >
          <View style={styles.videoStepIcon}>
            <Feather name="play" size={24} color={colors.white} />
          </View>
          <View style={styles.videoStepText}>
            <Text style={styles.videoStepKicker}>Technique video</Text>
            <Text style={styles.videoStepTitle} numberOfLines={2}>Watch form before logging sets</Text>
            <Text style={styles.videoStepMeta} numberOfLines={1}>{activeExercise.exerciseName}</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.accentDark} />
        </TouchableOpacity>

        <View style={[styles.stepCue, compactStep && styles.stepCueCompact]}>
          <Feather name="target" size={16} color={colors.accentDark} />
          <Text style={styles.stepCueText} numberOfLines={1}>Movement {activeExerciseIndex + 1} of {trackableExercises.length}</Text>
        </View>

        <View style={[styles.stepToolbar, compactStep && styles.stepToolbarCompact]}>
          <TouchableOpacity
            onPress={() => openExerciseVideo(activeExercise)}
            style={styles.stepToolWide}
          >
            <Feather name="play-circle" size={16} color={colors.accentDark} />
            <Text style={styles.stepToolText}>Open video</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFeedbackOpen(true)} style={styles.stepTool}>
            <Feather name="message-circle" size={16} color={colors.accentDark} />
            <Text style={styles.stepToolText}>Feedback</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.stepMetaGrid, compactStep && styles.stepMetaGridCompact]}>
          <MetricTile label="Sets" value={String(activeSets)} />
          <MetricTile label="Reps / time" value={displayValue(activeExercise.reps)} />
          <MetricTile label="Rest" value={`${displayValue(activeExercise.restSec, '0')}s`} />
        </View>

        <View style={[styles.stepSetPanel, compactStep && styles.stepSetPanelCompact]}>
          <View style={styles.setTrackerHead}>
            <View>
              <Text style={styles.setTrackerTitle}>Set progress</Text>
              <Text style={styles.setTrackerMeta}>{activeSetCount}/{activeSets} complete</Text>
            </View>
            <View style={[styles.activeStatus, activeDone && styles.activeStatusDone]}>
              <Feather name={activeDone ? 'check' : 'activity'} size={16} color={activeDone ? colors.white : colors.accent} />
            </View>
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
          />
        </View>

        {activeNotes ? (
          <View style={[styles.stepNote, compactStep && styles.stepNoteCompact]}>
            <Feather name="info" size={15} color={colors.accentDark} />
            <Text style={styles.notes} numberOfLines={compactStep ? 1 : 2}>{activeNotes}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.stepFooter, compactStep && styles.stepFooterCompact, { paddingBottom: insets.bottom + spacing.sm }]}>
        <PrimaryButton
          title="Previous"
          icon="chevron-left"
          variant="secondary"
          onPress={() => moveToExercise(activeExerciseIndex - 1)}
          disabled={activeExerciseIndex <= 0}
          style={styles.navButton}
        />
        <PrimaryButton
          title={activeExerciseIndex >= trackableExercises.length - 1 ? 'Finish' : 'Next movement'}
          icon={activeExerciseIndex >= trackableExercises.length - 1 ? 'flag' : 'chevron-right'}
          onPress={activeExerciseIndex >= trackableExercises.length - 1 ? onFinish : () => moveToExercise(activeExerciseIndex + 1)}
          loading={finishing}
          style={styles.navButton}
        />
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
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
  stepProgressCard: {
    borderRadius: 22,
    backgroundColor: colors.inkStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  stepProgressCardCompact: {
    paddingVertical: 10,
    marginBottom: 6,
  },
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
    minHeight: 126,
    borderRadius: 26,
    backgroundColor: colors.inkStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.xs,
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
  stepCue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    marginTop: spacing.xs,
  },
  stepCueCompact: {
    paddingVertical: 7,
  },
  stepCueText: {
    ...typography.caption,
    color: colors.accentDarker,
    fontWeight: '800',
    flex: 1,
  },
  stepToolbar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  stepToolbarCompact: {
    marginTop: 5,
  },
  stepTool: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  stepToolWide: {
    flex: 1.25,
    minHeight: 42,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  stepToolDisabled: {
    backgroundColor: colors.panelMuted,
    borderColor: colors.border,
  },
  stepToolText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  stepToolTextDisabled: { color: colors.inkSubtle },
  stepMetaGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  stepMetaGridCompact: {
    marginTop: 5,
  },
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
  heroCount: { ...typography.bodyBold, color: colors.onAccentMuted },
  progressBlock: { marginTop: spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { ...typography.subtitle, color: colors.white },
  progressSubLabel: { ...typography.caption, color: colors.onAccentMuted },
  progressPct: { ...typography.bodyBold, color: colors.white },
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
  activeName: { ...typography.title, color: colors.ink, marginTop: 1 },
  activeStatus: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  activeStatusDone: { backgroundColor: colors.accent },
  videoBox: { alignItems: 'center', justifyContent: 'center' },
  videoActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  videoActionButton: { flex: 1 },
  prescription: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  metricTile: {
    flex: 1,
    minHeight: 60,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  metricLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 5 },
  metricValue: { ...typography.bodyBold, color: colors.ink, fontWeight: '800' },
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
  flowSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
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
