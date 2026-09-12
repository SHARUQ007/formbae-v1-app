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
import { ExerciseVideo } from '../../components/ExerciseVideo';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { loadProfileSettingsCached, loadWorkoutDayCached } from '../../services/preloadService';
import { getWorkoutVideoOverride, replaceWorkoutVideo, resolveWorkoutVideo } from '../../services/workoutService';
import { submitWorkoutFeedback, type WorkoutFeedbackSentiment } from '../../services/workoutFeedbackService';
import {
  completeWithQueue,
  loadWorkoutProgress,
  saveWorkoutProgress,
  clearWorkoutProgress,
  type WorkoutSetLog,
} from '../../store/workoutStore';
import { buildCompletedExercises, isTimedWorkoutTarget } from '../../store/workoutCompletion';
import { WorkoutRestDock } from '../../components/WorkoutRestDock';
import { WorkoutSessionArtwork } from '../../components/WorkoutSessionArtwork';
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
import { deriveExerciseMuscles, deriveWorkoutMuscles, haveCompatibleMuscleTargets, resolveBodyGender, type BodyGender } from '../../utils/weeklyMuscles';
import { exerciseWithSelectedVariant } from '../../utils/workoutExerciseVariant';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

type RewardType = 'set' | 'movement' | 'workout';
type RewardState = { id: number; type: RewardType; title: string; subtitle: string } | null;
type SetLog = WorkoutSetLog;
type SetSaveResult = {
  movementComplete: boolean;
  workoutComplete: boolean;
  savedSetNumber: number;
  setTotal: number;
  exerciseName: string;
};
type VideoReplacementStatus = 'idle' | 'finding' | 'changed' | 'unavailable';

const SET_REWARD_LINES = ['Strong work.', 'That set counts.', 'Momentum building.', 'Nicely done.'];

function videoResolveKey(exercise: WorkoutExerciseDetail) {
  return `${exercise.exerciseId || ''}:${exercise.exerciseName}:${exercise.order}`;
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

const PENDING_STREAK_CELEBRATION_KEY = 'formbae_pending_workout_streak_celebration';

function exerciseCues(notes: string, exercise?: WorkoutExerciseDetail | null) {
  const name = String(exercise?.exerciseName || '').toLowerCase();
  // Keep common movements paired with reliable, movement-specific guidance.
  if (name.includes('leg press')) return ['Keep your hips and back supported against the pad.', 'Track your knees over your toes and press through the whole foot.'];
  if (name.includes('squat')) return ['Brace before each rep and keep knees tracking over toes.', 'Use a controlled descent, then drive through the floor.'];
  if (name.includes('deadlift')) return ['Brace hard before lifting and keep the weight close.', 'Hinge from the hips and finish tall without overextending.'];
  if (name.includes('row')) return ['Keep your torso stable and pull with your elbow.', 'Pause briefly at the top before lowering with control.'];
  if (name.includes('press')) return ['Set your shoulder blades before the first rep.', 'Control the weight down, then press with a steady path.'];

  const cues = notes
    .split(/[.·]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 10)
    .slice(0, 2);
  if (cues.length) return cues;
  return ['Move with control and stop the set if form breaks.', 'Match the target reps while keeping breathing steady.'];
}

function displayValue(value: string, fallback = '-') {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
}

function displayTarget(value: string) {
  const cleaned = displayValue(value);
  if (cleaned === '-' || /(?:sec|min|hour|rep|amrap|failure)/i.test(cleaned)) return cleaned;
  return /\d/.test(cleaned) ? `${cleaned} reps` : cleaned;
}

function estimatedSetSeconds(prescription: string) {
  const value = String(prescription || '').toLowerCase();
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/);
  if (minutes?.[1]) return Math.max(20, Math.round(Number(minutes[1]) * 60));
  const seconds = value.match(/(\d+)\s*(?:sec|second|s\b)/);
  if (seconds?.[1]) return Math.max(20, Number(seconds[1]));
  const targets = value.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  const targetReps = targets.length > 1 ? (targets[0] + targets[1]) / 2 : targets[0] || 10;
  return Math.max(25, Math.min(75, Math.round(targetReps * 3.5)));
}

function formatEstimatedTime(seconds: number) {
  if (seconds <= 0) return 'Done';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `~${minutes}m`;
}

