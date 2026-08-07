import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, ScrollView, Text, StyleSheet, RefreshControl, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState, LoadingState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { CompletionGlow } from '../../components/CompletionGlow';
import { loadWorkoutDayCached, loadWorkoutPlanCached } from '../../services/preloadService';
import { fetchUserPlans, selectWorkoutPlan } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import { getSiteUrl } from '../../constants/config';
import type { AiPlanRefresh, PlanDay, ProgressSummary, TrainerInfo, UserPlanSummary } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { appTabBarStyle, hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

const TODAY_WORKOUT_KEY_PREFIX = 'formbae_today_workout:';
const LAST_SEEN_STREAK_KEY = 'formbae_last_seen_workout_streak';
const PENDING_STREAK_CELEBRATION_KEY = 'formbae_pending_workout_streak_celebration';
const GOLD = '#f5b301';
const GOLD_DARK = '#9a5b00';
const GREEN = '#22c55e';

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
  const flame = useRef(new Animated.Value(0)).current;
  const previousStreak = useRef<number | null>(null);
  const hasMounted = useRef(false);

  const playFire = useCallback(() => {
    setBurning(true);
    flame.setValue(0);
    Animated.sequence([
      Animated.timing(flame, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(flame, {
            toValue: 0.42,
            duration: 150,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(flame, {
            toValue: 1,
            duration: 170,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        { iterations: 5 },
      ),
      Animated.timing(flame, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setBurning(false);
    });
  }, [flame]);

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

  const scale = flame.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const lift = flame.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const glowOpacity = flame.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.55, 0.9] });
  const iconOpacity = flame.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.85, 1] });

  return (
    <View style={[styles.streakBadge, burning && styles.streakBadgeBurning]} accessibilityLabel={`${streak} day streak`}>
      <Animated.View style={[styles.streakGlow, { opacity: glowOpacity, transform: [{ scale }] }]} />
      <View style={styles.streakIconWrap}>
        <MaterialCommunityIcon name="fire" size={24} color={colors.ink} />
        <Animated.View style={[styles.streakGoldIcon, { opacity: iconOpacity, transform: [{ translateY: lift }, { scale }] }]}>
          <MaterialCommunityIcon name="fire" size={27} color={GOLD} />
        </Animated.View>
      </View>
      <Text style={[styles.streakValue, burning && styles.streakValueBurning]}>{streak}</Text>
    </View>
  );
}

