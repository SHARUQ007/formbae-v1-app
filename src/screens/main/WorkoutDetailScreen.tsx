import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
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
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { TechniqueVideoBackdrop } from '../../components/TechniqueVideoBackdrop';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { loadProfileSettingsCached, loadWorkoutDayCached } from '../../services/preloadService';
import { getWorkoutVideoOverride, resolveWorkoutVideo } from '../../services/workoutService';
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
import type { MainTabParamList, WorkoutStackParamList } from '../../navigation/types';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadows } from '../../theme/shadows';
import { isPlayableVideo } from '../../utils/video';
import { deriveExerciseMuscles, deriveWorkoutMuscles, resolveBodyGender, type BodyGender } from '../../utils/weeklyMuscles';
import { exerciseWithSelectedVariant } from '../../utils/workoutExerciseVariant';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

type RewardType = 'set' | 'movement' | 'workout';
type RewardState = { id: number; type: RewardType; title: string; subtitle: string } | null;
type SetLog = { setNumber: number; reps: string; weight: string; durationSec?: number };
type SetSaveResult = {
  movementComplete: boolean;
  workoutComplete: boolean;
  savedSetNumber: number;
  setTotal: number;
  exerciseName: string;
};

const SET_REWARD_LINES = ['Strong work.', 'That set counts.', 'Momentum building.', 'Nicely done.'];

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
    .filter((part) => !/^(Type|Section|Meta Name|Meta Sets|Meta Reps|Meta Duration|Meta Rest|Display|Target Muscles?|Muscles?)\s*:/i.test(part))
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
  const [feedbackAlternateIndex, setFeedbackAlternateIndex] = useState<number | undefined>(undefined);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [resolvedVideoUrls, setResolvedVideoUrls] = useState<Record<string, string>>({});
  const [resolvingVideoKeys, setResolvingVideoKeys] = useState<Set<string>>(new Set());
  const [bodyGender, setBodyGender] = useState<BodyGender>('neutral');
  const pendingNextIndexRef = useRef<number | null>(null);
  const pendingPostSaveRef = useRef<(() => void) | null>(null);
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
        .map((exercise) => exerciseWithSelectedVariant(exercise, saved.selectedAlternatesByExercise?.[exercise.exerciseId]));
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
    let mounted = true;
    loadProfileSettingsCached()
      .then((settings) => {
        if (mounted) setBodyGender(resolveBodyGender(settings.profile?.gender));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

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
      .map((exercise) => exerciseWithSelectedVariant(exercise, selectedAlternates[exercise.exerciseId])),
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
  const originalActiveExercise = detail?.exercises.find((exercise) => exercise.exerciseId === activeExerciseId);
  const activeExerciseReps = activeExercise?.reps || '';
  const activeExerciseIndex = activeExercise ? trackableExercises.findIndex((exercise) => exercise.exerciseId === activeExercise.exerciseId) : 0;
  const activeDone = activeExercise ? completed.has(activeExercise.exerciseId) : false;
  const activeSets = Math.max(1, Number(activeExercise?.sets || 1));
  const activeSetCount = activeExercise ? Math.min(activeSets, setProgress[activeExercise.exerciseId] || 0) : 0;
  const activeSetNumber = Math.min(activeSets, activeSetCount + 1);
  const activeRest = Number(activeExercise?.restSec || 0);
  const activeNotes = cleanExerciseNotes(activeExercise?.notes || '');
  const activeFocusTags = exerciseFocusTags(activeExercise, detail);
  const dayMuscles = useMemo(() => deriveWorkoutMuscles(detail), [detail]);
  const activeMuscles = useMemo(
    () => deriveExerciseMuscles(activeExercise, dayMuscles),
    [activeExercise, dayMuscles],
  );
  const activeCues = exerciseCues(activeNotes, activeExercise);
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
    (exercise: WorkoutExerciseDetail) => {
      const replacement = detail?.planDayId
        ? getWorkoutVideoOverride({
            planDayId: detail.planDayId,
            workoutMode: detail.workoutMode,
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            order: exercise.order,
          })
        : '';
      return replacement || resolvedVideoUrls[videoResolveKey(exercise)] || exercise.videoUrl || '';
    },
    [detail?.planDayId, detail?.workoutMode, resolvedVideoUrls],
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
      if (!detail?.planDayId) return;
      navigation.navigate('WorkoutVideo', {
        title: exercise.exerciseName,
        subtitle: getSectionLabel(exercise.notes, detail?.focus || 'Workout'),
        videoUrl: resolvedUrl,
        planDayId: detail.planDayId,
        workoutMode: detail.workoutMode,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        order: exercise.order,
        focus: detail.focus,
      });
    },
    [detail?.focus, detail?.planDayId, detail?.workoutMode, navigation, resolveExerciseVideo, videoUrlForExercise],
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

  const selectExerciseVariant = async (alternateIndex?: number) => {
    if (!activeExerciseId) return;
    const next = { ...selectedAlternates };
    if (alternateIndex === undefined) delete next[activeExerciseId];
    else next[activeExerciseId] = alternateIndex;
    setSelectedAlternates(next);
    setMovementStarted(false);
    await saveWorkoutProgress({
      planDayId,
      completedExerciseIds: Array.from(completed),
      setProgressByExercise: setProgress,
      setLogsByExercise: setLogs,
      selectedAlternatesByExercise: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const submitActiveFeedback = async () => {
    if (!activeExercise || !originalActiveExercise || !detail || feedbackSubmitting) return;
    const currentAlternateIndex = selectedAlternates[activeExerciseId];
    const nextAlternateIndex = feedbackSentiment === 'down' ? feedbackAlternateIndex : currentAlternateIndex;
    const feedbackExercise = exerciseWithSelectedVariant(originalActiveExercise, nextAlternateIndex);
    const movementChanged = feedbackSentiment === 'down'
      && feedbackExercise.exerciseName !== activeExercise.exerciseName;
    const preferenceText = movementChanged
      ? `Prefer ${feedbackExercise.exerciseName} instead of ${activeExercise.exerciseName}.`
      : '';
    setFeedbackSubmitting(true);
    try {
      await submitWorkoutFeedback({
        planId: detail.planId,
        planDayId: detail.planDayId,
        workoutMode: detail.workoutMode,
        sentiment: feedbackSentiment,
        feedbackText: feedbackText.trim() || preferenceText,
        exerciseId: originalActiveExercise.exerciseId,
        exerciseName: feedbackExercise.exerciseName,
        replacedExerciseName: movementChanged ? activeExercise.exerciseName : undefined,
        preferredExerciseName: movementChanged ? feedbackExercise.exerciseName : undefined,
      });
      if (feedbackSentiment === 'down') {
        await selectExerciseVariant(feedbackAlternateIndex).catch(() => undefined);
      }
      setFeedbackOpen(false);
      setFeedbackText('');
      setFeedbackSentiment('up');
      setFeedbackAlternateIndex(undefined);
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

  const openActiveFeedback = () => {
    setFeedbackText('');
    setFeedbackSentiment('up');
    setFeedbackAlternateIndex(selectedAlternates[activeExerciseId]);
    setFeedbackOpen(true);
  };

  const closeActiveFeedback = () => {
    setFeedbackOpen(false);
    setFeedbackText('');
    setFeedbackSentiment('up');
    setFeedbackAlternateIndex(undefined);
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
      streakOnly: detail.dayComplete,
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

  const logCurrentSetAndAdvance = async (): Promise<SetSaveResult | undefined> => {
    if (!activeExercise) return undefined;
    pendingPostSaveRef.current = null;
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

    const movementComplete = nextSetCount >= activeSets;
    const completesWorkout = movementComplete && activeExerciseIndex + 1 >= trackableExercises.length;
    const saveResult: SetSaveResult = {
      movementComplete,
      workoutComplete: completesWorkout,
      savedSetNumber: nextSetCount,
      setTotal: activeSets,
      exerciseName: activeExercise.exerciseName,
    };

    if (movementComplete) {
      await completeActiveExercise(nextSets, nextLogs);
    } else {
      await persistSets(nextSets, completed, nextLogs);
    }

    const nextIndex = movementComplete ? activeExerciseIndex + 1 : activeExerciseIndex;
    if (completesWorkout) {
      return saveResult;
    }
    if (activeRest > 0) {
      pendingPostSaveRef.current = () => {
        pendingNextIndexRef.current = nextIndex;
        setPendingNextIndex(nextIndex);
        timer.start(activeRest);
        saveWorkoutProgress({
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
        }).catch(() => undefined);
      };
    } else {
      pendingPostSaveRef.current = () => moveToExercise(nextIndex);
    }
    setSetElapsed(0);
    return saveResult;
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
      saveWorkoutProgress({
        planDayId,
        completedExerciseIds: Array.from(completed),
        setProgressByExercise: setProgress,
        setLogsByExercise: setLogs,
        selectedAlternatesByExercise: selectedAlternates,
        activeExerciseId: trackableExercises[nextIndex]?.exerciseId,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
  };

  const addRestTime = () => {
    timer.addTime(15);
    const nextExerciseId = restTargetExercise?.exerciseId;
    if (!nextExerciseId) return;
    saveWorkoutProgress({
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
    }).catch(() => undefined);
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

  const onFinish = useCallback(async (destination: 'workouts' | 'progress' | 'body' = 'workouts') => {
    if (!detail) return;
    setFinishing(true);
    try {
      const result = await completeWithQueue({
        planId: detail.planId,
        planDayId: detail.planDayId,
        action: 'day',
        workoutMode: detail.workoutMode,
        streakOnly: detail.dayComplete,
      });
      await clearWorkoutProgress(planDayId);
      await AsyncStorage.setItem(
        PENDING_STREAK_CELEBRATION_KEY,
        JSON.stringify({ planDayId: detail.planDayId, completedAt: Date.now() }),
      ).catch(() => undefined);
      if (!result.synced) {
        Alert.alert('Saved offline', 'Your workout will sync when you are back online.');
      }
      setWorkoutCompleteOpen(false);
      const tabNavigation = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
      navigation.popToTop();
      if (destination === 'progress') {
        tabNavigation?.navigate('Progress', { screen: 'ProgressMain', params: { action: 'overview', requestId: Date.now() } });
      } else if (destination === 'body') {
        tabNavigation?.navigate('Progress', { screen: 'ProgressMain', params: { action: 'logBody', requestId: Date.now() } });
      }
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
        setCount={Object.values(setLogs).reduce((total, logs) => total + logs.length, 0)}
        onViewProgress={() => onFinish('progress')}
        onLogBody={() => onFinish('body')}
        onDone={() => onFinish('workouts')}
        finishing={finishing}
      />
      <Header
        onBack={leaveWorkout}
        title={copy.eyebrow}
        right={(
          <TouchableOpacity
            onPress={openActiveFeedback}
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
            <Text style={styles.movementKicker}>Movement {activeExerciseIndex + 1} of {trackableExercises.length}</Text>
            <TouchableOpacity onPress={() => setFlowOpen(true)} style={styles.stepFlowButton} accessibilityRole="button" accessibilityLabel="Open workout flow">
              <Feather name="list" size={16} color={colors.inkMuted} />
              <Text style={styles.stepFlowText}>View plan</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activeName}>{activeExercise.exerciseName}</Text>

          {activeMuscles.length ? (
            <View style={styles.muscleMapCard}>
              <View style={styles.muscleMapCopy}>
                <Text style={styles.muscleMapKicker}>Muscles working</Text>
                <Text style={styles.muscleMapTitle}>Highlighted for this movement</Text>
                <View style={styles.muscleMapTags}>
                  {activeMuscles.map((muscle) => (
                    <View key={muscle} style={styles.muscleMapTag}>
                      <Text style={styles.muscleMapTagText}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.muscleMapFigure}>
                <WeeklyBodyMap gender={bodyGender} muscles={activeMuscles} mini showLabels={false} />
              </View>
            </View>
          ) : null}

          {!movementStarted ? (
            <ScrollView
              style={styles.prepScroller}
              contentContainerStyle={styles.prepContent}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                onPress={() => openExerciseVideo(activeExercise)}
                activeOpacity={0.86}
                style={styles.videoGuideCard}
                accessibilityRole="button"
                accessibilityLabel={`Open video for ${activeExercise.exerciseName}`}
              >
                <View style={styles.videoGuidePreview}>
                  <TechniqueVideoBackdrop resolving={activeVideoResolving} />
                </View>
                <View style={styles.videoGuideCopy}>
                  <Text style={styles.videoGuideKicker}>Technique</Text>
                  <Text style={styles.videoGuideTitle}>{activeVideoResolving ? 'Preparing video' : 'Watch demonstration'}</Text>
                  <Text style={styles.videoGuideMeta}>{activeVideoResolving ? 'Finding a clear form reference' : `Review before set ${activeSetNumber}`}</Text>
                </View>
                <View style={styles.videoGuideArrow}>
                  <Feather name="chevron-right" size={19} color={colors.inkMuted} />
                </View>
              </TouchableOpacity>

              <View style={styles.prescriptionStrip}>
                <View style={styles.prescriptionMetric}>
                  <Text style={styles.prescriptionMetricLabel}>Set</Text>
                  <Text style={styles.prescriptionMetricValue}>{activeSetNumber} of {activeSets}</Text>
                </View>
                <View style={styles.prescriptionDivider} />
                <View style={[styles.prescriptionMetric, styles.prescriptionMetricWide]}>
                  <Text style={styles.prescriptionMetricLabel}>Target</Text>
                  <Text style={styles.prescriptionMetricValue}>
                    {displayValue(activeExercise.reps)}
                  </Text>
                </View>
                <View style={styles.prescriptionDivider} />
                <View style={styles.prescriptionMetric}>
                  <Text style={styles.prescriptionMetricLabel}>Rest</Text>
                  <Text style={styles.prescriptionMetricValue}>{displayValue(activeExercise.restSec, '0')}s</Text>
                </View>
              </View>

              <View style={styles.coachCueCard}>
                <View style={styles.coachCueHeader}>
                  <Text style={styles.coachCueKicker}>Form notes</Text>
                  <Text style={styles.coachCueTags}>
                    {activeFocusTags.length ? activeFocusTags.join(' · ') : 'Technique'}
                  </Text>
                </View>
                <Text style={styles.coachCuePrimary}>{activeCues[0]}</Text>
                {activeCues[1] ? (
                  <View style={styles.coachCueSecondaryRow}>
                    <Text style={styles.coachCueIndex}>02</Text>
                    <Text style={styles.coachCueSecondary}>{activeCues[1]}</Text>
                  </View>
                ) : null}
              </View>

              {activeLastLog ? (
                <View style={styles.lastLogCard}>
                  <Feather name="check-circle" size={18} color={colors.accentDark} />
                  <Text style={styles.lastLogText}>
                    Last set: {activeLastLog.reps || '-'} reps{activeLastLog.weight ? ` · ${activeLastLog.weight} kg` : ''}{activeLastLog.durationSec ? ` · ${formatTimer(activeLastLog.durationSec)}` : ''}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.liveScroller}
              contentContainerStyle={styles.liveContent}
              showsVerticalScrollIndicator={false}
            >
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
                  <Text style={styles.instructionTitle}>Form notes</Text>
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
                  <Feather name="play" size={16} color={colors.gold} style={styles.videoMiniPlayGlyph} />
                </View>
                <Text style={styles.videoMiniText}>{activeVideoResolving ? 'Finding video' : 'Technique video'}</Text>
                <Feather name="chevron-right" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </ScrollView>
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
              <Feather name={setPaused ? 'play' : 'pause'} size={21} color={colors.ink} />
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
              <Feather name="check" size={22} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <WorkoutPrimaryCTA
            title={finishing ? 'Finishing...' : primaryTitle}
            subtitle={!timer.running && !activeDone ? `Set ${activeSetNumber} of ${activeSets}` : undefined}
            icon={timer.running ? 'skip-forward' : activeDone && activeExerciseIndex >= trackableExercises.length - 1 ? 'flag' : 'play'}
            onPress={primaryCta}
            disabled={finishing}
            large
            style={styles.workoutSetCta}
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
        onCelebrationComplete={(result) => {
          setSetEntryOpen(false);
          if (result.workoutComplete) {
            setWorkoutCompleteOpen(true);
          } else {
            const continueWorkout = pendingPostSaveRef.current;
            pendingPostSaveRef.current = null;
            continueWorkout?.();
          }
        }}
      />
      <ExerciseFeedbackSheet
        visible={feedbackOpen}
        exerciseName={activeExercise.exerciseName}
        originalExercise={originalActiveExercise}
        selectedAlternateIndex={feedbackAlternateIndex}
        sentiment={feedbackSentiment}
        feedbackText={feedbackText}
        submitting={feedbackSubmitting}
        onSentiment={(value) => {
          setFeedbackSentiment(value);
          if (value === 'up') setFeedbackAlternateIndex(selectedAlternates[activeExerciseId]);
        }}
        onSelectAlternate={setFeedbackAlternateIndex}
        onFeedbackText={setFeedbackText}
        onClose={closeActiveFeedback}
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
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
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
        <Text style={styles.exerciseRowTitle}>{exercise.exerciseName}</Text>
        <Text style={styles.exerciseRowMeta}>{displayValue(exercise.sets, '1')} sets · {displayValue(exercise.reps)} · {displayValue(exercise.restSec, '0')}s rest</Text>
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
  originalExercise,
  selectedAlternateIndex,
  sentiment,
  feedbackText,
  submitting,
  onSentiment,
  onSelectAlternate,
  onFeedbackText,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  exerciseName: string;
  originalExercise?: WorkoutExerciseDetail | null;
  selectedAlternateIndex?: number;
  sentiment: WorkoutFeedbackSentiment;
  feedbackText: string;
  submitting: boolean;
  onSentiment: (value: WorkoutFeedbackSentiment) => void;
  onSelectAlternate: (index?: number) => void;
  onFeedbackText: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <ScrollView
          style={styles.feedbackSheet}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetKicker}>Workout feedback</Text>
              <Text style={styles.sheetTitle}>{exerciseName}</Text>
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
          {sentiment === 'down' && originalExercise?.alternatives?.length ? (
            <View style={styles.feedbackAlternateSection}>
              <Text style={styles.feedbackAlternateKicker}>Movement preference</Text>
              <Text style={styles.feedbackAlternateTitle}>Would another movement fit better?</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.feedbackAlternateRow}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableOpacity
                  onPress={() => onSelectAlternate(undefined)}
                  activeOpacity={0.86}
                  style={[styles.feedbackAlternatePill, selectedAlternateIndex === undefined && styles.feedbackAlternatePillActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedAlternateIndex === undefined }}
                >
                  <Text style={[styles.feedbackAlternateText, selectedAlternateIndex === undefined && styles.feedbackAlternateTextActive]}>
                    {originalExercise.exerciseName}
                  </Text>
                </TouchableOpacity>
                {originalExercise.alternatives.map((alternate, index) => (
                  <TouchableOpacity
                    key={`${alternate.exerciseName}:${index}`}
                    onPress={() => onSelectAlternate(index)}
                    activeOpacity={0.86}
                    style={[styles.feedbackAlternatePill, selectedAlternateIndex === index && styles.feedbackAlternatePillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedAlternateIndex === index }}
                  >
                    <Text style={[styles.feedbackAlternateText, selectedAlternateIndex === index && styles.feedbackAlternateTextActive]}>
                      {alternate.exerciseName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.feedbackAlternateHint}>Optional. Your choice applies to today and helps personalize future plans.</Text>
            </View>
          ) : null}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function WorkoutCompleteScreen({
  visible,
  title,
  movementCount,
  setCount,
  onViewProgress,
  onLogBody,
  onDone,
  finishing,
}: {
  visible: boolean;
  title: string;
  movementCount: number;
  setCount: number;
  onViewProgress: () => void;
  onLogBody: () => void;
  onDone: () => void;
  finishing: boolean;
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardLift = useRef(new Animated.Value(24)).current;
  const rewardScale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (!visible) return;
    cardOpacity.setValue(0);
    cardLift.setValue(24);
    rewardScale.setValue(0.7);
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(cardLift, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.spring(rewardScale, { toValue: 1, friction: 5, tension: 90, delay: 100, useNativeDriver: true }),
    ]).start();
  }, [cardLift, cardOpacity, rewardScale, visible]);

  if (!visible) return null;
  return (
    <ScrollView
      style={styles.completeOverlay}
      contentContainerStyle={styles.completeOverlayContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={[
          styles.completeCard,
          { opacity: cardOpacity, transform: [{ translateY: cardLift }] },
        ]}
      >
        <Animated.View style={[styles.completeIcon, { transform: [{ scale: rewardScale }] }]}>
          <Feather name="check" size={36} color={colors.onPrimary} />
        </Animated.View>
        <View style={styles.completeStatusPill}>
          <View style={styles.completeStatusDot} />
          <Text style={styles.completeStatusText}>Today counts</Text>
        </View>
        <Text style={styles.completeTitle}>You showed up.</Text>
        <Text style={styles.completeWorkoutName}>{title}</Text>
        <Text style={styles.completeText}>That is how momentum gets built—one finished session at a time.</Text>

        <View style={styles.completeStats}>
          <View style={styles.completeStat}>
            <Text style={styles.completeStatValue}>{movementCount}</Text>
            <Text style={styles.completeStatLabel}>movements</Text>
          </View>
          <View style={styles.completeStatDivider} />
          <View style={styles.completeStat}>
            <Text style={styles.completeStatValue}>{setCount}</Text>
            <Text style={styles.completeStatLabel}>sets saved</Text>
          </View>
        </View>

        <View style={styles.completeNextCard}>
          <View style={styles.completeNextIcon}>
            <Feather name="sunrise" size={19} color={colors.gold} />
          </View>
          <View style={styles.completeNextCopy}>
            <Text style={styles.completeNextKicker}>Keep the rhythm</Text>
            <Text style={styles.completeNextText}>Your next session will be ready when you return.</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onViewProgress}
          disabled={finishing}
          activeOpacity={0.86}
          style={styles.completePrimaryButton}
          accessibilityRole="button"
          accessibilityLabel="See today's progress"
        >
          <View style={styles.completeButtonCopy}>
            <Text style={styles.completePrimaryText}>{finishing ? 'Saving workout…' : "See today's progress"}</Text>
            {!finishing ? <Text style={styles.completePrimarySub}>Streak, consistency, and history</Text> : null}
          </View>
          {finishing ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Feather name="arrow-right" size={22} color={colors.onPrimary} />}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogBody}
          disabled={finishing}
          activeOpacity={0.86}
          style={styles.completeSecondaryButton}
          accessibilityRole="button"
          accessibilityLabel="Add an optional body update"
        >
          <Feather name="trending-up" size={19} color={colors.gold} />
          <Text style={styles.completeSecondaryText}>Add a body update</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDone}
          disabled={finishing}
          style={styles.completeDoneButton}
          accessibilityRole="button"
          accessibilityLabel="Return to workouts"
        >
          <Text style={styles.completeDoneText}>Not now</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
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
        <Text style={styles.restSheetNext}>Up next: {nextLabel}</Text>
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
  onCelebrationComplete,
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
  onSave: () => Promise<SetSaveResult | undefined>;
  onCelebrationComplete: (result: SetSaveResult) => void;
}) {
  const modalInsets = useSafeAreaInsets();
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveResult, setSaveResult] = useState<SetSaveResult | null>(null);
  const successScale = useRef(new Animated.Value(0.65)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successLift = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!visible) return;
    setSavePhase('idle');
    setSaveResult(null);
    successScale.setValue(0.65);
    successOpacity.setValue(0);
    successLift.setValue(16);
  }, [successLift, successOpacity, successScale, visible]);

  const handleClose = () => {
    if (savePhase === 'idle' || savePhase === 'error') onCancel();
  };

  const handleSave = async () => {
    if (savePhase !== 'idle' && savePhase !== 'error') return;
    setSavePhase('saving');
    try {
      const result = await onSave();
      if (!result) throw new Error('Set could not be saved');
      setSaveResult(result);
      setSavePhase('success');
      successScale.setValue(0.65);
      successOpacity.setValue(0);
      successLift.setValue(16);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(successScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
          Animated.timing(successOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
          Animated.timing(successLift, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]),
        Animated.delay(result.workoutComplete ? 1100 : 850),
        Animated.timing(successOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onCelebrationComplete(result);
      });
    } catch {
      setSavePhase('error');
    }
  };

  const controlsLocked = savePhase === 'saving' || savePhase === 'success';
  const saveButtonLabel = savePhase === 'saving'
    ? 'Saving…'
    : savePhase === 'error'
      ? 'Try saving again'
      : 'Save set';
  const rewardKicker = saveResult?.workoutComplete
    ? 'Workout complete'
    : saveResult?.movementComplete
      ? 'Movement complete'
      : saveResult ? `Set ${saveResult.savedSetNumber} saved` : '';
  const rewardTitle = saveResult?.workoutComplete
    ? 'You finished strong.'
    : saveResult?.movementComplete
      ? 'Movement complete.'
      : saveResult
        ? SET_REWARD_LINES[(saveResult.savedSetNumber - 1) % SET_REWARD_LINES.length]
        : '';
  const rewardMessage = saveResult?.workoutComplete
    ? 'Every set is saved. Your session recap is ready.'
    : saveResult?.movementComplete
      ? `All ${saveResult.setTotal} sets are saved. Your next movement is ready.`
      : saveResult
        ? `${saveResult.setTotal - saveResult.savedSetNumber} ${saveResult.setTotal - saveResult.savedSetNumber === 1 ? 'set' : 'sets'} left. Catch your breath, then go again.`
        : '';
  const rewardProgress = saveResult
    ? `${Math.min(100, Math.round((saveResult.savedSetNumber / Math.max(1, saveResult.setTotal)) * 100))}%` as `${number}%`
    : '0%';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[
          styles.setEntrySheet,
          !needsWeight && styles.setEntrySheetCompact,
          savePhase === 'success' && styles.setEntrySheetSuccess,
        ]}>
          <View style={[
            styles.sheetHandle,
            styles.setEntryHandle,
            savePhase === 'success' && styles.setEntryHandleSuccess,
          ]} />
          {savePhase === 'success' && saveResult ? (
            <Animated.View
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${rewardKicker}. ${rewardTitle} ${rewardMessage}`}
              style={[
                styles.setSaveSuccess,
                {
                  paddingBottom: modalInsets.bottom + spacing.xl,
                  opacity: successOpacity,
                  transform: [{ translateY: successLift }],
                },
              ]}
            >
              <Animated.View style={[styles.setSaveSuccessIcon, { transform: [{ scale: successScale }] }]}>
                <View style={styles.setSaveSuccessIconInner}>
                  <Feather
                    name={saveResult.workoutComplete ? 'award' : 'check'}
                    size={30}
                    color={colors.onPrimary}
                  />
                </View>
              </Animated.View>
              <Text style={styles.setSaveSuccessKicker}>{rewardKicker}</Text>
              <Text style={styles.setSaveSuccessTitle}>{rewardTitle}</Text>
              <Text style={styles.setSaveSuccessExercise} numberOfLines={2}>{saveResult.exerciseName}</Text>

              <View style={styles.setSaveProgressMeta}>
                <Text style={styles.setSaveProgressLabel}>Movement progress</Text>
                <Text style={styles.setSaveProgressValue}>{saveResult.savedSetNumber}/{saveResult.setTotal} sets</Text>
              </View>
              <View style={styles.setSaveProgressTrack}>
                <View style={[styles.setSaveProgressFill, { width: rewardProgress }]} />
              </View>
              <Text style={styles.setSaveSuccessMessage}>{rewardMessage}</Text>
            </Animated.View>
          ) : (
            <>
              <ScrollView
                style={styles.setEntryContentScroll}
                contentContainerStyle={styles.setEntryContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.sheetHead}>
                  <View style={styles.setEntryHeadText}>
                    <Text style={styles.sheetKicker}>Log set {setNumber} of {setTotal}</Text>
                    <Text style={styles.sheetTitle}>{exerciseName}</Text>
                    <Text style={styles.sheetSub}>Time under work: {formatTimer(elapsed)}</Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} disabled={controlsLocked} style={styles.closeButton}>
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
                      <TouchableOpacity onPress={() => onAdjustReps(-1)} disabled={controlsLocked} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Decrease reps">
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
                        editable={!controlsLocked}
                      />
                      <TouchableOpacity onPress={() => onAdjustReps(1)} disabled={controlsLocked} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Increase reps">
                        <Feather name="plus" size={20} color={colors.accentDark} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {needsWeight ? (
                    <View style={styles.sheetInputGroup}>
                      <Text style={styles.logInputLabel}>Weight used</Text>
                      <View style={styles.sheetStepperInputRow}>
                        <TouchableOpacity onPress={() => onAdjustWeight(-1)} disabled={controlsLocked} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Decrease weight">
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
                          editable={!controlsLocked}
                        />
                        <TouchableOpacity onPress={() => onAdjustWeight(1)} disabled={controlsLocked} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Increase weight">
                          <Feather name="plus" size={20} color={colors.accentDark} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              <View style={[styles.sheetActionDock, { paddingBottom: modalInsets.bottom + spacing.sm }]}>
                <TouchableOpacity onPress={handleClose} disabled={controlsLocked} style={styles.sheetSecondaryButton} accessibilityRole="button" accessibilityLabel="Resume set">
                  <Text style={styles.sheetSecondaryText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={controlsLocked}
                  activeOpacity={0.82}
                  style={[
                    styles.sheetSaveButton,
                    savePhase === 'saving' && styles.sheetSaveButtonSaving,
                    savePhase === 'error' && styles.sheetSaveButtonError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={saveButtonLabel}
                  accessibilityState={{ disabled: controlsLocked, busy: savePhase === 'saving' }}
                >
                  {savePhase === 'saving' ? <ActivityIndicator size="small" color={colors.onPrimary} /> : null}
                  {savePhase === 'error' ? <Feather name="alert-circle" size={20} color={colors.ink} /> : null}
                  <Text accessibilityLiveRegion="polite" style={[styles.sheetSaveText, savePhase === 'error' && styles.sheetSaveTextError]}>
                    {saveButtonLabel}
                  </Text>
                  {savePhase === 'idle' ? <Feather name="arrow-right" size={20} color={colors.onPrimary} /> : null}
                </TouchableOpacity>
              </View>
            </>
          )}
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
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  headerSubtitle: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: colors.inkMuted, marginTop: 2 },
  feedbackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerBar: {
    backgroundColor: colors.accentFill,
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
    marginTop: 2,
    marginBottom: spacing.xs,
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
    paddingTop: spacing.sm,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    gap: spacing.xs,
  },
  executionShellActive: {
    backgroundColor: colors.bg,
  },
  executionShellCompact: {
    marginHorizontal: spacing.md,
    paddingTop: spacing.xs,
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
    backgroundColor: colors.accentFill,
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
    backgroundColor: colors.accentFill,
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
  movementKicker: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase', letterSpacing: 1.8 },
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
    backgroundColor: colors.panelRaised,
  },
  setRunRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setRunMetric: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
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
    backgroundColor: colors.panelRaised,
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
  lastLogText: { fontSize: 15, lineHeight: 21, color: colors.accentDark, fontWeight: '700', flex: 1 },
  lastLogCard: {
    minHeight: 64,
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
  workoutSetCta: { minHeight: 92 },
  primarySessionButton: {
    minHeight: 78,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    borderWidth: 4,
    borderColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  restPrimaryButton: { backgroundColor: colors.accentFill },
  donePrimaryButton: { backgroundColor: colors.accentFill },
  primarySessionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySessionText: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: colors.white, flexShrink: 1, textAlign: 'center' },
  primarySessionLabelBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySessionSubText: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '800', marginTop: 1 },
  activeActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pauseSessionButton: {
    flex: 0.9,
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pauseSessionText: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.ink },
  completeSessionButton: {
    flex: 1.25,
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  completeSessionText: { fontSize: 20, lineHeight: 26, fontWeight: '900', color: colors.onPrimary },
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
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  stepShellCompact: {
    borderRadius: radius.md,
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
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  stepperDotDone: {
    backgroundColor: colors.goldMuted,
  },
  stepperDotActive: {
    height: 3,
    backgroundColor: colors.gold,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepFlowButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingLeft: spacing.sm,
  },
  stepFlowText: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, fontWeight: '700' },
  videoGuideCard: {
    minHeight: 112,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 7,
  },
  videoGuidePreview: {
    width: 104,
    alignSelf: 'stretch',
    minHeight: 96,
    borderRadius: radius.md,
    backgroundColor: colors.bgTint,
    overflow: 'hidden',
  },
  videoGuideCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  videoGuideKicker: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  videoGuideTitle: { fontSize: 17, lineHeight: 23, color: colors.ink, marginTop: 3, fontWeight: '800' },
  videoGuideMeta: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 2 },
  videoGuideArrow: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
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
    backgroundColor: colors.accentFill,
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
    minHeight: 62,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  videoMiniIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
  },
  videoMiniPlayGlyph: { transform: [{ translateX: 1 }] },
  videoMiniText: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  prescriptionStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 84,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: 12,
  },
  prescriptionMetric: {
    flex: 0.8,
    justifyContent: 'center',
  },
  prescriptionMetricWide: { flex: 1.5, paddingHorizontal: spacing.sm },
  prescriptionMetricLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.inkSubtle, textTransform: 'uppercase', letterSpacing: 1.4 },
  prescriptionMetricValue: { fontSize: 17, lineHeight: 24, color: colors.ink, marginTop: 4, fontWeight: '700' },
  prescriptionDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  coachCueCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.goldMuted,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  coachCueHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  coachCueKicker: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  coachCueTags: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.inkSubtle, textAlign: 'right', flexShrink: 1 },
  coachCuePrimary: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: colors.ink, marginTop: spacing.sm },
  coachCueSecondaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  coachCueIndex: { ...typography.overline, color: colors.inkSubtle, letterSpacing: 1 },
  coachCueSecondary: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: colors.inkMuted, flex: 1 },
  liveWorkoutCard: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  liveTimerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  liveTimerLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  liveTimer: { fontSize: 48, lineHeight: 52, fontWeight: '900', color: colors.ink },
  liveTimerMeta: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.ink, marginTop: 2 },
  liveProgressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  liveProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  liveMetricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  liveMetricPill: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  liveMetricLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.inkSubtle, textTransform: 'uppercase' },
  liveMetricValue: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink, marginTop: 2 },
  instructionCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.goldMuted,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    paddingRight: spacing.xs,
    marginTop: spacing.md,
  },
  instructionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  instructionTitle: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  instructionText: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: colors.ink },
  videoStepCard: {
    minHeight: 104,
    borderRadius: 26,
    backgroundColor: colors.accentDarker,
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
    backgroundColor: colors.accentFill,
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
  },
  completeOverlayContent: {
    flexGrow: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 34,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.lg,
  },
  completeIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.accent,
  },
  completeStatusPill: {
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  completeStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  completeStatusText: { ...typography.caption, color: colors.gold, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  completeTitle: { fontSize: 30, lineHeight: 37, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  completeWorkoutName: { ...typography.subtitle, color: colors.ink, textAlign: 'center', marginTop: spacing.xs },
  completeText: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 330 },
  completeStats: {
    minHeight: 76,
    alignSelf: 'stretch',
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  completeStat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  completeStatValue: { fontSize: 24, lineHeight: 30, color: colors.ink, fontWeight: '900' },
  completeStatLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  completeStatDivider: { width: StyleSheet.hairlineWidth, height: 38, backgroundColor: colors.borderStrong },
  completeNextCard: {
    alignSelf: 'stretch',
    minHeight: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  completeNextIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeNextCopy: { flex: 1, minWidth: 0 },
  completeNextKicker: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  completeNextText: { fontSize: 14, lineHeight: 19, color: colors.inkMuted, marginTop: 1 },
  completePrimaryButton: {
    minHeight: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryAction,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    ...shadows.card,
  },
  completeButtonCopy: { flex: 1, minWidth: 0 },
  completePrimaryText: { ...typography.bodyBold, color: colors.onPrimary, fontWeight: '900' },
  completePrimarySub: { ...typography.caption, color: 'rgba(8,9,12,0.64)', marginTop: 1 },
  completeSecondaryButton: {
    minHeight: 56,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  completeSecondaryText: { ...typography.bodyBold, color: colors.ink },
  completeDoneButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  completeDoneText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
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
    backgroundColor: colors.accentDarker,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressBlock: { marginTop: spacing.sm },
  activeCard: {
    borderRadius: 28,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  activeStep: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStepText: { ...typography.bodyBold, color: colors.accentDark, fontWeight: '800' },
  activeText: { flex: 1 },
  activeKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  activeName: { fontSize: 28, lineHeight: 35, fontWeight: '800', color: colors.ink, marginTop: spacing.sm, letterSpacing: -0.3 },
  muscleMapCard: {
    minHeight: 126,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  muscleMapCopy: { flex: 1, minWidth: 0, paddingVertical: spacing.md },
  muscleMapKicker: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  muscleMapTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.ink, marginTop: 3 },
  muscleMapTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: spacing.sm },
  muscleMapTag: { borderRadius: radius.pill, backgroundColor: colors.accentLight, paddingHorizontal: 9, paddingVertical: 5 },
  muscleMapTagText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.accentDark },
  muscleMapFigure: { width: 148, alignSelf: 'stretch', justifyContent: 'center' },
  activeStatus: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  activeStatusDone: { backgroundColor: colors.accentFill },
  activeStatusLive: { backgroundColor: colors.warn },
  prepScroller: { flex: 1, marginTop: spacing.xs },
  prepContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  liveScroller: { flex: 1 },
  liveContent: { paddingBottom: spacing.sm },
  videoBox: { alignItems: 'center', justifyContent: 'center' },
  videoActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  videoActionButton: { flex: 1 },
  prescription: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  setTracker: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelRaised,
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
  setDotDone: { backgroundColor: colors.accentFill, borderColor: colors.accent },
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
    backgroundColor: colors.panelRaised,
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
    backgroundColor: colors.panelRaised,
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
  exerciseNumDone: { backgroundColor: colors.accentFill },
  exerciseNumActive: { backgroundColor: colors.panelRaised },
  exerciseNumText: { ...typography.bodyBold, color: colors.inkMuted },
  exerciseNumTextActive: { color: colors.accentDark },
  exerciseRowText: { flex: 1 },
  exerciseRowTitle: { ...typography.bodyBold, color: colors.ink },
  exerciseRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  feedbackSheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
  },
  setEntrySheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
  },
  setEntrySheetCompact: { maxHeight: '62%' },
  setEntrySheetSuccess: {
    minHeight: '46%',
    backgroundColor: colors.panelWarm,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.accentSurface,
  },
  setEntryHandle: { marginTop: spacing.sm, marginBottom: 0 },
  setEntryHandleSuccess: { backgroundColor: colors.goldMuted },
  setSaveSuccess: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  setSaveSuccessIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  setSaveSuccessIconInner: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.accent,
  },
  setSaveSuccessKicker: {
    ...typography.overline,
    color: colors.gold,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  setSaveSuccessTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  setSaveSuccessExercise: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 3,
  },
  setSaveProgressMeta: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  setSaveProgressLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  setSaveProgressValue: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  setSaveProgressTrack: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  setSaveProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  setSaveSuccessMessage: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 320,
  },
  setEntryContentScroll: { flexGrow: 0, flexShrink: 1 },
  setEntryContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sheetScrollContent: {
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
    paddingBottom: spacing.sm,
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
    backgroundColor: colors.panelRaised,
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
  sheetActionDock: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
    backgroundColor: colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.accent,
  },
  sheetSaveButtonSaving: { opacity: 0.86 },
  sheetSaveButtonError: {
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.error,
    shadowOpacity: 0,
    elevation: 0,
  },
  sheetSaveText: { ...typography.bodyBold, color: colors.onPrimary, fontWeight: '900' },
  sheetSaveTextError: { color: colors.ink },
  flowSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  statsSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
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
    backgroundColor: colors.panelRaised,
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
    backgroundColor: colors.panelRaised,
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
  sentimentSelected: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  sentimentText: { ...typography.bodyBold, color: colors.accentDark },
  sentimentTextSelected: { color: colors.white },
  feedbackAlternateSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  feedbackAlternateKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  feedbackAlternateTitle: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  feedbackAlternateRow: { gap: spacing.sm, paddingTop: spacing.sm, paddingRight: spacing.md },
  feedbackAlternatePill: {
    maxWidth: 240,
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  feedbackAlternatePillActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  feedbackAlternateText: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.inkMuted },
  feedbackAlternateTextActive: { color: colors.onPrimary },
  feedbackAlternateHint: { fontSize: 12, lineHeight: 17, color: colors.inkMuted, marginTop: spacing.sm },
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
    width: '100%',
    maxWidth: 360,
    minWidth: 240,
    borderRadius: radius.xl,
    backgroundColor: colors.panelRaised,
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
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rewardTitle: { ...typography.title, color: colors.ink, textAlign: 'center' },
  rewardSubtitle: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: 4 },
});
