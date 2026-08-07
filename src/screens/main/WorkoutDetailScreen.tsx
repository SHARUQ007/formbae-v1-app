import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { TechniqueVideoBackdrop } from '../../components/TechniqueVideoBackdrop';
import { loadWorkoutDayCached } from '../../services/preloadService';
import { resolveWorkoutVideo } from '../../services/workoutService';
import { submitWorkoutFeedback, type WorkoutFeedbackSentiment } from '../../services/workoutFeedbackService';
import {
  completeWithQueue,
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress,
} from '../../store/workoutStore';
import { useRestTimer } from '../../hooks/useRestTimer';
import { deriveWorkoutResumeIndex, remainingRestSeconds } from '../../hooks/useWorkoutSession';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import type { WorkoutDayDetail, WorkoutExerciseDetail } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { isPlayableVideo } from '../../utils/video';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

type RewardType = 'set' | 'movement' | 'workout';
type RewardState = { id: number; type: RewardType; title: string; subtitle: string } | null;
type SetLog = { setNumber: number; reps: string; weight: string; durationSec?: number };

function videoResolveKey(exercise: WorkoutExerciseDetail) {
  return `${exercise.exerciseId || ''}:${exercise.exerciseName}:${exercise.order}`;
}

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

const EXERCISE_FOCUS_RULES: Array<{ label: string; re: RegExp }> = [
  { label: 'Chest', re: /\b(bench|chest|push[- ]?up|press)\b/i },
  { label: 'Shoulders', re: /\b(shoulder|overhead|lateral|front raise)\b/i },
  { label: 'Back', re: /\b(row|pull[- ]?up|pulldown|lat|back)\b/i },
  { label: 'Legs', re: /\b(squat|lunge|leg press|step[- ]?up|quad)\b/i },
  { label: 'Glutes', re: /\b(glute|hip thrust|bridge|deadlift|hinge)\b/i },
  { label: 'Core', re: /\b(core|plank|crunch|dead bug|hollow)\b/i },
  { label: 'Conditioning', re: /\b(cardio|interval|run|walk|treadmill|conditioning)\b/i },
  { label: 'Mobility', re: /\b(stretch|mobility|warm[- ]?up|cool[- ]?down)\b/i },
];
const PENDING_STREAK_CELEBRATION_KEY = 'formbae_pending_workout_streak_celebration';

function exerciseFocusTags(exercise?: WorkoutExerciseDetail | null, day?: WorkoutDayDetail | null) {
  const haystack = `${exercise?.exerciseName || ''} ${exercise?.notes || ''} ${day?.focus || ''}`;
  const tags = EXERCISE_FOCUS_RULES.filter((rule) => rule.re.test(haystack)).map((rule) => rule.label);
  return Array.from(new Set(tags)).slice(0, 3);
}

function exerciseCues(notes: string, exercise?: WorkoutExerciseDetail | null) {
  const cues = notes
    .split(/[.·]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 10)
    .slice(0, 2);
  if (cues.length) return cues;
  const name = String(exercise?.exerciseName || '').toLowerCase();
  if (name.includes('squat')) return ['Brace before each rep and keep knees tracking over toes.', 'Use a controlled descent, then drive through the floor.'];
  if (name.includes('press')) return ['Set your shoulder blades before the first rep.', 'Control the weight down, then press with a steady path.'];
  if (name.includes('row')) return ['Keep your torso stable and pull with your elbow.', 'Pause briefly at the top before lowering with control.'];
  if (name.includes('deadlift')) return ['Brace hard before lifting and keep the bar close.', 'Hinge from the hips and finish tall without overextending.'];
  return ['Move with control and stop the set if form breaks.', 'Match the target reps while keeping breathing steady.'];
}

function exerciseBenefit(exercise?: WorkoutExerciseDetail | null, tags: string[] = []) {
  const text = `${exercise?.exerciseName || ''} ${exercise?.notes || ''}`.toLowerCase();
  if (tags.includes('Conditioning')) return 'Builds work capacity and keeps your heart rate up without overcomplicating the session.';
  if (tags.includes('Mobility')) return 'Improves range of motion so the rest of your training feels cleaner.';
  if (text.includes('squat') || tags.includes('Legs')) return 'Builds lower-body strength while training bracing, balance, and control.';
  if (text.includes('press') || tags.includes('Chest') || tags.includes('Shoulders')) return 'Builds pressing strength and upper-body control for today’s session.';
  if (text.includes('row') || tags.includes('Back')) return 'Balances pressing work and strengthens your pulling pattern.';
  return 'Keeps today’s workout aligned with your plan and current training level.';
}

