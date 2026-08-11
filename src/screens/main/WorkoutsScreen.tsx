import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, ScrollView, Text, StyleSheet, RefreshControl, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState, LoadingState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { loadProfileSettingsCached, loadWorkoutDayCached, loadWorkoutPlanCached } from '../../services/preloadService';
import { fetchUserPlans, selectWorkoutPlan } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import { getSiteUrl } from '../../constants/config';
import type { AiPlanRefresh, PlanDay, ProgressSummary, TrainerInfo, UserPlanSummary } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { appTabBarStyle, hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { deriveCurrentWeekStreak, deriveWorkoutMuscles, resolveBodyGender } from '../../utils/weeklyMuscles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

const TODAY_WORKOUT_KEY_PREFIX = 'formbae_today_workout:';
const LAST_SEEN_STREAK_KEY = 'formbae_last_seen_workout_streak';
const PENDING_STREAK_CELEBRATION_KEY = 'formbae_pending_workout_streak_celebration';
const GOLD = '#f5b301';
const FLAME_CORE = '#ffe08a';
const STREAK_EMBERS = [
  { left: 9, delay: 0, size: 4, drift: -6 },
  { left: 15, delay: 0.12, size: 3, drift: 5 },
  { left: 12, delay: 0.2, size: 3.5, drift: -2 },
  { left: 18, delay: 0.28, size: 3, drift: 7 },
];

function parsePendingCompletion(raw: string | null) {
  if (!raw) return { planDayId: '', completedAt: 0 };
  try {
    const parsed = JSON.parse(raw) as { planDayId?: string; completedAt?: number };
    return {
      planDayId: String(parsed.planDayId || ''),
      completedAt: Number(parsed.completedAt || 0),
    };
  } catch {
    return { planDayId: '', completedAt: Number(raw) || 0 };
  }
}

function markPlanDayCompleted(days: PlanDay[], planDayId: string) {
  if (!planDayId) return days;
  return days.map((day) => (day.planDayId === planDayId ? { ...day, completed: true } : day));
}

function formatPlanDate(plan: UserPlanSummary) {
  const raw = plan.weekStartDate || plan.createdAt || '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveTrainerPhotoUrl(value?: string) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${getSiteUrl()}${url}`;
  return url;
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
  });
}