function WorkoutDashboardScreen({ navigation }: Props) {
  const [days, setDays] = useState<PlanDay[]>([]);
  const [title, setTitle] = useState('My workout plan');
  const [planId, setPlanId] = useState('');
  const [selectedTodayPlanDayId, setSelectedTodayPlanDayId] = useState('');
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
  const [justCompletedPlanDayId, setJustCompletedPlanDayId] = useState('');
  const [plansOpen, setPlansOpen] = useState(false);
  const [plans, setPlans] = useState<UserPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [switchingPlanId, setSwitchingPlanId] = useState('');

  const load = useCallback(async (options?: { force?: boolean }) => {
    setError(null);
    try {
      await flushWorkoutQueue();
      const data = await loadWorkoutPlanCached({ force: options?.force });
      const plan = (data.plan || data.today?.plan) as { planId?: string; days?: PlanDay[]; title?: string; selectedWorkoutMode?: string } | undefined;
      const loadedDays = plan?.days || [];
      const loadedPlanId = plan?.planId || data.today?.plan?.planId || plan?.title || 'default';
      const savedTodayId = await AsyncStorage.getItem(`${TODAY_WORKOUT_KEY_PREFIX}${loadedPlanId}`).catch(() => null);
      const selectedDayId = savedTodayId && loadedDays.some((day) => day.planDayId === savedTodayId) ? savedTodayId : '';
      const warmDay = loadedDays.find((day) => day.planDayId === selectedDayId) || loadedDays.find((day) => !day.completed) || loadedDays[0];
      setPlanId(loadedPlanId);
      setSelectedTodayPlanDayId(selectedDayId);
      setDays(loadedDays);
      setTitle(plan?.title || 'My workout plan');
      setProgress(data.today?.progress || null);
      setTrainer(data.today?.assignedTrainer || null);
      setAiPlanRefresh(data.aiPlanRefresh || null);
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
      void (async () => {
        const pending = await AsyncStorage.getItem(PENDING_STREAK_CELEBRATION_KEY).catch(() => null);
        const pendingCompletion = parsePendingCompletion(pending);
        await load({ force: Boolean(pending) });
        if (pending) {
          await AsyncStorage.removeItem(PENDING_STREAK_CELEBRATION_KEY).catch(() => undefined);
          if (pendingCompletion.planDayId) {
            setDays((value) => markPlanDayCompleted(value, pendingCompletion.planDayId));
            setJustCompletedPlanDayId(pendingCompletion.planDayId);
          }
          setStreakCelebrationNonce((value) => value + 1);
        }
      })();
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
    if (selected && !selected.completed) return selected;
    return days.find((day) => !day.completed) || days[0];
  }, [days, selectedTodayPlanDayId]);
  const onSwitchTodayWorkout = async (day: PlanDay) => {
    setSelectedTodayPlanDayId(day.planDayId);
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

  const onSelectPlan = (plan: UserPlanSummary) => {
    if (plan.isActive || switchingPlanId) {
      setPlansOpen(false);
      return;
    }
    Alert.alert(
      'Switch workout plan?',
      `Make "${plan.title || 'this plan'}" your active plan? Your current plan stays saved — you can switch back anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setSwitchingPlanId(plan.planId);
            try {
              await selectWorkoutPlan(plan.planId);
              await AsyncStorage.removeItem(`${TODAY_WORKOUT_KEY_PREFIX}${planId || title || 'default'}`).catch(() => undefined);
              setSelectedTodayPlanDayId('');
              setPlansOpen(false);
              await load({ force: true });
            } catch (e) {
              Alert.alert('Could not switch plan', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setSwitchingPlanId('');
            }
          },
        },
      ],
    );
  };

  const openWorkoutDetail = (day: PlanDay | null, mode: 'standard' | 'quick') => {
    if (!day) return;
    loadWorkoutDayCached(day.planDayId, mode).catch(() => undefined);
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
    navigation.navigate('WorkoutDetail', { planDayId: day.planDayId, title: day.focus, mode });
  };

  const openWorkoutSummary = async (day: PlanDay | null, mode: 'standard' | 'quick') => {
    if (!day || summaryOpening) return;
    setSummaryOpening(true);
    const initialDetail = await withTimeout(loadWorkoutDayCached(day.planDayId, mode), 4500);
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
        <View style={styles.days}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.dayCard}>
              <SkeletonBlock style={styles.dayBadge} />
              <View style={styles.dayInfo}>
                <SkeletonBlock style={styles.skeletonDayTitle} />
                <SkeletonBlock style={styles.skeletonMeta} />
              </View>
            </View>
          ))}
        </View>
      </ScreenContainer>
    );
  }

  const doneCount = days.filter((d) => d.completed).length;
  const todayCount = todayDay?.exercises?.length ?? 0;
  const planProgress = days.length ? doneCount / days.length : 0;
  const planProgressPct = Math.round(planProgress * 100);
  const currentStreak = progress?.currentStreak ?? 0;
  const trainerPhoto = resolveTrainerPhotoUrl(trainer?.trainerPhotoUrl);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
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
                    <Feather name="repeat" size={14} color={colors.white} />
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
                  title={todayDay?.completed ? 'Review today workout' : "Today's Workout"}
                  icon="activity"
                  variant="inverted"
                  onPress={() => openWorkoutSummary(todayDay, 'standard')}
                />
                <PrimaryButton
                  title="Short on time workout"
                  icon="clock"
                  variant="heroSecondary"
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
                    <Text style={styles.aiRefreshKicker}>2-week AI update</Text>
                    <Text style={styles.aiRefreshTitle}>{aiPlanRefresh.trainerName || 'Ava'} can build your next plan</Text>
                    <Text style={styles.aiRefreshText}>
                      Complete a guided check-in so your next workout block reflects what you did, skipped, and need changed.
                    </Text>
                  </View>
                </View>
                <View style={styles.aiRefreshMetaRow}>
                  <Badge label={`${aiPlanRefresh.planAgeDays}d old`} tone="accent" icon="calendar" />
                </View>
                <PrimaryButton
                  title="Answer and rebuild plan"
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
                  <Text style={styles.trainerName} numberOfLines={1}>{trainer.name || 'FormBae Trainer'}</Text>
                  <Text style={styles.trainerDescription} numberOfLines={2}>
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
                  <Text style={styles.trainerDescription} numberOfLines={2}>
                    Open coach details to see assignment status and available options.
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            )}

            <Card variant="flat" style={styles.weekProgress}>
              <View style={styles.weekProgressTop}>
                <Text style={styles.weekProgressTitle}>Full plan progress</Text>
                <View style={styles.weekProgressMetaGroup}>
                  <Text style={styles.weekProgressPercent}>{planProgressPct}%</Text>
                  <Text style={styles.weekProgressMeta}>
                    {doneCount}/{days.length} days
                  </Text>
                </View>
              </View>
              <ProgressBar value={planProgress} />
            </Card>

            <SectionTitle>Full workout plan</SectionTitle>
            <View style={styles.days}>
              {days.map((day) => {
                const count = day.exercises?.length ?? 0;
                const isToday = day.planDayId === todayDay?.planDayId;
                return (
                  <Card
                    key={day.planDayId}
                    onPress={() => openWorkoutDetail(day, 'standard')}
                    style={StyleSheet.flatten([
                      styles.dayCard,
                      isToday && !day.completed && styles.todayPlanCard,
                      day.completed && styles.dayCardDone,
                    ])}
                  >
                    {day.completed ? <CompletionGlow radius={22} animated={day.planDayId === justCompletedPlanDayId} /> : null}
                    <View style={[styles.dayBadge, isToday && !day.completed && styles.dayBadgeToday, day.completed && styles.dayBadgeDone]}>
                      {day.completed ? <Feather name="check" size={18} color={colors.white} /> : <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{day.dayNumber}</Text>}
                    </View>
                    <View style={styles.dayInfo}>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayTitle} numberOfLines={1}>
                          {day.focus || 'Workout'}
                        </Text>
                        {isToday && !day.completed ? <Badge label="Today" tone="greenSolid" /> : null}
                      </View>
                      <Text style={styles.meta}>
                        {count} exercise{count === 1 ? '' : 's'} · Day {day.dayNumber}
                      </Text>
                    </View>
                    {day.completed ? (
                      <Badge label="Done" tone="goldSolid" icon="check" style={styles.doneBadge} />
                    ) : (
                      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
                    )}
                  </Card>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openPlanSwitcher}
              style={styles.switchPlanButton}
              accessibilityRole="button"
              accessibilityLabel="Switch to another workout plan"
            >
              <View style={styles.switchPlanIcon}>
                <Feather name="layers" size={18} color={colors.white} />
              </View>
              <View style={styles.switchPlanText}>
                <Text style={styles.switchPlanTitle}>Switch workout plan</Text>
                <Text style={styles.switchPlanMeta}>Browse every plan made for you</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.onAccentMuted} />
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
          <LoadingState message="Preparing workout..." />
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
                    <Text style={styles.switchRowTitle} numberOfLines={1}>{day.focus || 'Workout'}</Text>
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
                      <Text style={styles.planRowTitle} numberOfLines={1}>{plan.title || 'Workout plan'}</Text>
                      {meta ? <Text style={styles.planRowMeta} numberOfLines={1}>{meta}</Text> : null}
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
  scroll: { paddingBottom: 110 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  headerText: { flex: 1 },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  summary: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.xs },
  streakBadge: {
    width: 86,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: 'hidden',
  },
  streakBadgeBurning: {
    borderColor: GOLD,
  },
  streakGlow: {
    position: 'absolute',
    width: 78,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: GOLD,
  },
  streakIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakGoldIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakValue: {
    minWidth: 34,
    textAlign: 'left',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    color: colors.ink,
  },
  streakValueBurning: { color: GOLD_DARK },
  todayHero: { backgroundColor: colors.accent, borderColor: colors.accentDark, overflow: 'hidden', padding: spacing.lg },
  todayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todayDay: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '700' },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  switchText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  todayTitle: { ...typography.title, color: colors.white, marginTop: spacing.lg },
  todayMeta: { ...typography.body, color: colors.onAccentMuted, marginTop: 4 },
  heroActions: { gap: spacing.sm, marginTop: spacing.lg },
  aiRefreshCard: { marginTop: spacing.md },
  aiRefreshHead: { flexDirection: 'row', gap: spacing.md },
  aiRefreshIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
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
  weekProgress: { marginTop: spacing.md },
  weekProgressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekProgressTitle: { ...typography.bodyBold, color: colors.ink },
  weekProgressMetaGroup: { alignItems: 'flex-end' },
  weekProgressPercent: { ...typography.subtitle, color: colors.ink, lineHeight: 22 },
  weekProgressMeta: { ...typography.caption, color: colors.inkMuted },
  days: { gap: spacing.sm },
  switchPlanButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accent,
    padding: spacing.md,
    ...shadows.sm,
  },
  switchPlanIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchPlanText: { flex: 1 },
  switchPlanTitle: { ...typography.bodyBold, color: colors.white },
  switchPlanMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: 2 },
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
  planRowBadgeActive: { backgroundColor: colors.accent },
  planRowText: { flex: 1, minWidth: 0 },
  planRowTitle: { ...typography.bodyBold, color: colors.ink },
  planRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  planActivePill: {
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  planActivePillText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  todayPlanCard: { borderColor: 'rgba(34,197,94,0.45)', borderWidth: 1.5, backgroundColor: '#f2fcf6' },
  dayCardDone: { borderColor: 'rgba(245,179,1,0.6)', borderWidth: 1.5, backgroundColor: '#fffdf7' },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeToday: { backgroundColor: GREEN, borderWidth: 1.5, borderColor: '#16a34a' },
  dayBadgeDone: { backgroundColor: colors.accent, borderWidth: 1.5, borderColor: GOLD },
  doneBadge: { alignSelf: 'center' },
  dayNum: { ...typography.subtitle, color: colors.accentDark, fontWeight: '800' },
  dayNumToday: { color: colors.white },
  dayInfo: { flex: 1 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayTitle: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  meta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  skeletonTitle: { width: '62%', height: 30, marginBottom: spacing.sm },
  skeletonSummary: { width: '74%', height: 14, marginBottom: spacing.md },
  skeletonHero: { height: 238, borderRadius: radius.xl, marginBottom: spacing.md },
  skeletonDayTitle: { width: '72%', height: 16 },
  skeletonMeta: { width: '48%', height: 12, marginTop: spacing.sm },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  switchSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  switchDayBadgeSelected: { backgroundColor: colors.accent },
  switchDayText: { ...typography.bodyBold, color: colors.accentDark },
  switchRowText: { flex: 1 },
  switchRowTitle: { ...typography.bodyBold, color: colors.ink },
  switchRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