function displayValue(value: string, fallback = '-') {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
}

function exerciseWithSelectedAlternate(exercise: WorkoutExerciseDetail, selectedIndex?: number): WorkoutExerciseDetail {
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
  const { planDayId, mode = 'standard', initialDetail } = route.params;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const compactStep = windowHeight < 760;
  const [detail, setDetail] = useState<WorkoutDayDetail | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [setProgress, setSetProgress] = useState<Record<string, number>>({});
  const [setLogs, setSetLogs] = useState<Record<string, SetLog[]>>({});
  const [selectedAlternates, setSelectedAlternates] = useState<Record<string, number>>({});
  const [repInput, setRepInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [movementStarted, setMovementStarted] = useState(false);
  const [setEntryOpen, setSetEntryOpen] = useState(false);
  const [setPaused, setSetPaused] = useState(false);
  const [setElapsed, setSetElapsed] = useState(0);
  const [workoutCompleteOpen, setWorkoutCompleteOpen] = useState(false);
  const [pendingNextIndex, setPendingNextIndex] = useState<number | null>(null);
  const [restoration, setRestoration] = useState<{ nextIndex: number; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reward, setReward] = useState<RewardState>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] = useState<WorkoutFeedbackSentiment>('up');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [resolvedVideoUrls, setResolvedVideoUrls] = useState<Record<string, string>>({});
  const [resolvingVideoKeys, setResolvingVideoKeys] = useState<Set<string>>(new Set());
  const pendingNextIndexRef = useRef<number | null>(null);
  const resolvingVideoRequestsRef = useRef<Map<string, Promise<string>>>(new Map());

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

  const timer = useRestTimer(() => {
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
      const data = initialDetail?.planDayId === planDayId ? initialDetail : await loadWorkoutDayCached(planDayId, mode);
      setDetail(data);
      const saved = await loadWorkoutProgress(planDayId);
      setCompleted(new Set(saved.completedExerciseIds));
      setSetProgress(saved.setProgressByExercise || {});
      setSetLogs(saved.setLogsByExercise || {});
      setSelectedAlternates(saved.selectedAlternatesByExercise || {});
      const resumedExercises = data.exercises
        .filter((exercise) => !isSectionMarker(exercise.notes))
        .map((exercise) => exerciseWithSelectedAlternate(exercise, saved.selectedAlternatesByExercise?.[exercise.exerciseId]));
      const resumeIndex = deriveWorkoutResumeIndex(resumedExercises, saved);
      setActiveIndex(resumeIndex);
      setMovementStarted(false);
      setSetEntryOpen(false);
      setSetPaused(false);
      setSetElapsed(0);
      setWorkoutCompleteOpen(false);
      setPendingNextIndex(null);
      pendingNextIndexRef.current = null;
      const remainingRest = remainingRestSeconds(saved.rest);
      const restIndex = saved.rest ? resumedExercises.findIndex((exercise) => exercise.exerciseId === saved.rest?.nextExerciseId) : -1;
      setRestoration(remainingRest > 0 && restIndex >= 0 ? { nextIndex: restIndex, remaining: remainingRest } : null);
      setResolvedVideoUrls({});
      setResolvingVideoKeys(new Set());
      resolvingVideoRequestsRef.current.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workout');
    } finally {
      setLoading(false);
    }
  }, [initialDetail, planDayId, mode]);

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
    () => (detail?.exercises ?? [])
      .filter((exercise) => !isSectionMarker(exercise.notes))
      .map((exercise) => exerciseWithSelectedAlternate(exercise, selectedAlternates[exercise.exerciseId])),
    [detail, selectedAlternates],
  );

  useEffect(() => {
    if (!restoration || !trackableExercises.length) return;
    pendingNextIndexRef.current = restoration.nextIndex;
    setPendingNextIndex(restoration.nextIndex);
    setActiveIndex(restoration.nextIndex);
    timer.start(restoration.remaining);
    setRestoration(null);
  }, [restoration, timer, trackableExercises.length]);

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
  const activeFocusTags = exerciseFocusTags(activeExercise, detail);
  const activeCues = exerciseCues(activeNotes, activeExercise);
  const activeBenefit = exerciseBenefit(activeExercise, activeFocusTags);
  const activeVideoKey = activeExercise ? videoResolveKey(activeExercise) : '';
  const activeVideoResolving = activeVideoKey ? resolvingVideoKeys.has(activeVideoKey) : false;
  const activeNeedsWeight = isWeightedExercise(activeExercise);
  const activeSetLogs = useMemo(() => (activeExerciseId ? setLogs[activeExerciseId] || [] : []), [activeExerciseId, setLogs]);
  const activeLastLog = activeSetLogs[activeSetCount - 1];
  const copy = modeCopy(mode);
  const restTargetIndex = pendingNextIndex ?? pendingNextIndexRef.current;
  const restTargetExercise = restTargetIndex !== null && restTargetIndex !== undefined ? trackableExercises[restTargetIndex] : null;
  const restTargetLabel = restTargetIndex === activeExerciseIndex && activeExercise
    ? `Set ${Math.min(activeSets, activeSetCount + 1)} of ${activeExercise.exerciseName}`
    : restTargetExercise?.exerciseName || 'finish workout';

  const videoUrlForExercise = useCallback(
    (exercise: WorkoutExerciseDetail) => resolvedVideoUrls[videoResolveKey(exercise)] || exercise.videoUrl || '',
    [resolvedVideoUrls],
  );

  const workoutVideos = useMemo(
    () => trackableExercises
      .map((exercise) => ({
        exercise,
        videoUrl: videoUrlForExercise(exercise),
      }))
      .filter(({ videoUrl }) => isPlayableVideo(videoUrl))
      .map((exercise) => ({
        id: videoResolveKey(exercise.exercise),
        title: exercise.exercise.exerciseName,
        subtitle: getSectionLabel(exercise.exercise.notes, detail?.focus || 'Workout'),
        videoUrl: exercise.videoUrl,
      })),
    [detail?.focus, trackableExercises, videoUrlForExercise],
  );

  const resolveExerciseVideo = useCallback(
    async (exercise: WorkoutExerciseDetail) => {
      const existingUrl = videoUrlForExercise(exercise);
      if (isPlayableVideo(existingUrl)) return existingUrl;
      if (!detail?.planDayId) return '';

      const key = videoResolveKey(exercise);
      const pendingRequest = resolvingVideoRequestsRef.current.get(key);
      if (pendingRequest) return pendingRequest;
      setResolvingVideoKeys((value) => new Set(value).add(key));
      const request = (async () => {
        try {
          const result = await resolveWorkoutVideo({
            planDayId: detail.planDayId,
            workoutMode: detail.workoutMode,
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            order: exercise.order,
            focus: detail.focus,
          });
          const nextUrl = result.videoUrl || '';
          if (!isPlayableVideo(nextUrl)) return '';
          setResolvedVideoUrls((value) => ({ ...value, [key]: nextUrl }));
          setDetail((value) => value
            ? {
                ...value,
                exercises: value.exercises.map((entry) => (
                  videoResolveKey(entry) === key ? { ...entry, videoUrl: nextUrl } : entry
                )),
              }
            : value);
          return nextUrl;
        } catch {
          return '';
        } finally {
          resolvingVideoRequestsRef.current.delete(key);
          setResolvingVideoKeys((value) => {
            const next = new Set(value);
            next.delete(key);
            return next;
          });
        }
      })();
      resolvingVideoRequestsRef.current.set(key, request);
      return request;
    },
    [detail?.focus, detail?.planDayId, detail?.workoutMode, videoUrlForExercise],
  );

  useEffect(() => {
    if (!activeExercise) return;
    if (isPlayableVideo(videoUrlForExercise(activeExercise))) return;
    resolveExerciseVideo(activeExercise).catch(() => undefined);
  }, [activeExercise, resolveExerciseVideo, videoUrlForExercise]);

  const openExerciseVideo = useCallback(
    async (exercise: WorkoutExerciseDetail) => {
      let resolvedUrl = videoUrlForExercise(exercise);
      if (!isPlayableVideo(resolvedUrl)) {
        resolvedUrl = await resolveExerciseVideo(exercise);
      }
      if (!isPlayableVideo(resolvedUrl)) {
        Alert.alert('Video is still being prepared', 'Try again in a moment. We are searching for the best technique video for this movement.');
        return;
      }
      const currentItem = {
        id: videoResolveKey(exercise),
        title: exercise.exerciseName,
        subtitle: getSectionLabel(exercise.notes, detail?.focus || 'Workout'),
        videoUrl: resolvedUrl,
      };
      const videos = workoutVideos.some((item) => item.id === currentItem.id) ? workoutVideos : [currentItem, ...workoutVideos];
      const initialIndex = Math.max(0, videos.findIndex((item) => item.id === currentItem.id));
      navigation.navigate('WorkoutVideo', {
        title: exercise.exerciseName,
        subtitle: getSectionLabel(exercise.notes, detail?.focus || 'Workout'),
        videoUrl: resolvedUrl,
        videos,
        initialIndex,
      });
    },
    [detail?.focus, navigation, resolveExerciseVideo, videoUrlForExercise, workoutVideos],
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
        selectedAlternatesByExercise: selectedAlternates,
        updatedAt: new Date().toISOString(),
      });
    },
    [completed, planDayId, selectedAlternates, setLogs],
  );

  const submitActiveFeedback = async () => {
    if (!activeExercise || !detail || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      await submitWorkoutFeedback({
        planId: detail.planId,
        planDayId: detail.planDayId,
        workoutMode: detail.workoutMode,
        sentiment: feedbackSentiment,
        feedbackText: feedbackText.trim(),
        exerciseId: activeExercise.exerciseId,
      });
      setFeedbackOpen(false);
      setFeedbackText('');
      setFeedbackSentiment('up');
      setReward({
        id: Date.now(),
        type: 'set',
        title: 'Feedback saved',
        subtitle: 'Your trainer will use this for future plan updates.',
      });
    } catch (submitError) {
      Alert.alert('Could not save feedback', submitError instanceof Error ? submitError.message : 'Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

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
    const completesWorkout = movementComplete && activeExerciseIndex + 1 >= trackableExercises.length;
    if (!completesWorkout) {
      setReward({
        id: Date.now(),
        type: movementComplete ? 'movement' : 'set',
        title: movementComplete ? 'Movement complete' : `Set ${nextSetCount} logged`,
        subtitle: movementComplete
          ? `${activeExercise.exerciseName} done.`
          : `${activeSets - nextSetCount} set${activeSets - nextSetCount === 1 ? '' : 's'} left.`,
      });
    }

    if (movementComplete) {
      await completeActiveExercise(nextSets, nextLogs);
    } else {
      await persistSets(nextSets, completed, nextLogs);
    }

    const nextIndex = movementComplete ? activeExerciseIndex + 1 : activeExerciseIndex;
    if (completesWorkout) {
      setWorkoutCompleteOpen(true);
      return;
    }
    if (activeRest > 0) {
      pendingNextIndexRef.current = nextIndex;
      setPendingNextIndex(nextIndex);
      timer.start(activeRest);
      await saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(movementComplete ? new Set([...completed, activeExercise.exerciseId]) : completed),
        setProgressByExercise: nextSets,
        setLogsByExercise: nextLogs,
        selectedAlternatesByExercise: selectedAlternates,
        activeExerciseId: trackableExercises[nextIndex]?.exerciseId,
        rest: {
          nextExerciseId: trackableExercises[nextIndex]?.exerciseId || activeExercise.exerciseId,
          startedAt: Date.now(),
          durationSec: activeRest,
        },
        updatedAt: new Date().toISOString(),
      });
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
      void saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(completed),
        setProgressByExercise: setProgress,
        setLogsByExercise: setLogs,
        selectedAlternatesByExercise: selectedAlternates,
        activeExerciseId: trackableExercises[nextIndex]?.exerciseId,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const addRestTime = () => {
    timer.addTime(15);
    const nextExerciseId = restTargetExercise?.exerciseId;
    if (!nextExerciseId) return;
    void saveWorkoutProgress({
      planDayId,
      completedExerciseIds: Array.from(completed),
      setProgressByExercise: setProgress,
      setLogsByExercise: setLogs,
      selectedAlternatesByExercise: selectedAlternates,
      activeExerciseId: nextExerciseId,
      rest: {
        nextExerciseId,
        startedAt: Date.now(),
        durationSec: timer.remaining + 15,
      },
      updatedAt: new Date().toISOString(),
    });
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
      const result = await completeWithQueue({
        planId: detail.planId,
        planDayId: detail.planDayId,
        action: 'day',
        workoutMode: detail.workoutMode,
      });
      await clearWorkoutProgress(planDayId);
      await AsyncStorage.setItem(
        PENDING_STREAK_CELEBRATION_KEY,
        JSON.stringify({ planDayId: detail.planDayId, completedAt: Date.now() }),
      ).catch(() => undefined);
      if (!result.synced) {
        Alert.alert('Saved offline', 'Your workout will sync when you are back online.');
      }
      navigation.popToTop();
    } finally {
      setFinishing(false);
    }
  }, [detail, planDayId, navigation]);

  const leaveWorkout = () => {
    if (!movementStarted && !timer.running) {
      navigation.goBack();
      return;
    }
    Alert.alert('Pause workout?', 'Your current progress is saved. You can resume from this set anytime.', [
      { text: 'Keep training', style: 'cancel' },
      { text: 'Pause workout', onPress: () => navigation.goBack() },
    ]);
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
        <Header onBack={leaveWorkout} title="Workout" />
        <ErrorState message={error || 'Workout not found'} onRetry={load} />
      </View>
    );
  }

  if (!activeExercise) {
    return (
      <View style={[styles.container, styles.centerPad, { paddingTop: insets.top }]}>
        <RewardOverlay reward={reward} onDone={clearReward} />
        <Header onBack={leaveWorkout} title={`Day ${detail.dayNumber}`} subtitle={detail.focus || detail.planTitle} />
        <EmptyState icon="coffee" title="Rest day" message="No movements for this day. Recover well!" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <RewardOverlay reward={reward} onDone={clearReward} />
      <WorkoutCompleteScreen
        visible={workoutCompleteOpen}
        title={detail.focus || detail.planTitle || 'Workout'}
        movementCount={trackableExercises.length}
        onContinue={onFinish}
        finishing={finishing}
      />
      <Header
        onBack={leaveWorkout}
        title={copy.eyebrow}
        right={(
          <TouchableOpacity
            onPress={() => setFeedbackOpen(true)}
            style={styles.feedbackButton}
            accessibilityRole="button"
            accessibilityLabel={`Give feedback for ${activeExercise.exerciseName}`}
          >
            <Feather name="message-circle" size={20} color={colors.ink} />
          </TouchableOpacity>
        )}
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

      <View style={[styles.executionShell, compactStep && styles.executionShellCompact, movementStarted && styles.executionShellActive]}>
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

          {!movementStarted ? (
            <ScrollView
              style={styles.prepScroller}
              contentContainerStyle={styles.prepContent}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                onPress={() => openExerciseVideo(activeExercise)}
                activeOpacity={0.86}
                style={styles.videoStepCardLarge}
                accessibilityRole="button"
                accessibilityLabel={`Open video for ${activeExercise.exerciseName}`}
              >
                <View style={styles.videoPlaceholderImage}>
                  <TechniqueVideoBackdrop resolving={activeVideoResolving} />
                </View>
                <View style={styles.videoStepFooter}>
                  <View style={styles.videoStepText}>
                    <Text style={styles.videoStepKicker}>Technique video</Text>
                    <Text style={styles.videoStepTitleLarge}>{activeVideoResolving ? 'Finding form video' : 'Watch form first'}</Text>
                    <Text style={styles.videoStepMeta}>{activeVideoResolving ? 'Preparing before you open it.' : `Open before set ${activeSetNumber}.`}</Text>
                  </View>
                  <Feather name="chevron-right" size={26} color={colors.white} />
                </View>
              </TouchableOpacity>

              <View style={styles.prepGrid}>
                <MetricPill label="Set" value={`${activeSetNumber}/${activeSets}`} icon="target" />
                <MetricPill label="Target" value={displayValue(activeExercise.reps)} icon="repeat" />
                <MetricPill label="Rest" value={`${displayValue(activeExercise.restSec, '0')}s`} icon="clock" />
              </View>

              <View style={styles.exerciseInsightCard}>
                <View style={styles.insightHeader}>
                  <View style={styles.insightIcon}>
                    <Feather name="zap" size={18} color={colors.accentDark} />
                  </View>
                  <View style={styles.insightTitleBlock}>
                    <Text style={styles.insightKicker}>Workout focus</Text>
                    <Text style={styles.insightTitle}>What this move is doing</Text>
                  </View>
                </View>
                <Text style={styles.insightBody}>{activeBenefit}</Text>
                {activeFocusTags.length ? (
                  <View style={styles.focusChipRow}>
                    {activeFocusTags.map((tag) => (
                      <View key={tag} style={styles.focusChip}>
                        <Text style={styles.focusChipText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.cueCard}>
                <View style={styles.cueHeader}>
                  <Feather name="check-circle" size={18} color={colors.accentDark} />
                  <Text style={styles.cueTitle}>Set cues</Text>
                </View>
                {activeCues.map((cue) => (
                  <View key={cue} style={styles.cueRow}>
                    <View style={styles.cueDot} />
                    <Text style={styles.cueText}>{cue}</Text>
                  </View>
                ))}
              </View>

              {activeLastLog ? (
                <View style={styles.lastLogCard}>
                  <Feather name="check-circle" size={18} color={colors.accentDark} />
                  <Text style={styles.lastLogText} numberOfLines={2}>
                    Last set: {activeLastLog.reps || '-'} reps{activeLastLog.weight ? ` · ${activeLastLog.weight} kg` : ''}{activeLastLog.durationSec ? ` · ${formatTimer(activeLastLog.durationSec)}` : ''}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <>
              <View style={styles.liveWorkoutCard}>
                <View style={styles.liveTimerHeader}>
                  <View>
                    <Text style={styles.liveTimerLabel}>{setPaused ? 'Paused' : 'Current set'}</Text>
                    <Text style={styles.liveTimerMeta}>Set {activeSetNumber} of {activeSets}</Text>
                  </View>
                  <Text style={styles.liveTimer}>{formatTimer(setElapsed)}</Text>
                </View>
                <View style={styles.liveProgressTrack}>
                  <View style={[styles.liveProgressFill, { width: `${Math.min(100, Math.max(10, (activeSetNumber / activeSets) * 100))}%` }]} />
                </View>
                <View style={styles.liveMetricRow}>
                  <View style={styles.liveMetricPill}>
                    <Text style={styles.liveMetricLabel}>Target</Text>
                    <Text style={styles.liveMetricValue}>{displayValue(activeExercise.reps)}</Text>
                  </View>
                  <View style={styles.liveMetricPill}>
                    <Text style={styles.liveMetricLabel}>Rest next</Text>
                    <Text style={styles.liveMetricValue}>{displayValue(activeExercise.restSec, '0')}s</Text>
                  </View>
                </View>
              </View>
              <View style={styles.instructionCard}>
                <View style={styles.instructionHead}>
                  <View style={styles.instructionIcon}>
                    <Feather name="info" size={18} color={colors.white} />
                  </View>
                  <Text style={styles.instructionTitle}>Instructions</Text>
                </View>
                <Text style={styles.instructionText}>
                  {activeNotes || `Keep control through the full range. Match the target ${displayValue(activeExercise.reps)} and stop if form breaks.`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => openExerciseVideo(activeExercise)}
                activeOpacity={0.86}
                style={styles.videoStepCardCompactActive}
                accessibilityRole="button"
                accessibilityLabel={`Open video for ${activeExercise.exerciseName}`}
              >
                <View style={styles.videoMiniIcon}>
                  <Feather name="play" size={17} color={colors.white} />
                </View>
                <Text style={styles.videoMiniText}>{activeVideoResolving ? 'Finding video' : 'Technique video'}</Text>
                <Feather name="chevron-right" size={20} color={colors.white} />
              </TouchableOpacity>
            </>
          )}
      </View>

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
          <WorkoutPrimaryCTA
            title={finishing ? 'Finishing...' : primaryTitle}
            subtitle={!timer.running && !activeDone ? `Set ${activeSetNumber} of ${activeSets}` : undefined}
            icon={timer.running ? 'skip-forward' : activeDone && activeExerciseIndex >= trackableExercises.length - 1 ? 'flag' : 'play'}
            onPress={primaryCta}
            disabled={finishing}
          />
        )}
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
      <RestSheet
        visible={timer.running}
        remaining={timer.remaining}
        nextLabel={restTargetLabel}
        onAddTime={addRestTime}
        onSkip={skipRest}
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
      <ExerciseFeedbackSheet
        visible={feedbackOpen}
        exerciseName={activeExercise.exerciseName}
        sentiment={feedbackSentiment}
        feedbackText={feedbackText}
        submitting={feedbackSubmitting}
        onSentiment={setFeedbackSentiment}
        onFeedbackText={setFeedbackText}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={submitActiveFeedback}
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

function ExerciseFeedbackSheet({
  visible,
  exerciseName,
  sentiment,
  feedbackText,
  submitting,
  onSentiment,
  onFeedbackText,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  exerciseName: string;
  sentiment: WorkoutFeedbackSentiment;
  feedbackText: string;
  submitting: boolean;
  onSentiment: (value: WorkoutFeedbackSentiment) => void;
  onFeedbackText: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.feedbackSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetKicker}>Workout feedback</Text>
              <Text style={styles.sheetTitle} numberOfLines={1}>{exerciseName}</Text>
              <Text style={styles.sheetSub}>Tell your trainer what to adjust next time.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close feedback">
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.sentimentRow}>
            {(['up', 'down'] as WorkoutFeedbackSentiment[]).map((value) => {
              const active = sentiment === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => onSentiment(value)}
                  activeOpacity={0.86}
                  style={[styles.sentimentButton, active && styles.sentimentSelected]}
                >
                  <Feather name={value === 'up' ? 'thumbs-up' : 'thumbs-down'} size={18} color={active ? colors.white : colors.ink} />
                  <Text style={[styles.sentimentText, active && styles.sentimentTextSelected]}>{value === 'up' ? 'Works' : 'Change it'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={feedbackText}
            onChangeText={onFeedbackText}
            placeholder="Add what felt good, painful, boring, too hard, or too easy."
            placeholderTextColor={colors.inkSubtle}
            multiline
            style={styles.feedbackInput}
            textAlignVertical="top"
          />
          <TouchableOpacity
            onPress={onSubmit}
            disabled={submitting}
            activeOpacity={0.86}
            style={styles.sheetSaveButton}
            accessibilityRole="button"
            accessibilityLabel="Save workout feedback"
          >
            <Text style={styles.sheetSaveText}>{submitting ? 'Saving...' : 'Save feedback'}</Text>
            <Feather name="arrow-right" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MetricPill({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.metricPill}>
      <Feather name={icon} size={18} color={colors.accentDark} />
      <View style={styles.metricPillText}>
        <Text style={styles.metricPillLabel}>{label}</Text>
        <Text style={styles.metricPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{value}</Text>
      </View>
    </View>
  );
}

function WorkoutCompleteScreen({
  visible,
  title,
  movementCount,
  onContinue,
  finishing,
}: {
  visible: boolean;
  title: string;
  movementCount: number;
  onContinue: () => void;
  finishing: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={styles.completeOverlay}>
      <View style={styles.completeCard}>
        <View style={styles.completeIcon}>
          <Feather name="award" size={44} color={colors.accentDark} />
        </View>
        <Text style={styles.completeKicker}>Workout completed</Text>
        <Text style={styles.completeTitle}>{title}</Text>
        <Text style={styles.completeText}>
          {movementCount} movement{movementCount === 1 ? '' : 's'} finished. Your sets are saved and ready to sync.
        </Text>
        <TouchableOpacity
          onPress={onContinue}
          disabled={finishing}
          activeOpacity={0.86}
          style={styles.completeButton}
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
        >
          <Text style={styles.completeButtonText}>{finishing ? 'Saving...' : 'Done'}</Text>
          <Feather name="arrow-right" size={22} color={colors.accentDark} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RestSheet({
  visible,
  remaining,
  nextLabel,
  onAddTime,
  onSkip,
}: {
  visible: boolean;
  remaining: number;
  nextLabel: string;
  onAddTime: () => void;
  onSkip: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.restSheetLayer}>
      <View style={styles.restSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.restSheetHeader}>
          <View>
            <Text style={styles.restKicker}>Recover</Text>
            <Text style={styles.restSheetTitle}>{formatTimer(remaining)}</Text>
          </View>
          <TouchableOpacity onPress={onSkip} style={styles.restSkipButton} accessibilityRole="button" accessibilityLabel="Skip rest">
            <Text style={styles.restSkipText}>Skip</Text>
            <Feather name="arrow-right" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.restSheetNext} numberOfLines={2}>Up next: {nextLabel}</Text>
        <TouchableOpacity onPress={onAddTime} style={styles.restAddTimeButton} accessibilityRole="button" accessibilityLabel="Add fifteen seconds">
          <Feather name="plus" size={16} color={colors.accentDark} />
          <Text style={styles.restAddTimeText}>Add 15 seconds</Text>
        </TouchableOpacity>
      </View>
    </View>
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
          <Feather name={reward.type === 'set' ? 'plus' : reward.type === 'movement' ? 'check' : 'award'} size={26} color={colors.white} />
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
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    gap: spacing.sm,
  },
  executionShellActive: {
    backgroundColor: colors.white,
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
  restSheetLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,20,18,0.18)',
  },
  restSheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  restSheetTitle: { fontSize: 42, lineHeight: 48, fontWeight: '900', color: colors.ink, marginTop: 2 },
  restSheetNext: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  restSkipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  restSkipText: { ...typography.bodyBold, color: colors.white },
  restAddTimeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  restAddTimeText: { ...typography.bodyBold, color: colors.accentDark },
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
  lastLogText: { ...typography.caption, color: colors.accentDark, fontWeight: '800', flex: 1 },
  lastLogCard: {
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
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
    paddingTop: spacing.md,
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
    backgroundColor: colors.accent,
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
  videoStepCardLarge: {
    minHeight: 188,
    borderRadius: 26,
    backgroundColor: colors.inkStrong,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  videoPlaceholderImage: {
    flex: 1,
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: colors.accentDarker,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoPlaceholderLogo: {
    position: 'absolute',
    width: 138,
    height: 138,
    opacity: 0.12,
    tintColor: colors.white,
  },
  videoPlaceholderLines: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    gap: 7,
  },
  videoPlaceholderLine: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  videoPlaceholderLineLong: { width: '64%' },
  videoPlaceholderLineMedium: { width: '46%' },
  videoPlaceholderLineShort: { width: '30%' },
  videoStepIconLarge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  videoStepFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  videoStepTitleLarge: { fontSize: 22, lineHeight: 27, fontWeight: '800', color: colors.white, marginTop: 3 },
  videoStepCardCompactActive: {
    minHeight: 68,
    borderRadius: 20,
    backgroundColor: colors.inkStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  videoMiniIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  videoMiniText: { ...typography.bodyBold, color: colors.white, flex: 1 },
  prepGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metricPill: {
    flex: 1,
    minHeight: 74,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    padding: spacing.sm,
    justifyContent: 'center',
    gap: 6,
  },
  metricPillText: { minWidth: 0 },
  metricPillLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  metricPillValue: { ...typography.subtitle, color: colors.ink, marginTop: 2, fontWeight: '800' },
  exerciseInsightCard: {
    borderRadius: 20,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitleBlock: { flex: 1 },
  insightKicker: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase' },
  insightTitle: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  insightBody: { ...typography.body, color: colors.inkMuted },
  focusChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  focusChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  focusChipText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  cueCard: {
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cueHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  cueTitle: { ...typography.bodyBold, color: colors.ink },
  cueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  cueDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentDark,
    marginTop: 8,
  },
  cueText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
  liveWorkoutCard: {
    borderRadius: 28,
    backgroundColor: colors.accentDarker,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  liveTimerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  liveTimerLabel: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  liveTimer: { fontSize: 48, lineHeight: 52, fontWeight: '900', color: colors.white },
  liveTimerMeta: { ...typography.bodyBold, color: colors.white, marginTop: 2 },
  liveProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  liveProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  liveMetricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  liveMetricPill: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  liveMetricLabel: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '800' },
  liveMetricValue: { ...typography.subtitle, color: colors.white, marginTop: 1 },
  instructionCard: {
    flex: 1,
    minHeight: 166,
    borderRadius: 28,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  instructionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  instructionIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  instructionTitle: { ...typography.subtitle, color: colors.ink },
  instructionText: { fontSize: 20, lineHeight: 29, fontWeight: '600', color: colors.ink },
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
  completeOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 35,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeCard: {
    width: '100%',
    borderRadius: 38,
    backgroundColor: colors.accentDarker,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 10,
  },
  completeIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: '#f5b301',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  completeKicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  completeTitle: { ...typography.hero, color: colors.white, textAlign: 'center', marginTop: spacing.sm },
  completeText: { ...typography.body, color: colors.onAccentMuted, textAlign: 'center', marginTop: spacing.sm },
  completeButton: {
    minHeight: 64,
    borderRadius: radius.pill,
    backgroundColor: '#f5b301',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  completeButtonText: { ...typography.bodyBold, color: colors.accentDark },
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
    backgroundColor: '#fff8e6',
    borderWidth: 1,
    borderColor: '#f5b301',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStepText: { ...typography.subtitle, color: colors.accentDark, fontWeight: '800' },
  activeText: { flex: 1 },
  activeKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  activeName: { fontSize: 30, lineHeight: 35, fontWeight: '800', color: colors.ink, marginTop: spacing.md, letterSpacing: -0.35 },
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
  prepScroller: { flex: 1, marginTop: spacing.sm },
  prepContent: { paddingBottom: spacing.sm },
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
  sheetTitleBlock: { flex: 1 },
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