function GoldenStreakBadge({ streak, celebrationNonce }: { streak: number; celebrationNonce: number }) {
  const [burning, setBurning] = useState(false);
  const flicker = useRef(new Animated.Value(0)).current; // flame flicker (celebration only)
  const flare = useRef(new Animated.Value(0)).current; // glow burst
  const ember = useRef(new Animated.Value(0)).current; // rising sparks
  const pop = useRef(new Animated.Value(1)).current; // number bump
  const previousStreak = useRef<number | null>(null);
  const hasMounted = useRef(false);

  // The flame sits completely static; the whole animation only plays on a
  // streak win, then settles back to rest.
  const playFire = useCallback(() => {
    setBurning(true);
    flicker.setValue(0);
    flare.setValue(0);
    ember.setValue(0);
    pop.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(flicker, { toValue: 0.45, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(flicker, { toValue: 1, duration: 150, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
          { iterations: 4 },
        ),
        Animated.timing(flicker, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(flare, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(flare, { toValue: 0, duration: 1000, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(ember, { toValue: 1, duration: 1050, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(pop, { toValue: 1.32, friction: 4, tension: 160, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
      ]),
    ]).start(() => setBurning(false));
  }, [flicker, flare, ember, pop]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LAST_SEEN_STREAK_KEY)
      .then((value) => {
        if (!mounted) return;
        const stored = value ? Number(value) : NaN;
        previousStreak.current = Number.isFinite(stored) ? stored : streak;
        if (streak > 0 && Number.isFinite(stored) && streak > stored) {
          playFire();
        }
        return AsyncStorage.setItem(LAST_SEEN_STREAK_KEY, String(streak));
      })
      .catch(() => undefined);

    if (previousStreak.current !== null && streak > previousStreak.current) {
      previousStreak.current = streak;
    }

    return () => {
      mounted = false;
    };
  }, [playFire, streak]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (celebrationNonce > 0 && streak > 0) {
      playFire();
    }
  }, [celebrationNonce, playFire, streak]);

  // All resolve to identity / 0 at rest, so the flame is a static black icon
  // until playFire runs.
  const flameLift = flicker.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const flameRotate = flicker.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const flameScale = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const coreScale = flicker.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const goldOpacity = flicker.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const coreOpacity = flicker.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.85, 1] });
  const flareScale = flare.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] });
  const flareLift = flare.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const flareGlowOpacity = flare.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.85, 0] });
  const flareGlowScale = flare.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.7] });

  return (
    <View style={styles.streakBadge} accessibilityLabel={`${streak} consecutive workout days this week`}>
      <View style={styles.streakIconWrap}>
        <Animated.View style={[styles.streakLayer, { opacity: flareGlowOpacity }]} pointerEvents="none">
          <Animated.View style={[styles.flareCircle, { transform: [{ scale: flareGlowScale }] }]} />
        </Animated.View>
        <Animated.View
          style={[styles.streakLayer, { transform: [{ translateY: flameLift }, { translateY: flareLift }, { rotate: flameRotate }, { scale: flameScale }, { scale: flareScale }] }]}
        >
          <MaterialCommunityIcon name="fire" size={30} color={colors.ink} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.streakLayer, { opacity: goldOpacity, transform: [{ translateY: flameLift }, { translateY: flareLift }, { rotate: flameRotate }, { scale: flameScale }, { scale: flareScale }] }]}
        >
          <MaterialCommunityIcon name="fire" size={30} color={GOLD} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.streakLayer, { opacity: coreOpacity, transform: [{ translateY: flameLift }, { translateY: flareLift }, { scale: coreScale }, { scale: flareScale }] }]}
        >
          <MaterialCommunityIcon name="fire" size={18} color={FLAME_CORE} />
        </Animated.View>
        {STREAK_EMBERS.map((piece, index) => {
          const opacity = ember.interpolate({ inputRange: [piece.delay, piece.delay + 0.1, 0.75, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
          const translateY = ember.interpolate({ inputRange: [piece.delay, 1], outputRange: [0, -18], extrapolate: 'clamp' });
          const translateX = ember.interpolate({ inputRange: [piece.delay, 1], outputRange: [0, piece.drift], extrapolate: 'clamp' });
          const scale = ember.interpolate({ inputRange: [piece.delay, piece.delay + 0.15, 1], outputRange: [0.4, 1, 0.5], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={index}
              pointerEvents="none"
              style={[styles.ember, { left: piece.left, width: piece.size, height: piece.size, opacity, transform: [{ translateX }, { translateY }, { scale }] }]}
            />
          );
        })}
      </View>
      <Animated.Text style={[styles.streakValue, burning && styles.streakValueBurning, { transform: [{ scale: pop }] }]}>{streak}</Animated.Text>
    </View>
  );
}

function WorkoutDashboardScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [days, setDays] = useState<PlanDay[]>([]);
  const [title, setTitle] = useState('My workout plan');
  const [planId, setPlanId] = useState('');
  const [selectedTodayPlanDayId, setSelectedTodayPlanDayId] = useState('');
  const [focusedPlanDayId, setFocusedPlanDayId] = useState('');
  const [planDaySelectionTouched, setPlanDaySelectionTouched] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [trainerPhotoFailed, setTrainerPhotoFailed] = useState(false);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [trainer, setTrainer] = useState<TrainerInfo | null>(null);
  const [aiPlanRefresh, setAiPlanRefresh] = useState<AiPlanRefresh | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryOpening, setSummaryOpening] = useState(false);
  const [streakCelebrationNonce, setStreakCelebrationNonce] = useState(0);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plans, setPlans] = useState<UserPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [switchingPlanId, setSwitchingPlanId] = useState('');
  const [bodyGender, setBodyGender] = useState<ReturnType<typeof resolveBodyGender>>('neutral');

  const load = useCallback(async (options?: { force?: boolean }) => {
    setError(null);
    try {
      await flushWorkoutQueue();
      const [data, settings] = await Promise.all([
        loadWorkoutPlanCached({ force: options?.force }),
        loadProfileSettingsCached({ force: options?.force }).catch(() => null),
      ]);
      const plan = (data.plan || data.today?.plan) as { planId?: string; days?: PlanDay[]; title?: string; selectedWorkoutMode?: string } | undefined;
      const loadedDays = plan?.days || [];
      const loadedPlanId = plan?.planId || data.today?.plan?.planId || plan?.title || 'default';
      const savedTodayId = await AsyncStorage.getItem(`${TODAY_WORKOUT_KEY_PREFIX}${loadedPlanId}`).catch(() => null);
      const selectedDayId = savedTodayId && loadedDays.some((day) => day.planDayId === savedTodayId) ? savedTodayId : '';
      const warmDay = loadedDays.find((day) => day.planDayId === selectedDayId) || loadedDays.find((day) => !day.completed) || loadedDays[0];
      setPlanId(loadedPlanId);
      setSelectedTodayPlanDayId(selectedDayId);
      setFocusedPlanDayId(warmDay?.planDayId || '');
      setPlanDaySelectionTouched(false);
      setDays(loadedDays);
      setTitle(plan?.title || 'My workout plan');
      setProgress(data.today?.progress || null);
      setTrainer(data.today?.assignedTrainer || null);
      setAiPlanRefresh(data.aiPlanRefresh || null);
      setBodyGender(resolveBodyGender(settings?.profile?.gender));
      setTrainerPhotoFailed(false);
      if (warmDay?.planDayId) {
        loadWorkoutDayCached(warmDay.planDayId, 'standard').catch(() => undefined);
        loadWorkoutDayCached(warmDay.planDayId, 'quick').catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      navigation.getParent()?.setOptions({ tabBarStyle: appTabBarStyle });
      (async () => {
        const pending = await AsyncStorage.getItem(PENDING_STREAK_CELEBRATION_KEY).catch(() => null);
        const pendingCompletion = parsePendingCompletion(pending);
        await load({ force: Boolean(pending) });
        if (pending) {
          await AsyncStorage.removeItem(PENDING_STREAK_CELEBRATION_KEY).catch(() => undefined);
          if (pendingCompletion.planDayId) {
            setDays((value) => markPlanDayCompleted(value, pendingCompletion.planDayId));
          }
          setStreakCelebrationNonce((value) => value + 1);
        }
      })().catch(() => undefined);
    });
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  };

  const todayDay = useMemo(() => {
    if (!days.length) return null;
    const selected = days.find((day) => day.planDayId === selectedTodayPlanDayId);
    if (selected) return selected;
    return days.find((day) => !day.completed) || days[0];
  }, [days, selectedTodayPlanDayId]);
  const focusedDay = useMemo(
    () => days.find((day) => day.planDayId === focusedPlanDayId) || todayDay || days[0] || null,
    [days, focusedPlanDayId, todayDay],
  );
  useEffect(() => {
    if (!planDaySelectionTouched && todayDay?.planDayId && focusedPlanDayId !== todayDay.planDayId) {
      setFocusedPlanDayId(todayDay.planDayId);
    }
  }, [focusedPlanDayId, planDaySelectionTouched, todayDay?.planDayId]);
  const focusedMuscles = useMemo(() => deriveWorkoutMuscles(focusedDay), [focusedDay]);
  const onSwitchTodayWorkout = async (day: PlanDay) => {
    setSelectedTodayPlanDayId(day.planDayId);
    setFocusedPlanDayId(day.planDayId);
    setPlanDaySelectionTouched(false);
    setSwitcherOpen(false);
    await AsyncStorage.setItem(`${TODAY_WORKOUT_KEY_PREFIX}${planId || title || 'default'}`, day.planDayId).catch(() => undefined);
  };

  const openPlanSwitcher = async () => {
    setPlansOpen(true);
    setPlansLoading(true);
    try {
      const data = await fetchUserPlans();
      setPlans(data.plans || []);
    } catch (e) {
      Alert.alert('Could not load plans', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPlansLoading(false);
    }
  };

  const onSelectPlan = async (plan: UserPlanSummary) => {
    if (plan.isActive || switchingPlanId) return;
    setSwitchingPlanId(plan.planId);
    try {
      await selectWorkoutPlan(plan.planId);
      setPlans((current) => current.map((entry) => ({
        ...entry,
        isActive: entry.planId === plan.planId,
      })));
      await AsyncStorage.removeItem(`${TODAY_WORKOUT_KEY_PREFIX}${planId || title || 'default'}`).catch(() => undefined);
      setSelectedTodayPlanDayId('');
      setFocusedPlanDayId('');
      setPlanDaySelectionTouched(false);
      await load({ force: true });
      setPlansOpen(false);
    } catch (e) {
      setPlansOpen(false);
      await waitForNextFrame();
      Alert.alert('Could not switch plan', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSwitchingPlanId('');
    }
  };

  const openWorkoutSummary = async (day: PlanDay | null, mode: 'standard' | 'quick') => {
    if (!day || summaryOpening) return;
    setSummaryOpening(true);
    const initialDetail = await withTimeout(loadWorkoutDayCached(day.planDayId, mode, { force: Boolean(day.completed) }), 4500);
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
    await waitForNextFrame();
    navigation.navigate('WorkoutSummary', {
      planDayId: day.planDayId,
      title: day.focus,
      mode,
      ...(initialDetail ? { initialDetail } : {}),
    });
    await waitForNextFrame();
    setSummaryOpening(false);
  };

  if (loading) {
    return (
      <ScreenContainer>
        <SkeletonBlock style={styles.skeletonTitle} />
        <SkeletonBlock style={styles.skeletonSummary} />
        <SkeletonBlock style={styles.skeletonHero} />
        <View style={styles.skeletonWeek}>
          <SkeletonBlock style={styles.skeletonWeekHeader} />
          <View style={styles.skeletonWeekDays}>
            {[0, 1, 2, 3, 4, 5, 6].map((item) => <SkeletonBlock key={item} style={styles.skeletonWeekDay} />)}
          </View>
          <SkeletonBlock style={styles.skeletonFocusedWorkout} />
        </View>
      </ScreenContainer>
    );
  }

  const doneCount = days.filter((d) => d.completed).length;
  const todayCount = todayDay?.exercises?.length ?? 0;
  const planProgress = days.length ? doneCount / days.length : 0;
  const planProgressPct = Math.round(planProgress * 100);
  const currentStreak = progress?.completionHistory
    ? deriveCurrentWeekStreak(progress.completionHistory)
    : Math.min(7, progress?.currentStreak ?? 0);
  const trainerPhoto = resolveTrainerPhotoUrl(trainer?.trainerPhotoUrl);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : days.length === 0 ? (
          <EmptyState icon="calendar" title="No plan yet" message="Your workout plan will appear here once your trainer publishes it." />
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>Workout</Text>
                <ScreenTitle>{title}</ScreenTitle>
                <Text style={styles.summary}>
                  {doneCount} of {days.length} days complete
                </Text>
              </View>
              <GoldenStreakBadge streak={currentStreak} celebrationNonce={streakCelebrationNonce} />
            </View>

            <Card style={styles.todayHero}>
              <View style={styles.todayTop}>
                <Badge label="Today" tone={todayDay?.completed ? 'success' : 'accent'} icon={todayDay?.completed ? 'check' : 'zap'} />
                <View style={styles.todayTopRight}>
                  <Text style={styles.todayDay}>Day {todayDay?.dayNumber || '-'}</Text>
                  <TouchableOpacity onPress={() => setSwitcherOpen(true)} style={styles.switchButton} accessibilityRole="button" accessibilityLabel="Switch today's workout">
                    <Feather name="repeat" size={14} color={colors.inkMuted} />
                    <Text style={styles.switchText}>Switch</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.todayTitle}>{todayDay?.focus || 'Workout'}</Text>
              <Text style={styles.todayMeta}>
                {todayCount} exercise{todayCount === 1 ? '' : 's'}
                {trainer?.name ? ` · Coach ${trainer.name}` : ''}
              </Text>

              <View style={styles.heroActions}>
                <PrimaryButton
                  title={todayDay?.completed ? 'Review workout' : 'Start workout'}
                  icon="activity"
                  variant="inverted"
                  onPress={() => openWorkoutSummary(todayDay, 'standard')}
                />
                <PrimaryButton
                  title="Short workout"
                  icon="clock"
                  variant="secondary"
                  onPress={() => openWorkoutSummary(todayDay, 'quick')}
                />
              </View>
            </Card>

            {aiPlanRefresh?.due ? (
              <Card variant="accent" style={styles.aiRefreshCard}>
                <View style={styles.aiRefreshHead}>
                  <View style={styles.aiRefreshIcon}>
                    <Feather name="refresh-cw" size={20} color={colors.accentDark} />
                  </View>
                  <View style={styles.aiRefreshCopy}>
                    <Text style={styles.aiRefreshKicker}>Plan check-in</Text>
                    <Text style={styles.aiRefreshTitle}>Update your next training block</Text>
                    <Text style={styles.aiRefreshText}>
                      Tell {aiPlanRefresh.trainerName || 'your coach'} what worked and what needs to change.
                    </Text>
                  </View>
                </View>
                <View style={styles.aiRefreshMetaRow}>
                  <Badge label={`${aiPlanRefresh.planAgeDays}d old`} tone="accent" icon="calendar" />
                </View>
                <PrimaryButton
                  title="Start check-in"
                  icon="edit-3"
                  onPress={() => navigation.navigate('PlanRefresh')}
                  style={styles.aiRefreshButton}
                />
              </Card>
            ) : null}

            <SectionTitle>Your coach</SectionTitle>
            {trainer ? (
              <Card variant="outline" style={styles.trainerCard} onPress={() => navigation.navigate('Coach')}>
                <View style={styles.trainerPhotoWrap}>
                  {trainerPhoto && !trainerPhotoFailed ? (
                    <Image source={{ uri: trainerPhoto }} style={styles.trainerPhoto} resizeMode="cover" onError={() => setTrainerPhotoFailed(true)} />
                  ) : (
                    <View style={styles.trainerFallback}>
                      <Text style={styles.trainerInitial}>{(trainer.name || 'T').slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName}>{trainer.name || 'FormBae Trainer'}</Text>
                  <Text style={styles.trainerDescription}>
                    {trainer.trainerDescription || 'Guiding your workout plan, check-ins and weekly progress.'}
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            ) : (
              <Card variant="outline" style={styles.trainerCard} onPress={() => navigation.navigate('Coach')}>
                <View style={styles.trainerPhotoWrap}>
                  <View style={styles.trainerFallback}>
                    <Feather name="user-plus" size={22} color={colors.accentDark} />
                  </View>
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName}>Coach not assigned yet</Text>
                  <Text style={styles.trainerDescription}>
                    Open coach details to see assignment status and available options.
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            )}

            <View style={styles.weekSection}>
              <View style={styles.weekHeader}>
                <View style={styles.weekHeaderCopy}>
                  <Text style={styles.weekTitle}>This week</Text>
                  <Text style={styles.weekMeta}>{doneCount} of {days.length} workouts complete</Text>
                </View>
                <Text style={styles.weekPercent}>{planProgressPct}%</Text>
              </View>
              <ProgressBar value={planProgress} />

              <View style={styles.weekPicker} accessibilityRole="radiogroup">
                <View pointerEvents="none" style={styles.weekTrack} />
                {days.map((day) => {
                  const selected = day.planDayId === focusedDay?.planDayId;
                  const isToday = day.planDayId === todayDay?.planDayId;
                  return (
                    <TouchableOpacity
                      key={day.planDayId}
                      activeOpacity={0.82}
                      onPress={() => {
                        setPlanDaySelectionTouched(true);
                        setFocusedPlanDayId(day.planDayId);
                      }}
                      style={styles.weekDay}
                      hitSlop={{ top: 6, bottom: 6 }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Day ${day.dayNumber}. ${day.focus || 'Workout'}. ${day.completed ? 'Completed' : isToday ? 'Today' : 'Scheduled'}`}
                    >
                      <View
                        style={[
                          styles.weekDayNode,
                          day.completed && styles.weekDayNodeDone,
                          isToday && !day.completed && styles.weekDayNodeToday,
                          selected && !day.completed && styles.weekDayNodeSelected,
                          selected && isToday && !day.completed && styles.weekDayNodeSelectedToday,
                        ]}
                      >
                        {day.completed ? (
                          <Feather name="check" size={15} color={colors.onPrimary} />
                        ) : (
                          <Text style={[styles.weekDayNumber, isToday && styles.weekDayNumberToday, selected && styles.weekDayNumberSelected]}>
                            {day.dayNumber}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {focusedDay ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openWorkoutSummary(focusedDay, 'standard')}
                  style={styles.workoutOverviewCard}
                  accessibilityRole="button"
                  accessibilityLabel={`Open day ${focusedDay.dayNumber}, ${focusedDay.focus || 'Workout'}. ${focusedMuscles.length ? `AI target muscles: ${focusedMuscles.join(', ')}` : 'AI muscle analysis unavailable.'}`}
                >
                  <View style={styles.workoutOverviewHeader}>
                    <View style={styles.focusedWorkoutCopy}>
                      <View style={styles.focusedWorkoutStateRow}>
                        <Text style={styles.focusedWorkoutDay}>Day {focusedDay.dayNumber}</Text>
                        <View style={styles.workoutStateDivider} />
                        <Text style={[styles.focusedWorkoutState, focusedDay.planDayId === todayDay?.planDayId && styles.focusedWorkoutStateToday]}>
                          {focusedDay.completed ? 'Completed' : focusedDay.planDayId === todayDay?.planDayId ? 'Today' : 'Scheduled'}
                        </Text>
                      </View>
                      <Text style={styles.focusedWorkoutTitle}>{focusedDay.focus || 'Workout'}</Text>
                      <Text style={styles.focusedWorkoutMeta}>
                        {focusedDay.exercises?.length ?? 0} exercise{(focusedDay.exercises?.length ?? 0) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View style={styles.focusedWorkoutOpen}>
                      <Feather name="arrow-right" size={20} color={colors.ink} />
                    </View>
                  </View>

                  <View style={styles.workoutOverviewDivider} />

                  <View style={styles.targetMapHeaderCopy}>
                    <Text style={styles.targetMapEyebrow}>Targeted muscles</Text>
                    <Text style={styles.targetMapHint}>Highlighted areas update with the selected day</Text>
                  </View>

                  <WeeklyBodyMap gender={bodyGender} muscles={focusedMuscles} compact />

                  {focusedMuscles.length ? (
                    <View style={styles.targetMuscleLegend}>
                      {focusedMuscles.map((muscle) => (
                        <View key={muscle} style={styles.targetMuscleChip}>
                          <View style={styles.targetMuscleDot} />
                          <Text style={styles.targetMuscleText}>{muscle}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.targetAnalysisEmpty}>
                      <Text style={styles.targetAnalysisEmptyTitle}>AI muscle analysis unavailable</Text>
                      <Text style={styles.targetAnalysisEmptyText}>This plan needs to be re-saved by your trainer before target areas can be shown.</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openPlanSwitcher}
              style={styles.switchPlanButton}
              accessibilityRole="button"
              accessibilityLabel="Switch to another workout plan"
            >
              <View style={styles.switchPlanIcon}>
                <Feather name="layers" size={18} color={colors.goldMuted} />
              </View>
              <View style={styles.switchPlanText}>
                <Text style={styles.switchPlanTitle}>Switch workout plan</Text>
                <Text style={styles.switchPlanMeta}>Browse every plan made for you</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <WorkoutSwitchModal
        visible={switcherOpen}
        days={days}
        selectedPlanDayId={todayDay?.planDayId || ''}
        onSelect={onSwitchTodayWorkout}
        onClose={() => setSwitcherOpen(false)}
      />
      <PlanSwitcherModal
        visible={plansOpen}
        plans={plans}
        loading={plansLoading}
        switchingPlanId={switchingPlanId}
        onSelect={onSelectPlan}
        onClose={() => setPlansOpen(false)}
      />
      {summaryOpening ? (
        <View pointerEvents="auto" style={styles.summaryLoadingOverlay}>
          <LoadingState
            card
            eyebrow="Workout setup"
            message="Preparing your workout"
            hint="Loading exercises, targets, and timers."
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

export const WorkoutsScreen = WorkoutDashboardScreen;

function WorkoutSwitchModal({
  visible,
  days,
  selectedPlanDayId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  days: PlanDay[];
  selectedPlanDayId: string;
  onSelect: (day: PlanDay) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.switchSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetKicker}>Switch today</Text>
              <Text style={styles.sheetTitle}>Choose a workout</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.switchList}>
            {days.map((day) => {
              const selected = day.planDayId === selectedPlanDayId;
              const count = day.exercises?.length ?? 0;
              return (
                <TouchableOpacity key={day.planDayId} onPress={() => onSelect(day)} style={[styles.switchRow, selected && styles.switchRowSelected]}>
                  <View style={[styles.switchDayBadge, selected && styles.switchDayBadgeSelected]}>
                    {selected ? <Feather name="check" size={16} color={colors.white} /> : <Text style={styles.switchDayText}>{day.dayNumber}</Text>}
                  </View>
                  <View style={styles.switchRowText}>
                    <Text style={styles.switchRowTitle}>{day.focus || 'Workout'}</Text>
                    <Text style={styles.switchRowMeta}>
                      Day {day.dayNumber} · {count} exercise{count === 1 ? '' : 's'}{day.completed ? ' · completed' : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={selected ? colors.accent : colors.inkSubtle} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanSwitcherModal({
  visible,
  plans,
  loading,
  switchingPlanId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  plans: UserPlanSummary[];
  loading: boolean;
  switchingPlanId: string;
  onSelect: (plan: UserPlanSummary) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.switchSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetKicker}>Your plans</Text>
              <Text style={styles.sheetTitle}>Switch workout plan</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <LoadingState message="Loading your plans..." />
          ) : plans.length === 0 ? (
            <EmptyState icon="layers" title="No other plans" message="Plans your coach or AI creates will appear here so you can switch between them." />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.switchList}>
              {plans.map((plan) => {
                const dayCount = plan.days?.length ?? 0;
                const switching = switchingPlanId === plan.planId;
                const meta = [
                  plan.trainerName ? `Coach ${plan.trainerName}` : null,
                  dayCount ? `${dayCount} day${dayCount === 1 ? '' : 's'}` : null,
                  formatPlanDate(plan) || null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TouchableOpacity
                    key={plan.planId}
                    onPress={() => onSelect(plan)}
                    disabled={plan.isActive || Boolean(switchingPlanId)}
                    style={[styles.planRow, plan.isActive && styles.planRowActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: Boolean(plan.isActive) }}
                  >
                    <View style={[styles.planRowBadge, plan.isActive && styles.planRowBadgeActive]}>
                      <Feather name={plan.isActive ? 'check' : 'layers'} size={18} color={plan.isActive ? colors.white : colors.accentDark} />
                    </View>
                    <View style={styles.planRowText}>
                      <Text style={styles.planRowTitle}>{plan.title || 'Workout plan'}</Text>
                      {meta ? <Text style={styles.planRowMeta}>{meta}</Text> : null}
                    </View>
                    {plan.isActive ? (
                      <View style={styles.planActivePill}>
                        <Text style={styles.planActivePillText}>Active</Text>
                      </View>
                    ) : switching ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summaryLoadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    elevation: 40,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  scroll: {},
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  headerText: { flex: 1 },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  summary: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.xs },
  streakBadge: {
    minWidth: 72,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  streakIconWrap: {
    width: 34,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flareCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffcf4d',
  },
  ember: {
    position: 'absolute',
    bottom: 14,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  streakValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    color: colors.ink,
  },
  streakValueBurning: { color: GOLD },
  todayHero: { backgroundColor: colors.panel, borderColor: colors.borderStrong, overflow: 'hidden', padding: 20 },
  todayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todayDay: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: colors.panelMuted,
  },
  switchText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  todayTitle: { ...typography.title, color: colors.ink, marginTop: spacing.lg },
  todayMeta: { ...typography.body, color: colors.inkMuted, marginTop: 4 },
  heroActions: { gap: spacing.sm, marginTop: spacing.lg },
  aiRefreshCard: { marginTop: spacing.md },
  aiRefreshHead: { flexDirection: 'row', gap: spacing.md },
  aiRefreshIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  aiRefreshCopy: { flex: 1 },
  aiRefreshKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  aiRefreshTitle: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  aiRefreshText: { ...typography.caption, color: colors.inkMuted, marginTop: 4, lineHeight: 18 },
  aiRefreshMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  aiRefreshButton: { marginTop: spacing.md },
  trainerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md },
  trainerPhotoWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  trainerPhoto: { width: '100%', height: '100%' },
  trainerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  trainerInitial: { ...typography.title, color: colors.accentDark },
  trainerInfo: { flex: 1 },
  trainerLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase', marginBottom: 2 },
  trainerName: { ...typography.subtitle, color: colors.ink },
  trainerDescription: { ...typography.caption, color: colors.inkMuted, marginTop: 2, lineHeight: 17 },
  trainerBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  weekSection: { marginTop: spacing.xl },
  weekHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.sm },
  weekHeaderCopy: { flex: 1, minWidth: 0 },
  weekTitle: { ...typography.subtitle, color: colors.ink },
  weekMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  weekPercent: { ...typography.bodyBold, color: colors.inkMuted },
  weekPicker: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingHorizontal: 8,
    paddingTop: spacing.md,
    paddingBottom: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  weekTrack: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 32,
    height: 1,
    backgroundColor: colors.borderStrong,
    zIndex: 0,
  },
  weekDay: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  weekDayNode: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayNodeDone: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  weekDayNodeToday: { backgroundColor: colors.panelWarm, borderColor: colors.goldMuted },
  weekDayNodeSelected: { backgroundColor: colors.panelRaised, borderColor: colors.borderStrong, borderWidth: 2 },
  weekDayNodeSelectedToday: { backgroundColor: colors.panelWarm, borderColor: colors.goldMuted },
  weekDayNumber: { ...typography.label, color: colors.inkMuted, fontWeight: '700' },
  weekDayNumberToday: { color: colors.gold },
  weekDayNumberSelected: { color: colors.ink },
  workoutOverviewCard: {
    marginTop: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  workoutOverviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workoutOverviewDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  targetMapHeaderCopy: { flex: 1, minWidth: 0 },
  targetMapEyebrow: { ...typography.overline, color: colors.goldMuted, textTransform: 'uppercase' },
  targetMapHint: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  targetMuscleLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  targetMuscleChip: {
    width: '48.5%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  targetMuscleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  targetMuscleText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  targetAnalysisEmpty: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  targetAnalysisEmptyTitle: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  targetAnalysisEmptyText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  focusedWorkoutCopy: { flex: 1, minWidth: 0 },
  focusedWorkoutStateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusedWorkoutDay: { ...typography.caption, color: colors.inkSubtle },
  workoutStateDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.inkSubtle },
  focusedWorkoutState: { ...typography.caption, color: colors.inkMuted },
  focusedWorkoutStateToday: { color: colors.goldMuted, fontWeight: '700' },
  focusedWorkoutTitle: { ...typography.title, color: colors.ink, marginTop: spacing.xs },
  focusedWorkoutMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 4 },
  focusedWorkoutOpen: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchPlanButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  switchPlanIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchPlanText: { flex: 1 },
  switchPlanTitle: { ...typography.bodyBold, color: colors.ink },
  switchPlanMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  planRowActive: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  planRowBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRowBadgeActive: { backgroundColor: colors.accentFill },
  planRowText: { flex: 1, minWidth: 0 },
  planRowTitle: { ...typography.bodyBold, color: colors.ink },
  planRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  planActivePill: {
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  planActivePillText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  skeletonTitle: { width: '62%', height: 30, marginBottom: spacing.sm },
  skeletonSummary: { width: '74%', height: 14, marginBottom: spacing.md },
  skeletonHero: { height: 238, borderRadius: radius.xl, marginBottom: spacing.md },
  skeletonWeek: { marginTop: spacing.lg, gap: spacing.md },
  skeletonWeekHeader: { width: '42%', height: 20 },
  skeletonWeekDays: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  skeletonWeekDay: { width: 34, height: 34, borderRadius: radius.pill },
  skeletonFocusedWorkout: { height: 112, borderRadius: radius.lg },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  switchSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.panelRaised,
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
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  sheetKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  sheetTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  switchList: { gap: spacing.sm, paddingBottom: spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  switchRowSelected: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  switchDayBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  switchDayBadgeSelected: { backgroundColor: colors.accentFill },
  switchDayText: { ...typography.bodyBold, color: colors.accentDark },
  switchRowText: { flex: 1 },
  switchRowTitle: { ...typography.bodyBold, color: colors.ink },
  switchRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