function getWorkoutProgressSnapshot(
  exercises: WorkoutExerciseDetail[],
  completed: Set<string>,
  setProgress: Record<string, number>,
) {
  const completedMovements = exercises.filter((exercise) => completed.has(exercise.exerciseId)).length;
  const totalSets = exercises.reduce((sum, exercise) => sum + Math.max(1, Number(exercise.sets || 1)), 0);
  const savedSets = exercises.reduce((sum, exercise) => {
    const exerciseSets = Math.max(1, Number(exercise.sets || 1));
    return sum + (completed.has(exercise.exerciseId)
      ? exerciseSets
      : Math.min(exerciseSets, setProgress[exercise.exerciseId] || 0));
  }, 0);
  const estimatedRemainingSeconds = exercises.reduce((sum, exercise) => {
    const exerciseSets = Math.max(1, Number(exercise.sets || 1));
    const completedSets = completed.has(exercise.exerciseId)
      ? exerciseSets
      : Math.min(exerciseSets, setProgress[exercise.exerciseId] || 0);
    const remainingSets = Math.max(0, exerciseSets - completedSets);
    if (!remainingSets) return sum;
    const workSeconds = remainingSets * estimatedSetSeconds(exercise.reps);
    const restSeconds = Math.max(0, remainingSets - 1) * Math.max(0, Number(exercise.restSec || 0));
    return sum + workSeconds + restSeconds + 20;
  }, 0);

  return {
    completedMovements,
    totalSets,
    savedSets,
    estimatedRemainingSeconds,
    progress: totalSets ? savedSets / totalSets : 0,
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
  const [feedbackAlternateIndex, setFeedbackAlternateIndex] = useState<number | undefined>(undefined);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [resolvedVideoUrls, setResolvedVideoUrls] = useState<Record<string, string>>({});
  const [resolvingVideoKeys, setResolvingVideoKeys] = useState<Set<string>>(new Set());
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [videoReplacementStatus, setVideoReplacementStatus] = useState<VideoReplacementStatus>('idle');
  const [bodyGender, setBodyGender] = useState<BodyGender>('neutral');
  const pendingNextIndexRef = useRef<number | null>(null);
  const pendingPostSaveRef = useRef<(() => void) | null>(null);
  const resolvingVideoRequestsRef = useRef<Map<string, Promise<string>>>(new Map());
  const feedbackDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

  useEffect(() => () => {
    if (feedbackDismissTimerRef.current) clearTimeout(feedbackDismissTimerRef.current);
  }, []);

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
      const saved = await loadWorkoutProgress(planDayId, data.workoutMode);
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
  const activeIsTimed = isTimedWorkoutTarget(activeExerciseReps);
  const activeExerciseIndex = activeExercise ? trackableExercises.findIndex((exercise) => exercise.exerciseId === activeExercise.exerciseId) : 0;
  const activeDone = activeExercise ? completed.has(activeExercise.exerciseId) : false;
  const activeSets = Math.max(1, Number(activeExercise?.sets || 1));
  const activeSetCount = activeExercise ? Math.min(activeSets, setProgress[activeExercise.exerciseId] || 0) : 0;
  const activeSetNumber = Math.min(activeSets, activeSetCount + 1);
  const activeRest = Number(activeExercise?.restSec || 0);
  const activeNotes = cleanExerciseNotes(activeExercise?.notes || '');
  const dayMuscles = useMemo(() => deriveWorkoutMuscles(detail), [detail]);
  const activeMuscles = useMemo(
    () => deriveExerciseMuscles(activeExercise, dayMuscles),
    [activeExercise, dayMuscles],
  );
  const activeAlternativeChoices = useMemo(() => {
    const sourceMuscles = deriveExerciseMuscles(originalActiveExercise, dayMuscles);
    const choices = (originalActiveExercise?.alternatives || [])
      .map((alternative, index) => ({ alternative, index }));
    const compatibleChoices = choices.filter(({ alternative }) => haveCompatibleMuscleTargets(
        sourceMuscles,
        deriveExerciseMuscles(alternative),
      ));
    return compatibleChoices.length ? compatibleChoices : choices;
  }, [dayMuscles, originalActiveExercise]);
  const activeCues = exerciseCues(activeNotes, activeExercise);
  const workoutSnapshot = useMemo(
    () => getWorkoutProgressSnapshot(trackableExercises, completed, setProgress),
    [completed, setProgress, trackableExercises],
  );
  const workoutEtaLabel = workoutSnapshot.estimatedRemainingSeconds > 0
    ? `${formatEstimatedTime(workoutSnapshot.estimatedRemainingSeconds)} left`
    : 'Complete';
  const workoutPlanProgressLabel = workoutSnapshot.completedMovements > 0
    ? `${workoutSnapshot.completedMovements} of ${trackableExercises.length} movements complete`
    : `${trackableExercises.length} movements`;
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

  const activeVideoUrl = activeExercise ? videoUrlForExercise(activeExercise) : '';

  useEffect(() => {
    setVideoReloadKey((value) => value + 1);
    setVideoReplacementStatus('idle');
  }, [activeExerciseId, activeExercise?.exerciseName]);

  useEffect(() => {
    if (videoReplacementStatus !== 'changed' && videoReplacementStatus !== 'unavailable') return undefined;
    const timeout = setTimeout(() => setVideoReplacementStatus('idle'), videoReplacementStatus === 'changed' ? 1600 : 2600);
    return () => clearTimeout(timeout);
  }, [videoReplacementStatus]);

  const tryAnotherActiveVideo = useCallback(async () => {
    if (!activeExercise || !detail?.planDayId || videoReplacementStatus === 'finding') return;
    const currentUrl = videoUrlForExercise(activeExercise);
    setVideoReplacementStatus('finding');
    try {
      const replacement = await replaceWorkoutVideo({
        planDayId: detail.planDayId,
        workoutMode: detail.workoutMode,
        exerciseId: activeExercise.exerciseId,
        exerciseName: activeExercise.exerciseName,
        order: activeExercise.order,
        focus: detail.focus,
        previousVideoUrl: currentUrl,
      });
      if (!isPlayableVideo(replacement.videoUrl) || replacement.videoUrl === currentUrl) {
        throw new Error('No different video was found');
      }
      const key = videoResolveKey(activeExercise);
      setResolvedVideoUrls((value) => ({ ...value, [key]: replacement.videoUrl }));
      setDetail((value) => value
        ? {
            ...value,
            exercises: value.exercises.map((entry) => (
              videoResolveKey(entry) === key ? { ...entry, videoUrl: replacement.videoUrl } : entry
            )),
          }
        : value);
      setVideoReloadKey((value) => value + 1);
      setVideoReplacementStatus('changed');
    } catch {
      setVideoReplacementStatus('unavailable');
    }
  }, [activeExercise, detail?.focus, detail?.planDayId, detail?.workoutMode, videoReplacementStatus, videoUrlForExercise]);
  const videoReplacementLabel = videoReplacementStatus === 'finding'
    ? 'Finding…'
    : videoReplacementStatus === 'changed'
      ? 'Changed'
      : videoReplacementStatus === 'unavailable'
        ? 'None found'
        : 'Try another';

  useEffect(() => {
    if (!activeExerciseId || activeDone) {
      setRepInput('');
      setWeightInput('');
      return;
    }
    const existing = activeSetLogs.find((log) => log.setNumber === activeSetNumber);
    setRepInput(activeIsTimed ? '' : existing?.reps || defaultRepsFromPrescription(activeExerciseReps));
    setWeightInput(existing?.weight || '');
  }, [activeDone, activeExerciseId, activeExerciseReps, activeIsTimed, activeSetLogs, activeSetNumber]);

  const persistSets = useCallback(
    async (next: Record<string, number>, completedSet = completed, logsOverride = setLogs) => {
      await saveWorkoutProgress({
        planDayId,
        workoutMode: detail?.workoutMode ?? mode,
        completedExerciseIds: Array.from(completedSet),
        setProgressByExercise: next,
        setLogsByExercise: logsOverride,
        selectedAlternatesByExercise: selectedAlternates,
        updatedAt: new Date().toISOString(),
      });
    },
    [completed, detail?.workoutMode, mode, planDayId, selectedAlternates, setLogs],
  );

  const selectExerciseVariant = async (alternateIndex?: number) => {
    if (!activeExerciseId || completed.has(activeExerciseId) || setLogs[activeExerciseId]?.length) return;
    const next = { ...selectedAlternates };
    if (alternateIndex === undefined) delete next[activeExerciseId];
    else next[activeExerciseId] = alternateIndex;
    setSelectedAlternates(next);
    setMovementStarted(false);
    await saveWorkoutProgress({
      planDayId,
      workoutMode: detail?.workoutMode ?? mode,
      completedExerciseIds: Array.from(completed),
      setProgressByExercise: setProgress,
      setLogsByExercise: setLogs,
      selectedAlternatesByExercise: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const submitActiveFeedback = async () => {
    if (!activeExercise || !originalActiveExercise || !detail || feedbackSubmitting || feedbackSaved) return;
    const currentAlternateIndex = selectedAlternates[activeExerciseId];
    const nextAlternateIndex = feedbackSentiment === 'down' ? feedbackAlternateIndex : currentAlternateIndex;
    const feedbackExercise = exerciseWithSelectedVariant(originalActiveExercise, nextAlternateIndex);
    const movementChanged = feedbackSentiment === 'down'
      && feedbackExercise.exerciseName !== activeExercise.exerciseName;
    const preferenceText = movementChanged
      ? `Prefer ${feedbackExercise.exerciseName} instead of ${activeExercise.exerciseName}.`
      : '';
    setFeedbackSaved(false);
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
      setFeedbackSaved(true);
      if (feedbackDismissTimerRef.current) clearTimeout(feedbackDismissTimerRef.current);
      feedbackDismissTimerRef.current = setTimeout(() => {
        setFeedbackOpen(false);
        setFeedbackText('');
        setFeedbackSentiment('up');
        setFeedbackAlternateIndex(undefined);
        setFeedbackSaved(false);
        feedbackDismissTimerRef.current = null;
      }, 900);
    } catch (submitError) {
      Alert.alert('Could not save feedback', submitError instanceof Error ? submitError.message : 'Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const openActiveFeedback = () => {
    if (feedbackDismissTimerRef.current) clearTimeout(feedbackDismissTimerRef.current);
    feedbackDismissTimerRef.current = null;
    setFeedbackText('');
    setFeedbackSentiment('up');
    setFeedbackAlternateIndex(selectedAlternates[activeExerciseId]);
    setFeedbackSaved(false);
    setFeedbackOpen(true);
  };

  const closeActiveFeedback = () => {
    if (feedbackDismissTimerRef.current) clearTimeout(feedbackDismissTimerRef.current);
    feedbackDismissTimerRef.current = null;
    setFeedbackOpen(false);
    setFeedbackText('');
    setFeedbackSentiment('up');
    setFeedbackAlternateIndex(undefined);
    setFeedbackSaved(false);
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
      exercises: buildCompletedExercises(trackableExercises, nextCompleted, logsOverride),
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
    saveWorkoutProgress({
      planDayId,
      workoutMode: detail?.workoutMode ?? mode,
      completedExerciseIds: Array.from(completed),
      setProgressByExercise: setProgress,
      setLogsByExercise: setLogs,
      selectedAlternatesByExercise: selectedAlternates,
      activeExerciseId,
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
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
      reps: activeIsTimed ? '' : repInput.trim(),
      weight: activeNeedsWeight ? weightInput.trim() : '',
      durationSec: setElapsed,
      exerciseName: activeExercise.exerciseName,
      plannedSets: activeExercise.sets,
      plannedReps: activeExercise.reps,
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
          workoutMode: detail?.workoutMode ?? mode,
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
        workoutMode: detail?.workoutMode ?? mode,
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
      workoutMode: detail?.workoutMode ?? mode,
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
        exercises: buildCompletedExercises(trackableExercises, completed, setLogs),
      });
      await clearWorkoutProgress(planDayId, detail.workoutMode);
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
    } catch (saveError) {
      Alert.alert('Could not save workout', saveError instanceof Error ? saveError.message : 'Please try again.');
    } finally {
      setFinishing(false);
    }
  }, [completed, detail, planDayId, navigation, setLogs, trackableExercises]);

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

      <ScrollView
        style={[styles.executionShell, compactStep && styles.executionShellCompact, movementStarted && styles.executionShellActive]}
        contentContainerStyle={styles.executionContent}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.movementHead}>
            <Text style={styles.movementKicker}>Movement {activeExerciseIndex + 1} of {trackableExercises.length}</Text>
          </View>

          <Text style={styles.activeName}>{activeExercise.exerciseName}</Text>

          <TouchableOpacity
            onPress={() => setFlowOpen(true)}
            activeOpacity={0.84}
            style={styles.workoutPlanCard}
            accessibilityRole="button"
            accessibilityLabel={`View workout plan. ${workoutPlanProgressLabel}. ${workoutEtaLabel}.`}
          >
            <View style={styles.workoutPlanIcon}>
              <Feather name="clipboard" size={17} color={colors.ink} />
            </View>
            <View style={styles.workoutPlanCopy}>
              <Text style={styles.workoutPlanTitle}>View workout plan</Text>
              <Text style={styles.workoutPlanMeta} numberOfLines={1}>
                {workoutPlanProgressLabel} · {workoutEtaLabel}
              </Text>
            </View>
            <View style={styles.workoutPlanArrow}>
              <Feather name="chevron-right" size={19} color={colors.ink} />
            </View>
          </TouchableOpacity>

          {!movementStarted && activeMuscles.length ? (
            <View style={styles.muscleMapCard}>
              <View style={styles.muscleMapCopy}>
                <Text style={styles.muscleMapKicker}>Muscles working</Text>
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

          <View style={styles.trainingStage}>
            <InlineTechniqueVideo
              exerciseName={activeExercise.exerciseName}
              url={activeVideoUrl}
              resolving={activeVideoResolving}
              reloadKey={videoReloadKey}
            />
            <View style={styles.stageVideoActions}>
              <TouchableOpacity
                onPress={() => setVideoReloadKey((value) => value + 1)}
                disabled={!isPlayableVideo(activeVideoUrl)}
                style={[styles.stageOverlayButton, !isPlayableVideo(activeVideoUrl) && styles.stageVideoButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Replay technique video"
              >
                <Feather name="rotate-ccw" size={17} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={tryAnotherActiveVideo}
                disabled={videoReplacementStatus === 'finding'}
                style={styles.stageOverlayButtonWide}
                accessibilityRole="button"
                accessibilityLabel={videoReplacementLabel}
                accessibilityState={{ busy: videoReplacementStatus === 'finding' }}
              >
                {videoReplacementStatus === 'finding' ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Feather name={videoReplacementStatus === 'changed' ? 'check' : videoReplacementStatus === 'unavailable' ? 'info' : 'refresh-cw'} size={16} color={colors.white} />
                )}
                <Text style={styles.stageOverlayButtonText} numberOfLines={1}>{videoReplacementLabel}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.stageMetricsOverlay}>
                <View style={styles.stageMetricOverlay}>
                  <Text style={styles.stageMetricLabel}>Set</Text>
                  <Text style={styles.stageMetricValue}>{activeSetNumber} / {activeSets}</Text>
                </View>
                <View style={styles.stageMetricDivider} />
                <View style={styles.stageMetricOverlay}>
                  <Text style={styles.stageMetricLabel}>Target</Text>
                  <Text style={styles.stageMetricValue} numberOfLines={1}>{displayValue(activeExercise.reps)}</Text>
                </View>
                <View style={styles.stageMetricDivider} />
                <View style={styles.stageMetricOverlay}>
                  <Text style={styles.stageMetricLabel}>Rest</Text>
                  <Text style={styles.stageMetricValue}>{displayValue(activeExercise.restSec, '0')}s</Text>
                </View>
            </View>
          </View>

          {!movementStarted ? (
            <View style={styles.prepContent}>
              <View style={styles.coachCueCard}>
                <View style={styles.coachCueHeader}>
                  <WorkoutSessionArtwork kind="form" size={40} />
                  <Text style={styles.coachCueKicker}>Form cues</Text>
                </View>
                <View style={styles.coachCueList}>
                  {activeCues.slice(0, 2).map((cue, index) => (
                    <View key={`${index}-${cue}`} style={styles.coachCueRow}>
                      <View style={styles.coachCueNumber}>
                        <Text style={styles.coachCueNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.coachCueText}>{cue}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {activeLastLog ? (
                <View style={styles.lastLogCard}>
                  <WorkoutSessionArtwork kind="logged" size={38} />
                  <Text style={styles.lastLogText}>
                    Last set: {activeIsTimed ? formatTimer(activeLastLog.durationSec || 0) : `${activeLastLog.reps || '—'} reps`}{activeLastLog.weight ? ` · ${activeLastLog.weight} kg` : ''}{!activeIsTimed && activeLastLog.durationSec ? ` · ${formatTimer(activeLastLog.durationSec)}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.liveContent}>
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
              </View>
              <View style={styles.coachCueCard}>
                <View style={styles.coachCueHeader}>
                  <WorkoutSessionArtwork kind="form" size={40} />
                  <Text style={styles.coachCueKicker}>Form cues</Text>
                </View>
                <View style={styles.coachCueList}>
                  {activeCues.slice(0, 2).map((cue, index) => (
                    <View key={`${index}-${cue}`} style={styles.coachCueRow}>
                      <View style={styles.coachCueNumber}>
                        <Text style={styles.coachCueNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.coachCueText}>{cue}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
      </ScrollView>

      <View style={[styles.actionDock, { paddingBottom: insets.bottom + spacing.sm }]}>
        {timer.running ? (
          <WorkoutRestDock
            remaining={timer.remaining}
            nextLabel={restTargetLabel}
            onAddTime={addRestTime}
            onSkip={skipRest}
          />
        ) : movementStarted ? (
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
            trailing={!activeDone && !timer.running ? <WorkoutSessionArtwork kind="begin" size={72} /> : undefined}
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
        setProgress={setProgress}
        onSelect={(index) => {
          setFlowOpen(false);
          moveToExercise(index);
        }}
        onClose={() => setFlowOpen(false)}
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
        timed={activeIsTimed}
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
        alternativeChoices={activeAlternativeChoices}
        currentAlternateIndex={selectedAlternates[activeExerciseId]}
        selectedAlternateIndex={feedbackAlternateIndex}
        sentiment={feedbackSentiment}
        feedbackText={feedbackText}
        submitting={feedbackSubmitting}
        saved={feedbackSaved}
        canChangeExercise={!activeDone && !activeSetLogs.length}
        onSentiment={(value) => {
          setFeedbackSentiment(value);
          if (value === 'up') setFeedbackAlternateIndex(selectedAlternates[activeExerciseId]);
        }}
        onSelectAlternate={(index) => {
          setFeedbackAlternateIndex(index);
          if (index !== selectedAlternates[activeExerciseId]) setFeedbackSentiment('down');
        }}
        onFeedbackText={setFeedbackText}
        onClose={closeActiveFeedback}
        onSubmit={submitActiveFeedback}
      />
    </View>
  );
}

export const WorkoutDetailScreen = FocusedWorkoutDetailScreen;

function InlineTechniqueVideo({
  exerciseName,
  url,
  resolving,
  reloadKey,
}: {
  exerciseName: string;
  url: string;
  resolving: boolean;
  reloadKey: number;
}) {
  const playable = isPlayableVideo(url);
  return (
    <View style={styles.inlineVideoSurface}>
        {playable ? (
          <ExerciseVideo key={`${exerciseName}-${reloadKey}-${url}`} url={url} fill style={styles.inlineVideoPlayer} />
        ) : (
          <View style={styles.inlineVideoPreparing}>
            <TechniqueVideoBackdrop resolving={resolving} />
            <View style={styles.inlineVideoPreparingCopy} pointerEvents="none">
              <Text style={styles.inlineVideoPreparingTitle}>{resolving ? 'Preparing demonstration' : 'Video unavailable'}</Text>
              <Text style={styles.inlineVideoPreparingText}>{resolving ? 'Finding a clear form reference' : 'Use the form notes below for this set.'}</Text>
            </View>
          </View>
        )}
    </View>
  );
}

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
  last,
  active,
  done,
  next,
  savedSets,
  onPress,
}: {
  exercise: WorkoutExerciseDetail;
  index: number;
  last: boolean;
  active: boolean;
  done: boolean;
  next: boolean;
  savedSets: number;
  onPress: () => void;
}) {
  const totalSets = Math.max(1, Number(exercise.sets || 1));
  const completedSets = done ? totalSets : Math.min(totalSets, savedSets);
  const progress = completedSets / totalSets;
  const status = done ? 'Done' : active ? 'Now' : completedSets > 0 ? 'Started' : next ? 'Next' : '';
  const setLabel = completedSets > 0
    ? `${completedSets} of ${totalSets} sets`
    : `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      style={[styles.exerciseRow, !last && styles.exerciseRowDivider, done && styles.exerciseRowDone, active && styles.exerciseRowActive]}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.exerciseName}. ${status || 'Remaining'}. ${setLabel}. Target ${displayTarget(exercise.reps)}.`}
    >
      <View style={[styles.exerciseNum, done && styles.exerciseNumDone, active && !done && styles.exerciseNumActive]}>
        {done ? <Feather name="check" size={15} color={colors.gold} /> : <Text style={[styles.exerciseNumText, active && styles.exerciseNumTextActive]}>{index + 1}</Text>}
      </View>
      <View style={styles.exerciseRowText}>
        <View style={styles.exerciseRowTitleLine}>
          <Text style={styles.exerciseRowTitle} numberOfLines={1}>{exercise.exerciseName}</Text>
          {status ? (
            <Text style={[styles.exerciseRowStatus, active && styles.exerciseRowStatusActive, done && styles.exerciseRowStatusDone]}>{status}</Text>
          ) : null}
        </View>
        <Text style={styles.exerciseRowMeta}>{setLabel} · {displayTarget(exercise.reps)}</Text>
        {!done && (active || completedSets > 0) ? (
          <View style={styles.exerciseSetTrack}>
            <View style={[styles.exerciseSetFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
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
  setProgress,
  onSelect,
  onClose,
}: {
  visible: boolean;
  exercises: WorkoutExerciseDetail[];
  activeExerciseId: string;
  completed: Set<string>;
  setProgress: Record<string, number>;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const snapshot = getWorkoutProgressSnapshot(exercises, completed, setProgress);
  const activeExercise = exercises.find((exercise) => exercise.exerciseId === activeExerciseId);
  const activeExerciseIndex = exercises.findIndex((exercise) => exercise.exerciseId === activeExerciseId);
  const remainingMovements = Math.max(0, exercises.length - snapshot.completedMovements);
  const completionPercent = Math.round(snapshot.progress * 100);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.flowSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetTitle}>Workout plan</Text>
              <Text style={styles.sheetSub}>{activeExercise ? `${activeExercise.exerciseName} in progress` : 'Your session progress'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close workout snapshot">
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.flowSummary}>
            <View style={styles.flowSummaryHeadline}>
              <View style={styles.flowSummaryMetric}>
                <Text style={styles.flowSummaryValue}>{completionPercent}%</Text>
                <Text style={styles.flowSummaryLabel}>Session complete</Text>
              </View>
              <View style={styles.flowSummaryTime}>
                <Feather name="clock" size={15} color={colors.inkMuted} />
                <View>
                  <Text style={styles.flowSummaryTimeValue}>{formatEstimatedTime(snapshot.estimatedRemainingSeconds)}</Text>
                  <Text style={styles.flowSummaryTimeLabel}>remaining</Text>
                </View>
              </View>
            </View>
            <View style={styles.flowProgressTrack}>
              <View style={[styles.flowProgressFill, { width: `${Math.round(snapshot.progress * 100)}%` }]} />
            </View>
            <View style={styles.flowProgressFooter}>
              <Text style={styles.flowMovementProgress}>{snapshot.completedMovements} of {exercises.length} movements · {snapshot.savedSets} of {snapshot.totalSets} sets</Text>
            </View>
          </View>
          <View style={styles.flowListHead}>
            <Text style={styles.flowListTitle}>Movements</Text>
            <Text style={styles.flowListHint}>{remainingMovements} remaining</Text>
          </View>
          <ScrollView style={styles.flowList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.exerciseList}>
            {exercises.map((exercise, index) => (
              <ExerciseRow
                key={exercise.exerciseId}
                exercise={exercise}
                index={index}
                last={index === exercises.length - 1}
                active={exercise.exerciseId === activeExerciseId}
                done={completed.has(exercise.exerciseId)}
                next={index === activeExerciseIndex + 1}
                savedSets={setProgress[exercise.exerciseId] || 0}
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
  alternativeChoices,
  currentAlternateIndex,
  selectedAlternateIndex,
  sentiment,
  feedbackText,
  submitting,
  saved,
  canChangeExercise,
  onSentiment,
  onSelectAlternate,
  onFeedbackText,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  exerciseName: string;
  originalExercise?: WorkoutExerciseDetail | null;
  alternativeChoices: Array<{
    alternative: NonNullable<WorkoutExerciseDetail['alternatives']>[number];
    index: number;
  }>;
  currentAlternateIndex?: number;
  selectedAlternateIndex?: number;
  sentiment: WorkoutFeedbackSentiment;
  feedbackText: string;
  submitting: boolean;
  saved: boolean;
  canChangeExercise: boolean;
  onSentiment: (value: WorkoutFeedbackSentiment) => void;
  onSelectAlternate: (index?: number) => void;
  onFeedbackText: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const movementWillChange = currentAlternateIndex !== selectedAlternateIndex;
  const exerciseChoices = originalExercise
    ? [
        { exerciseName: originalExercise.exerciseName, index: undefined as number | undefined },
        ...alternativeChoices.map(({ alternative, index }) => ({ exerciseName: alternative.exerciseName, index })),
      ]
    : [];
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
              <Text style={styles.sheetSub}>{canChangeExercise ? 'Share what worked or choose a better exercise.' : 'Share what worked for your next workout.'}</Text>
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
                  <Text style={[styles.sentimentText, active && styles.sentimentTextSelected]}>{value === 'up' ? 'Works' : canChangeExercise ? 'Change it' : 'Needs adjustment'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {canChangeExercise && originalExercise && alternativeChoices.length ? (
            <View style={styles.feedbackAlternateSection}>
              <Text style={styles.feedbackAlternateTitle}>Prefer another exercise?</Text>
              <Text style={styles.feedbackAlternateSubtitle}>Choose one below. It replaces {exerciseName} when you save.</Text>
              <View style={styles.feedbackAlternateList}>
                {exerciseChoices.map((choice) => {
                  const selected = selectedAlternateIndex === choice.index;
                  const current = currentAlternateIndex === choice.index;
                  return (
                    <TouchableOpacity
                      key={`${choice.exerciseName}:${choice.index ?? 'original'}`}
                      onPress={() => onSelectAlternate(choice.index)}
                      activeOpacity={0.86}
                      style={[styles.feedbackAlternateOption, selected && styles.feedbackAlternateOptionSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={current ? `${choice.exerciseName}, current exercise` : `Switch to ${choice.exerciseName} instead`}
                    >
                      <View style={[styles.feedbackAlternateRadio, selected && styles.feedbackAlternateRadioSelected]}>
                        {selected ? <Feather name="check" size={13} color={colors.onPrimary} /> : null}
                      </View>
                      <View style={styles.feedbackAlternateOptionCopy}>
                        <Text style={[styles.feedbackAlternateOptionTitle, selected && styles.feedbackAlternateOptionTitleSelected]}>{choice.exerciseName}</Text>
                        <Text style={styles.feedbackAlternateOptionMeta}>
                          {current ? 'Current exercise' : selected ? `Will replace ${exerciseName} when you save` : 'Switch to this exercise instead'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {movementWillChange ? (
                <View style={styles.feedbackAlternateNotice}>
                  <Feather name="info" size={15} color={colors.gold} />
                  <Text style={styles.feedbackAlternateNoticeText}>Muscles, form guidance and the technique video will update after saving.</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.feedbackNoteHead}>
            <Text style={styles.feedbackNoteTitle}>Anything else?</Text>
            <Text style={styles.feedbackNoteOptional}>Optional</Text>
          </View>
          <TextInput
            value={feedbackText}
            onChangeText={onFeedbackText}
            placeholder="Tell us what you'd like adjusted."
            placeholderTextColor={colors.inkSubtle}
            multiline
            style={styles.feedbackInput}
            textAlignVertical="top"
          />
          <TouchableOpacity
            onPress={onSubmit}
            disabled={submitting || saved}
            activeOpacity={0.86}
            style={[styles.sheetSaveButton, saved && styles.feedbackSaveButtonSaved]}
            accessibilityRole="button"
            accessibilityLabel="Save workout feedback"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.sheetSaveText}>{saved ? 'Feedback saved' : submitting ? 'Saving...' : 'Save feedback'}</Text>
            <Feather name={saved ? 'check' : 'arrow-right'} size={18} color={saved ? colors.onPrimary : colors.white} />
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
    const animation = Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(cardLift, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.spring(rewardScale, { toValue: 1, friction: 5, tension: 90, delay: 100, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
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

function SetEntryModal({
  visible,
  exerciseName,
  setNumber,
  setTotal,
  elapsed,
  reps,
  weight,
  needsWeight,
  timed,
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
  timed: boolean;
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
  const { width: viewportWidth } = useWindowDimensions();
  const useInputColumns = needsWeight && viewportWidth >= 360;
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveResult, setSaveResult] = useState<SetSaveResult | null>(null);
  const successScale = useRef(new Animated.Value(0.65)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successLift = useRef(new Animated.Value(16)).current;
  const successAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const saveGeneration = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setSavePhase('idle');
    setSaveResult(null);
    successScale.setValue(0.65);
    successOpacity.setValue(0);
    successLift.setValue(16);
    return () => {
      saveGeneration.current += 1;
      successAnimation.current?.stop();
      successAnimation.current = null;
    };
  }, [successLift, successOpacity, successScale, visible]);

  const handleClose = () => {
    if (savePhase === 'idle' || savePhase === 'error') onCancel();
  };

  const handleSave = async () => {
    if (savePhase !== 'idle' && savePhase !== 'error') return;
    const generation = saveGeneration.current;
    setSavePhase('saving');
    try {
      const result = await onSave();
      if (generation !== saveGeneration.current) return;
      if (!result) throw new Error('Set could not be saved');
      setSaveResult(result);
      setSavePhase('success');
      successScale.setValue(0.65);
      successOpacity.setValue(0);
      successLift.setValue(16);
      const animation = Animated.sequence([
        Animated.parallel([
          Animated.spring(successScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
          Animated.timing(successOpacity, { toValue: 1, duration: 170, useNativeDriver: true }),
          Animated.timing(successLift, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]),
        Animated.delay(result.workoutComplete ? 1100 : 850),
        Animated.timing(successOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]);
      successAnimation.current = animation;
      animation.start(({ finished }) => {
        if (finished && generation === saveGeneration.current) {
          successAnimation.current = null;
          onCelebrationComplete(result);
        }
      });
    } catch {
      if (generation === saveGeneration.current) setSavePhase('error');
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
    ? 'Every set is saved. Your recap is ready.'
    : saveResult?.movementComplete
      ? 'All sets complete. Your next movement is ready.'
      : saveResult
        ? `${saveResult.setTotal - saveResult.savedSetNumber} ${saveResult.setTotal - saveResult.savedSetNumber === 1 ? 'set' : 'sets'} remaining in this movement.`
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
              <View style={styles.setSaveSuccessHead}>
                <Animated.View style={[styles.setSaveSuccessIcon, { transform: [{ scale: successScale }] }]}>
                  <View style={styles.setSaveSuccessIconInner}>
                    <Feather
                      name={saveResult.workoutComplete ? 'award' : 'check'}
                      size={23}
                      color={colors.onPrimary}
                    />
                  </View>
                </Animated.View>
                <View style={styles.setSaveSuccessHeadCopy}>
                  <Text style={styles.setSaveSuccessKicker}>{rewardKicker}</Text>
                  <Text style={styles.setSaveSuccessTitle}>{rewardTitle}</Text>
                </View>
              </View>
              <View style={styles.setSaveSuccessExerciseRow}>
                <Feather name="activity" size={16} color={colors.gold} />
                <Text style={styles.setSaveSuccessExercise} numberOfLines={1}>{saveResult.exerciseName}</Text>
              </View>

              <View style={styles.setSaveProgressCard}>
                <View style={styles.setSaveProgressMeta}>
                  <Text style={styles.setSaveProgressLabel}>Movement progress</Text>
                  <Text style={styles.setSaveProgressValue}>{saveResult.savedSetNumber} of {saveResult.setTotal} sets</Text>
                </View>
                <View style={styles.setSaveProgressTrack}>
                  <View style={[styles.setSaveProgressFill, { width: rewardProgress }]} />
                </View>
                <Text style={styles.setSaveSuccessMessage}>{rewardMessage}</Text>
              </View>
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
                    <Text style={styles.sheetKicker}>Set {setNumber} of {setTotal}</Text>
                    <Text style={styles.setEntryTitle} numberOfLines={2}>{exerciseName}</Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} disabled={controlsLocked} style={styles.closeButton}>
                    <Feather name="x" size={20} color={colors.inkMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.setEntryMetrics}>
                  <View style={styles.setEntryMetric}>
                    <View>
                      <Text style={styles.setEntryMetricLabel}>{timed ? 'Time target' : 'Target reps'}</Text>
                      <Text style={styles.setEntryMetricValue}>{targetReps}</Text>
                    </View>
                  </View>
                  <View style={styles.setEntryMetricDivider} />
                  <View style={styles.setEntryMetric}>
                    <Feather name="clock" size={17} color={colors.inkMuted} />
                    <View>
                      <Text style={styles.setEntryMetricLabel}>Work time</Text>
                      <Text style={styles.setEntryMetricValue}>{formatTimer(elapsed)}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.sheetInputStack, useInputColumns && styles.sheetInputStackColumns]}>
                  {!timed ? <View style={[styles.sheetInputGroup, useInputColumns && styles.sheetInputGroupColumn]}>
                    <Text style={styles.sheetInputLabel}>Reps completed</Text>
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
                  </View> : null}

                  {needsWeight ? (
                    <View style={[styles.sheetInputGroup, useInputColumns && styles.sheetInputGroupColumn]}>
                      <Text style={styles.sheetInputLabel}>Weight used</Text>
                      <View style={styles.sheetStepperInputRow}>
                        <TouchableOpacity onPress={() => onAdjustWeight(-1)} disabled={controlsLocked} style={styles.sheetStepperButton} accessibilityRole="button" accessibilityLabel="Decrease weight">
                          <Feather name="minus" size={20} color={colors.accentDark} />
                        </TouchableOpacity>
                        <View style={styles.sheetLogValueWithUnit}>
                          <TextInput
                            value={weight}
                            onChangeText={onWeight}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.inkSubtle}
                            style={styles.sheetLogInputWithUnit}
                            textAlign="right"
                            editable={!controlsLocked}
                          />
                          <Text style={styles.sheetLogUnit}>kg</Text>
                        </View>
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
                  <Feather name="play" size={16} color={colors.inkMuted} />
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

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      Animated.delay(reward.type === 'set' ? 420 : 760),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
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
    overflow: 'hidden',
  },
  executionContent: { justifyContent: 'flex-start', paddingTop: spacing.sm, paddingBottom: spacing.md },
  executionShellActive: {
    backgroundColor: colors.bg,
  },
  executionShellCompact: {
    marginHorizontal: spacing.md,
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
  lastLogText: { fontSize: 15, lineHeight: 21, color: colors.ink, fontWeight: '700', flex: 1 },
  lastLogCard: {
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  workoutPlanCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  workoutPlanIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  workoutPlanCopy: { flex: 1, minWidth: 0 },
  workoutPlanTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.ink },
  workoutPlanMeta: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.inkMuted, marginTop: 2 },
  workoutPlanArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  trainingStage: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    padding: 7,
  },
  inlineVideoSurface: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  inlineVideoPlayer: { width: '100%', height: '100%', borderRadius: 0 },
  inlineVideoPreparing: { flex: 1, backgroundColor: '#090a0d' },
  inlineVideoPreparingCopy: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm },
  inlineVideoPreparingTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.white },
  inlineVideoPreparingText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.68)', marginTop: 2 },
  stageVideoActions: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  stageOverlayButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15161b',
    borderWidth: 1,
    borderColor: '#303138',
  },
  stageOverlayButtonWide: {
    minHeight: 44,
    maxWidth: 150,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    backgroundColor: '#15161b',
    borderWidth: 1,
    borderColor: '#303138',
  },
  stageOverlayButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.white, flexShrink: 1 },
  stageMetricsOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 2,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: '#15161b',
    borderWidth: 1,
    borderColor: '#303138',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  stageMetricOverlay: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  stageMetricDivider: { width: 1, height: 32, backgroundColor: '#303138' },
  stageMetricLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800', color: '#9a9ba3', textTransform: 'uppercase', letterSpacing: 0.8 },
  stageMetricValue: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: colors.white, marginTop: 2 },
  stageVideoButtonDisabled: { opacity: 0.42 },
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  coachCueHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coachCueKicker: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.ink },
  coachCueList: { marginTop: spacing.xs },
  coachCueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  coachCueNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  coachCueNumberText: { fontSize: 11, lineHeight: 14, fontWeight: '900', color: colors.gold },
  coachCueText: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.ink, flex: 1 },
  liveWorkoutCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  liveTimerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  liveTimerLabel: { ...typography.overline, fontSize: 12, lineHeight: 17, color: colors.gold, textTransform: 'uppercase' },
  liveTimer: { fontSize: 34, lineHeight: 39, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  liveTimerMeta: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.ink, marginTop: 1 },
  liveProgressTrack: {
    height: 6,
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
  activeName: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink, marginTop: spacing.xs, letterSpacing: -0.25 },
  muscleMapCard: {
    minHeight: 108,
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
  muscleMapTag: { borderRadius: radius.pill, backgroundColor: colors.panelMuted, paddingHorizontal: 9, paddingVertical: 5 },
  muscleMapTagText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.accentDark },
  muscleMapFigure: { width: 124, alignSelf: 'stretch', justifyContent: 'center' },
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
  prepContent: { paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: spacing.sm },
  liveContent: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
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
  exerciseList: { overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  flowList: { flexShrink: 1 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 68,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exerciseRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  exerciseRowActive: { backgroundColor: colors.panelRaised },
  exerciseRowDone: { backgroundColor: colors.panel },
  exerciseNum: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  exerciseNumDone: { backgroundColor: colors.accentLight },
  exerciseNumActive: { backgroundColor: colors.gold, borderWidth: 0 },
  exerciseNumText: { ...typography.bodyBold, color: colors.inkMuted },
  exerciseNumTextActive: { color: colors.onPrimary, fontWeight: '900' },
  exerciseRowText: { flex: 1, minWidth: 0 },
  exerciseRowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  exerciseRowTitle: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  exerciseRowStatus: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: colors.inkSubtle },
  exerciseRowStatusActive: { color: colors.accentDark },
  exerciseRowStatusDone: { color: colors.gold },
  exerciseRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  exerciseSetTrack: { height: 3, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden', marginTop: 7 },
  exerciseSetFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  feedbackSheet: {
    maxHeight: '90%',
    flexGrow: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
  },
  setEntrySheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
  },
  setEntrySheetCompact: { maxHeight: '58%' },
  setEntrySheetSuccess: {
    minHeight: 300,
    backgroundColor: colors.panelRaised,
  },
  setEntryHandle: { marginTop: spacing.sm, marginBottom: 0 },
  setEntryHandleSuccess: { backgroundColor: colors.borderStrong },
  setSaveSuccess: {
    minHeight: 280,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  setSaveSuccessHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  setSaveSuccessHeadCopy: { flex: 1, minWidth: 0 },
  setSaveSuccessIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setSaveSuccessIconInner: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setSaveSuccessKicker: {
    ...typography.overline,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  setSaveSuccessTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.2,
    color: colors.ink,
    marginTop: 2,
  },
  setSaveSuccessExerciseRow: {
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
  },
  setSaveSuccessExercise: {
    ...typography.bodyBold,
    color: colors.inkMuted,
    flex: 1,
  },
  setSaveProgressCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  setSaveProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    marginTop: spacing.sm,
  },
  setEntryContentScroll: { flexGrow: 0, flexShrink: 1 },
  setEntryContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  setEntryHeadText: { flex: 1 },
  setEntryTitle: { ...typography.title, color: colors.ink, marginTop: 3 },
  setEntryMetrics: {
    minHeight: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  setEntryMetric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  setEntryMetricDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: colors.borderStrong },
  setEntryMetricLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: colors.inkSubtle, textTransform: 'uppercase', letterSpacing: 0.7 },
  setEntryMetricValue: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: colors.ink, marginTop: 1, fontVariant: ['tabular-nums'] },
  sheetInputStack: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  sheetInputStackColumns: { flexDirection: 'row', alignItems: 'flex-start' },
  sheetInputGroup: {
    gap: 6,
  },
  sheetInputGroupColumn: { flex: 1, minWidth: 0 },
  sheetInputLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  sheetStepperInputRow: {
    minHeight: 58,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  sheetStepperButton: {
    width: 42,
    height: 42,
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  sheetLogValueWithUnit: { flex: 1, minWidth: 48, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3 },
  sheetLogInputWithUnit: { minWidth: 30, maxWidth: 66, paddingHorizontal: 0, paddingVertical: 0, fontSize: 24, lineHeight: 30, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] },
  sheetLogUnit: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
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
    flex: 0.72,
    minHeight: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sheetSecondaryText: { ...typography.bodyBold, color: colors.inkMuted },
  sheetSaveButton: {
    flex: 1.28,
    minHeight: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryAction,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  sheetSaveButtonSaving: { opacity: 0.86 },
  feedbackSaveButtonSaved: {
    backgroundColor: colors.success,
    shadowOpacity: 0,
    elevation: 0,
  },
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
    maxHeight: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  flowSummary: {
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  flowSummaryHeadline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flowSummaryMetric: { flex: 1 },
  flowSummaryValue: { fontSize: 27, lineHeight: 31, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'] },
  flowSummaryLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.inkMuted, marginTop: 1 },
  flowSummaryTime: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  flowSummaryTimeValue: { fontSize: 20, lineHeight: 24, fontWeight: '900', color: colors.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
  flowSummaryTimeLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.inkMuted, textAlign: 'right' },
  flowProgressTrack: { height: 5, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden', marginTop: spacing.sm },
  flowProgressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  flowProgressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  flowMovementProgress: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.inkMuted },
  flowListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, marginBottom: spacing.sm, paddingHorizontal: 2 },
  flowListTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: colors.ink },
  flowListHint: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.inkSubtle },
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
  sentimentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  sentimentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sentimentSelected: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  sentimentText: { ...typography.bodyBold, color: colors.accentDark },
  sentimentTextSelected: { color: colors.white },
  feedbackAlternateSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  feedbackAlternateTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800', color: colors.ink },
  feedbackAlternateSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  feedbackAlternateList: { gap: spacing.xs, marginTop: spacing.sm },
  feedbackAlternateOption: {
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  feedbackAlternateOptionSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.accentLight,
  },
  feedbackAlternateRadio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackAlternateRadioSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.gold,
  },
  feedbackAlternateOptionCopy: { flex: 1, minWidth: 0 },
  feedbackAlternateOptionTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  feedbackAlternateOptionTitleSelected: { color: colors.accentDark },
  feedbackAlternateOptionMeta: { fontSize: 12, lineHeight: 17, color: colors.inkMuted, marginTop: 1 },
  feedbackAlternateNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  feedbackAlternateNoticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.inkMuted },
  feedbackNoteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  feedbackNoteTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  feedbackNoteOptional: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: colors.inkSubtle },
  feedbackInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
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
