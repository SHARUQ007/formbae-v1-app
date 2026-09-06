import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Easing, Image, Modal, ScrollView, Text, StyleSheet, RefreshControl, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState, LoadingState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { MotionAnimation } from '../../components/MotionAnimation';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import {
  loadProfileSettingsCached,
  loadWorkoutDayCached,
  loadWorkoutPlanCached,
  peekProfileSettingsCached,
  peekWorkoutDayCached,
  peekWorkoutPlanCached,
} from '../../services/preloadService';
import { fetchUserPlans, PENDING_AI_PLAN_BUILD_KEY, selectWorkoutPlan } from '../../services/workoutService';
import { hasSeenReadyPlan, markReadyPlanSeen } from '../../services/planRevealService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import type { AiPlanRefresh, PlanDay, ProgressSummary, TrainerInfo, UserPlanSummary } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { appTabBarStyle, hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { deriveCurrentWeekStreak, deriveWorkoutMuscles, resolveBodyGender } from '../../utils/weeklyMuscles';
import { getCoachArtworkSource } from '../../utils/coachArtwork';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

const TODAY_WORKOUT_KEY_PREFIX = 'formbae_today_workout:';
const LAST_SEEN_STREAK_KEY = 'formbae_last_seen_workout_streak';
const PENDING_STREAK_CELEBRATION_KEY = 'formbae_pending_workout_streak_celebration';
const COACH_DISCOVERY_ART = require('../../assets/editorial/coach-discovery.jpg');

function keepHeadingEndingTogether(value: string) {
  const words = value.trim().split(/\s+/);
  if (words.length < 2) return value.trim();
  const ending = words.slice(-2).join(' ');
  if (ending.length > 18) return value.trim();
  return `${words.slice(0, -2).join(' ')}${words.length > 2 ? ' ' : ''}${ending.replace(' ', '\u00a0')}`;
}

function premiumHeading(value: string) {
  return String(value || '')
    .replace(/\s*[+&]\s*/g, ' and ')
    .replace(/[·•|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function planHeadingParts(value: string) {
  const cleaned = premiumHeading(value);
  const phaseMatch = cleaned.match(/\s+(Foundation|Phase\s+\d+)$/i);
  if (!phaseMatch) return { title: cleaned, phase: '' };
  return {
    title: cleaned.slice(0, phaseMatch.index).trim(),
    phase: phaseMatch[1],
  };
}
const PENDING_PLAN_BUILD_MAX_AGE_MS = 10 * 60 * 1000;
const GOLD = '#f5b301';
const FLAME_CORE = '#ffe08a';
const STREAK_EMBERS = [
  { left: 9, delay: 0, size: 4, drift: -6 },
  { left: 15, delay: 0.12, size: 3, drift: 5 },
  { left: 12, delay: 0.2, size: 3.5, drift: -2 },
  { left: 18, delay: 0.28, size: 3, drift: 7 },
];

export function resolvePlanBuildPresentation({
  due,
  buildStatus,
  hasPendingBuild,
  buildId,
  dismissedBuildId,
}: {
  due?: boolean;
  buildStatus?: NonNullable<AiPlanRefresh['build']>['status'];
  hasPendingBuild: boolean;
  buildId: string;
  dismissedBuildId: string | null;
}) {
  const building = buildStatus === 'building' || buildStatus === 'requested' || hasPendingBuild;
  return {
    building,
    takeoverVisible: building && dismissedBuildId !== buildId,
    checkInPromptVisible: Boolean(due) && !building,
  };
}

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

function CoachingFeature({ onPress }: { onPress: () => void }) {
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.2;
  const expandedHero = viewportWidth < 380;

  return (
    <View style={styles.coachingFeatureSection}>
      <View style={[styles.coachingFeatureHeader, largeText && styles.coachingFeatureHeaderLargeText]}>
        <View style={styles.coachingFeatureHeaderCopy}>
          <Text style={styles.coachingFeatureTitle} accessibilityRole="header">Coaching</Text>
          <Text style={styles.coachingFeatureSubtitle}>Guidance that fits how you train</Text>
        </View>
        <TouchableOpacity
          onPress={onPress}
          style={styles.coachingFeatureSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all coaches"
        >
          <Text style={styles.coachingFeatureSeeAllText}>See all</Text>
          <Feather name="chevron-right" size={17} color={colors.ink} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[
          styles.coachingFeatureHero,
          expandedHero && styles.coachingFeatureHeroExpanded,
          largeText && styles.coachingFeatureHeroLargeText,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Explore coaching options"
        accessibilityHint="Opens coach selection"
      >
        {largeText ? (
          <>
            <View style={styles.coachingFeatureImageStage}>
              <Image source={COACH_DISCOVERY_ART} style={styles.coachingFeatureImageFlow} resizeMode="cover" accessible={false} />
            </View>
            <View style={styles.coachingFeatureCopyFlow}>
              <Text style={styles.coachingFeatureKicker}>Meet your match</Text>
              <Text style={styles.coachingFeatureHeroTitle}>Train with the right support</Text>
              <View style={styles.coachingFeatureAction}>
                <Text style={styles.coachingFeatureActionText}>Explore coaches</Text>
                <Feather name="arrow-right" size={16} color={colors.onPrimary} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Image source={COACH_DISCOVERY_ART} style={styles.coachingFeatureImage} resizeMode="cover" accessible={false} />
            <View style={[styles.coachingFeatureShade, expandedHero && styles.coachingFeatureShadeExpanded]} />
            <View style={[styles.coachingFeatureCopy, expandedHero && styles.coachingFeatureCopyExpanded]}>
              <Text style={styles.coachingFeatureKicker}>Meet your match</Text>
              <Text style={styles.coachingFeatureHeroTitle}>Train with the right support</Text>
              <View style={styles.coachingFeatureAction}>
                <Text style={styles.coachingFeatureActionText}>Explore coaches</Text>
                <Feather name="arrow-right" size={16} color={colors.onPrimary} />
              </View>
            </View>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
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

function WorkoutDashboardScreen({ navigation, route }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { width: viewportWidth } = useWindowDimensions();
  const warmData = peekWorkoutPlanCached();
  const warmPlan = (warmData?.plan || warmData?.today?.plan) as { planId?: string; days?: PlanDay[]; title?: string } | undefined;
  const warmDays = warmPlan?.days || [];
  const initialWarmDay = warmDays.find((day) => !day.completed) || warmDays[0];
  const warmSettings = peekProfileSettingsCached();
  const [days, setDays] = useState<PlanDay[]>(warmDays);
  const [title, setTitle] = useState(warmPlan?.title || 'My workout plan');
  const [planId, setPlanId] = useState(warmPlan?.planId || warmData?.today?.plan?.planId || '');
  const [selectedTodayPlanDayId, setSelectedTodayPlanDayId] = useState('');
  const [focusedPlanDayId, setFocusedPlanDayId] = useState(initialWarmDay?.planDayId || '');
  const [planDaySelectionTouched, setPlanDaySelectionTouched] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [trainerPhotoFailed, setTrainerPhotoFailed] = useState(false);
  const [progress, setProgress] = useState<ProgressSummary | null>(warmData?.today?.progress || null);
  const [trainer, setTrainer] = useState<TrainerInfo | null>(warmData?.today?.assignedTrainer || null);
  const [aiPlanRefresh, setAiPlanRefresh] = useState<AiPlanRefresh | null>(warmData?.aiPlanRefresh || null);
  const [loading, setLoading] = useState(!warmData);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryOpening, setSummaryOpening] = useState(false);
  const [streakCelebrationNonce, setStreakCelebrationNonce] = useState(0);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plans, setPlans] = useState<UserPlanSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [switchingPlanId, setSwitchingPlanId] = useState('');
  const [readyPlanAcknowledged, setReadyPlanAcknowledged] = useState<boolean | null>(null);
  const [pendingPlanBuild, setPendingPlanBuild] = useState<{ planId: string; trainerName: string; requestedAt: number } | null>(
    route.params?.pendingPlanBuild || null,
  );
  const [dismissedPlanBuildId, setDismissedPlanBuildId] = useState<string | null>(null);
  const [planBuildSyncedAt, setPlanBuildSyncedAt] = useState<number | null>(null);
  const [bodyGender, setBodyGender] = useState<ReturnType<typeof resolveBodyGender>>(
    resolveBodyGender(warmSettings?.profile?.gender),
  );

  useEffect(() => {
    const incomingBuild = route.params?.pendingPlanBuild;
    if (!incomingBuild) return;
    setPendingPlanBuild(incomingBuild);
    setDismissedPlanBuildId(null);
  }, [route.params?.pendingPlanBuild]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    setError(null);
    try {
      // Pending session writes are safe to sync in the background. Waiting for
      // them here made opening the tab depend on connection quality.
      flushWorkoutQueue().catch(() => undefined);
      const [data, settings, pendingBuildRaw] = await Promise.all([
        loadWorkoutPlanCached({ force: options?.force }),
        loadProfileSettingsCached({ force: options?.force }).catch(() => null),
        AsyncStorage.getItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => null),
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
      setTrainerPhotoFailed(false);
      setAiPlanRefresh(data.aiPlanRefresh || null);
      const buildStatus = data.aiPlanRefresh?.build?.status;
      if (buildStatus === 'building' || buildStatus === 'requested') {
        setPlanBuildSyncedAt(Date.now());
      }
      let localPendingBuild: { planId: string; trainerName: string; requestedAt: number } | null = null;
      if (pendingBuildRaw && !['completed', 'failed'].includes(buildStatus || '')) {
        try {
          const parsed = JSON.parse(pendingBuildRaw) as { planId?: string; trainerName?: string; requestedAt?: number };
          const requestedAt = Number(parsed.requestedAt || 0);
          if (parsed.planId === loadedPlanId && requestedAt > 0 && Date.now() - requestedAt <= PENDING_PLAN_BUILD_MAX_AGE_MS) {
            localPendingBuild = { planId: parsed.planId, trainerName: parsed.trainerName || 'Ava', requestedAt };
          } else {
            await AsyncStorage.removeItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => undefined);
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => undefined);
        }
      } else if (pendingBuildRaw && ['completed', 'failed'].includes(buildStatus || '')) {
        await AsyncStorage.removeItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => undefined);
      }
      setPendingPlanBuild(localPendingBuild);
      if (buildStatus === 'completed' || buildStatus === 'failed') {
        setDismissedPlanBuildId(null);
        navigation.setParams({ pendingPlanBuild: undefined });
      }
      const readyPlanId = data.aiPlanRefresh?.build?.newPlanId || '';
      setReadyPlanAcknowledged(await hasSeenReadyPlan(readyPlanId));
      setBodyGender(resolveBodyGender(settings?.profile?.gender));
      if (warmDay?.planDayId) {
        loadWorkoutDayCached(warmDay.planDayId, 'standard').catch(() => undefined);
        loadWorkoutDayCached(warmDay.planDayId, 'quick').catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  const planBuildStatus = aiPlanRefresh?.build?.status;
  const builtPlanId = aiPlanRefresh?.build?.newPlanId || '';
  const planBuildId = aiPlanRefresh?.build?.planId || pendingPlanBuild?.planId || planId;
  const planBuildPresentation = resolvePlanBuildPresentation({
    due: aiPlanRefresh?.due,
    buildStatus: planBuildStatus,
    hasPendingBuild: Boolean(pendingPlanBuild),
    buildId: planBuildId,
    dismissedBuildId: dismissedPlanBuildId,
  });
  const planBuilding = planBuildPresentation.building;
  const planBuildTakeoverVisible = planBuildPresentation.takeoverVisible;
  const backendBuildStartedAt = Date.parse(aiPlanRefresh?.build?.requestedAt || '');
  const planBuildStartedAt = Number.isFinite(backendBuildStartedAt) ? backendBuildStartedAt : pendingPlanBuild?.requestedAt;
  const planReadyToReveal = planBuildStatus === 'completed'
    && Boolean(builtPlanId)
    && builtPlanId === planId
    && !aiPlanRefresh?.due
    && readyPlanAcknowledged === false;

  useEffect(() => {
    if (!planReadyToReveal) return;
    // Persist on presentation, not only on button press, so a reload or app
    // interruption cannot make the same completed-plan reveal appear again.
    markReadyPlanSeen(builtPlanId).catch(() => undefined);
  }, [builtPlanId, planReadyToReveal]);

  useEffect(() => {
    navigation.getParent()?.setOptions({
      tabBarStyle: planBuildTakeoverVisible || planReadyToReveal ? hiddenTabBarStyle : appTabBarStyle,
    });
  }, [navigation, planBuildTakeoverVisible, planReadyToReveal]);

  useEffect(() => {
    if (!planBuilding) return undefined;
    const interval = setInterval(() => load({ force: true }).catch(() => undefined), 5000);
    return () => clearInterval(interval);
  }, [load, planBuilding]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      navigation.getParent()?.setOptions({
        tabBarStyle: planBuildTakeoverVisible || planReadyToReveal ? hiddenTabBarStyle : appTabBarStyle,
      });
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
  }, [navigation, load, planBuildTakeoverVisible, planReadyToReveal]);

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

  const loadAvailablePlans = async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const data = await fetchUserPlans();
      setPlans(data.plans || []);
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : 'Please check your connection and try again.');
    } finally {
      setPlansLoading(false);
    }
  };

  const openPlanSwitcher = () => {
    setPlansOpen(true);
    loadAvailablePlans().catch(() => undefined);
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
    const initialDetail = peekWorkoutDayCached(day.planDayId, mode);
    // The summary screen can render its own skeleton when this detail was not
    // preloaded. Navigation itself should never wait for the network.
    loadWorkoutDayCached(day.planDayId, mode, { force: Boolean(day.completed) }).catch(() => undefined);
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

  if (planBuildTakeoverVisible) {
    return (
      <AvaPlanTakeover
        mode="building"
        trainerName={aiPlanRefresh?.trainerName || pendingPlanBuild?.trainerName || 'Ava'}
        requestedAt={planBuildStartedAt}
        lastSyncedAt={planBuildSyncedAt || undefined}
        onExit={() => setDismissedPlanBuildId(planBuildId)}
      />
    );
  }

  if (planReadyToReveal) {
    return (
      <AvaPlanTakeover
        mode="ready"
        trainerName={aiPlanRefresh?.trainerName || 'Ava'}
        onContinue={() => {
          setReadyPlanAcknowledged(true);
          markReadyPlanSeen(builtPlanId).catch(() => undefined);
          navigation.getParent()?.setOptions({ tabBarStyle: appTabBarStyle });
        }}
      />
    );
  }

  const doneCount = days.filter((d) => d.completed).length;
  const todayCount = todayDay?.exercises?.length ?? 0;
  const planProgress = days.length ? doneCount / days.length : 0;
  const currentStreak = progress?.completionHistory
    ? deriveCurrentWeekStreak(progress.completionHistory)
    : Math.min(7, progress?.currentStreak ?? 0);
  const trainerPhoto = getCoachArtworkSource({
    name: trainer?.name,
    photoUrl: trainer?.trainerPhotoUrl,
  });
  const planHeading = planHeadingParts(title);
  const planTitleFontSize = viewportWidth < 380 || planHeading.title.length > 34
    ? 27
    : planHeading.title.length > 22
      ? 29
      : 32;
  const alignRefreshContentToCopy = viewportWidth >= 600;
  const refreshBuildFailed = aiPlanRefresh?.build?.status === 'failed';
  const refreshTrainerName = aiPlanRefresh?.trainerName || pendingPlanBuild?.trainerName || 'Ava';

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
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
                <Text style={styles.eyebrow}>{planHeading.phase ? `Workout ${planHeading.phase}` : 'Workout'}</Text>
                <Text
                  style={[styles.planTitle, { fontSize: planTitleFontSize, lineHeight: planTitleFontSize + 6 }]}
                  accessibilityRole="header"
                >
                  {keepHeadingEndingTogether(planHeading.title)}
                </Text>
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
              <Text style={styles.todayTitle}>{premiumHeading(todayDay?.focus || 'Workout')}</Text>
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

            {planBuildPresentation.checkInPromptVisible || planBuilding ? (
              <View style={[styles.aiRefreshCard, refreshBuildFailed && styles.aiRefreshCardFailed]}>
                <View style={styles.aiRefreshHead}>
                  <View style={styles.aiRefreshIcon}>
                    {planBuilding ? (
                      <ActivityIndicator size="small" color={colors.gold} />
                    ) : (
                      <Feather name={refreshBuildFailed ? 'refresh-cw' : 'sliders'} size={19} color={colors.gold} />
                    )}
                  </View>
                  <View style={styles.aiRefreshCopy}>
                    <Text style={styles.aiRefreshKicker}>{planBuilding ? 'CHECK-IN SAVED' : refreshBuildFailed ? 'CHECK-IN NEEDS ATTENTION' : 'NEXT TRAINING BLOCK'}</Text>
                    <Text style={styles.aiRefreshTitle}>{planBuilding ? `${refreshTrainerName} is building your plan` : refreshBuildFailed ? 'Finish your next plan' : 'Shape what comes next'}</Text>
                    <Text style={styles.aiRefreshText}>
                      {planBuilding
                        ? 'You can keep training while your next block takes shape.'
                        : refreshBuildFailed
                        ? 'The previous build paused. Reopen your check-in to review and try again.'
                        : `Tell ${refreshTrainerName} what worked, what changed and what should feel different.`}
                    </Text>
                  </View>
                </View>
                <View style={[styles.aiRefreshMetaRow, alignRefreshContentToCopy && styles.aiRefreshContentAligned]}>
                  <View style={styles.aiRefreshMetaItem}><Feather name="clock" size={14} color={colors.inkSubtle} /><Text style={styles.aiRefreshMetaText}>{planBuilding ? 'Usually about 2 min' : 'About 2 min'}</Text></View>
                  <View style={styles.aiRefreshMetaDot} />
                  <View style={styles.aiRefreshMetaItem}>
                    <Feather name={planBuilding ? 'check-circle' : 'calendar'} size={14} color={colors.inkSubtle} />
                    <Text style={styles.aiRefreshMetaText}>
                      {planBuilding
                        ? 'Runs in the background'
                        : `${aiPlanRefresh?.planAgeDays || 0} day${aiPlanRefresh?.planAgeDays === 1 ? '' : 's'} on this plan`}
                    </Text>
                  </View>
                </View>
                {!planBuilding && aiPlanRefresh?.allowance?.allowed === false ? (
                  <View style={[styles.aiRefreshUnavailable, alignRefreshContentToCopy && styles.aiRefreshContentAligned]}>
                    <Feather name="lock" size={15} color={colors.inkMuted} />
                    <Text style={styles.aiRefreshUnavailableText}>Check-in is unavailable right now. Your current plan stays active.</Text>
                  </View>
                ) : (
                  <PrimaryButton
                    title={planBuilding ? 'View build progress' : refreshBuildFailed ? 'Try building again' : 'Start check-in'}
                    icon={planBuilding ? 'activity' : refreshBuildFailed ? 'refresh-cw' : 'arrow-right'}
                    onPress={() => {
                      if (planBuilding) {
                        setDismissedPlanBuildId(null);
                        return;
                      }
                      navigation.navigate('PlanRefresh', refreshBuildFailed ? { retryFailedBuild: true } : undefined);
                    }}
                    style={alignRefreshContentToCopy
                      ? { ...styles.aiRefreshButton, ...styles.aiRefreshContentAligned }
                      : styles.aiRefreshButton}
                  />
                )}
              </View>
            ) : null}

            <SectionTitle>Your coach</SectionTitle>
            {trainer ? (
              <Card
                variant="outline"
                style={styles.trainerCard}
                onPress={() => navigation.navigate('Coach', { initialView: 'about' })}
              >
                <View style={styles.trainerPhotoWrap}>
                  {trainerPhoto && !trainerPhotoFailed ? (
                    <Image
                      source={trainerPhoto}
                      style={styles.trainerPhoto}
                      resizeMode="cover"
                      onError={() => setTrainerPhotoFailed(true)}
                      accessible={false}
                    />
                  ) : (
                    <View style={styles.trainerFallback}>
                      <Text style={styles.trainerInitial}>{(trainer.name || 'T').slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName}>{trainer.name || 'FormBae Trainer'}</Text>
                  <Text style={styles.trainerDescription} numberOfLines={2}>
                    {trainer.trainerDescription || 'Guiding your workout plan, check-ins and weekly progress.'}
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            ) : (
              <Card
                variant="outline"
                style={styles.trainerCard}
                onPress={() => navigation.navigate('Coach', { initialView: 'browse' })}
              >
                <View style={styles.trainerPhotoWrap}>
                  <View style={styles.trainerFallback}>
                    <Feather name="user-plus" size={22} color={colors.accentDark} />
                  </View>
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName}>Coach not assigned yet</Text>
                  <Text style={styles.trainerDescription} numberOfLines={2}>Choose a coach to guide your workouts and progress.</Text>
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
              </View>
              <ProgressBar value={planProgress} height={4} trackColor={colors.panelRaised} fillColor={colors.gold} />

              <View style={styles.weekPicker} accessibilityRole="radiogroup">
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
                          selected && day.completed && styles.weekDayNodeSelectedDone,
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
                      <Text
                        style={styles.focusedWorkoutTitle}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        ellipsizeMode="tail"
                      >
                        {focusedDay.focus || 'Workout'}
                      </Text>
                      <Text style={styles.focusedWorkoutMeta}>
                        {focusedDay.exercises?.length ?? 0} exercise{(focusedDay.exercises?.length ?? 0) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View style={styles.focusedWorkoutOpen}>
                      <Feather name="arrow-right" size={20} color={colors.ink} />
                    </View>
                  </View>

                  <View style={styles.workoutOverviewDivider} />

                  <View style={styles.targetMusclesSection}>
                    <View style={styles.targetMapHeader}>
                      <Text style={styles.targetMapEyebrow}>Targeted muscles</Text>
                      {focusedMuscles.length ? (
                        <Text style={styles.targetMapCount}>{focusedMuscles.length} area{focusedMuscles.length === 1 ? '' : 's'}</Text>
                      ) : null}
                    </View>

                    {focusedMuscles.length ? (
                      <View style={styles.targetMuscleLegend}>
                        {focusedMuscles.slice(0, 3).map((muscle) => (
                          <View key={muscle} style={styles.targetMuscleChip}>
                            <View style={styles.targetMuscleDot} />
                            <Text style={styles.targetMuscleText} numberOfLines={1}>{muscle}</Text>
                          </View>
                        ))}
                        {focusedMuscles.length > 3 ? (
                          <Text style={styles.targetMuscleOverflow}>+{focusedMuscles.length - 3}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.targetAnalysisEmpty}>
                        <Text style={styles.targetAnalysisEmptyTitle}>Target areas unavailable</Text>
                      </View>
                    )}

                    <WeeklyBodyMap gender={bodyGender} muscles={focusedMuscles} compact showLabels={false} />
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>

            <CoachingFeature onPress={() => navigation.navigate('Coach', { initialView: 'browse' })} />

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
        error={plansError}
        switchingPlanId={switchingPlanId}
        onSelect={onSelectPlan}
        onRetry={() => loadAvailablePlans()}
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

const AVA_PLAN_ESTIMATE_MS = 105_000;
const AVA_BUILD_EVENTS = [
  { at: 6, icon: 'edit-3', text: 'Studying your latest check-in' },
  { at: 10, icon: 'bar-chart-2', text: 'Reviewing your recent workout history' },
  { at: 14, icon: 'check-circle', text: 'Day 1 shaped · meeting you where you are', day: 1 },
  { at: 18, icon: 'activity', text: 'Choosing a warm-up for your body' },
  { at: 23, icon: 'check-circle', text: 'Day 2 shaped · building strength steadily', day: 2 },
  { at: 28, icon: 'repeat', text: 'Matching exercises to your preferences' },
  { at: 34, icon: 'check-circle', text: 'Day 3 shaped · recovery where you need it', day: 3 },
  { at: 39, icon: 'clock', text: 'Personalizing your sets, reps and rest' },
  { at: 45, icon: 'check-circle', text: 'Day 4 shaped · balancing your training load', day: 4 },
  { at: 51, icon: 'target', text: 'Choosing movements for your goals' },
  { at: 57, icon: 'check-circle', text: 'Day 5 shaped · progress without overload', day: 5 },
  { at: 63, icon: 'shield', text: 'Spacing sessions around your recovery' },
  { at: 70, icon: 'check-circle', text: 'Day 6 shaped · intensity matched to you', day: 6 },
  { at: 76, icon: 'zap', text: 'Creating shorter options for busy days' },
  { at: 83, icon: 'check-circle', text: 'Day 7 shaped · your week fits together', day: 7 },
  { at: 88, icon: 'sliders', text: 'Adding coaching cues and exercise swaps' },
  { at: 92, icon: 'search', text: 'Reviewing every detail like your coach' },
] as const;

function AvaPlanTakeover({
  mode,
  trainerName,
  requestedAt,
  lastSyncedAt,
  onContinue,
  onExit,
}: {
  mode: 'building' | 'ready';
  trainerName: string;
  requestedAt?: number;
  lastSyncedAt?: number;
  onContinue?: () => void;
  onExit?: () => void;
}) {
  const fallbackStartedAt = useRef(Date.now());
  const [buildProgress, setBuildProgress] = useState(6);
  const [estimatedSecondsLeft, setEstimatedSecondsLeft] = useState(Math.ceil(AVA_PLAN_ESTIMATE_MS / 1000));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== 'building') return undefined;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    const startedAt = requestedAt && Number.isFinite(requestedAt) ? requestedAt : fallbackStartedAt.current;
    const updateProgress = () => {
      const elapsed = Math.max(0, Date.now() - startedAt);
      const progress = Math.min(94, Math.floor(6 + (elapsed / AVA_PLAN_ESTIMATE_MS) * 88));
      setBuildProgress(progress);
      setEstimatedSecondsLeft(Math.max(0, Math.ceil((AVA_PLAN_ESTIMATE_MS - elapsed) / 1000)));
      setElapsedSeconds(Math.floor(elapsed / 1000));
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => {
      pulseLoop.stop();
      clearInterval(interval);
    };
  }, [mode, pulse, requestedAt]);

  useEffect(() => {
    if (mode !== 'building' || !onExit) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => subscription.remove();
  }, [mode, onExit]);

  if (mode === 'ready') {
    return (
      <ScreenContainer withBottomInset style={styles.avaTakeover}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.avaReadyBody}>
          <MotionAnimation kind="success" size={116} />
          <Text style={styles.avaKicker}>Designed around you</Text>
          <Text style={styles.avaTitle}>{trainerName} finished your new plan</Text>
          <Text style={styles.avaDetail}>{trainerName} studied your training history, your latest check-in and what feels best for your body to shape a week that fits you.</Text>
          <View style={styles.avaReadyCard}>
            <View style={styles.avaReadyRow}><Feather name="calendar" size={20} color={colors.accent} /><Text style={styles.avaReadyText}>Seven days shaped around your routine</Text></View>
            <View style={styles.avaReadyRow}><Feather name="sliders" size={20} color={colors.accent} /><Text style={styles.avaReadyText}>Intensity and recovery chosen for your body</Text></View>
            <View style={styles.avaReadyRow}><Feather name="refresh-cw" size={20} color={colors.accent} /><Text style={styles.avaReadyText}>Your preferences built into every session</Text></View>
          </View>
        </ScrollView>
        <PrimaryButton title="Start my new plan" icon="arrow-right" size="lg" onPress={() => onContinue?.()} style={styles.avaReadyButton} />
      </ScreenContainer>
    );
  }

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const activityOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });
  const visibleEvents = AVA_BUILD_EVENTS.filter((event) => event.at <= buildProgress).slice(-5).reverse();
  const daysBuilt = AVA_BUILD_EVENTS.filter((event) => 'day' in event && event.at <= buildProgress).length;
  const estimateLabel = estimatedSecondsLeft > 60
    ? `About ${Math.ceil(estimatedSecondsLeft / 60)} min left`
    : estimatedSecondsLeft > 0
      ? 'About 1 min left'
      : 'Finishing touches';
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const syncAgeSeconds = lastSyncedAt ? Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000)) : null;
  const backendActive = syncAgeSeconds !== null && syncAgeSeconds < 15;
  const connectionLabel = backendActive ? `${trainerName} is working` : syncAgeSeconds === null ? `${trainerName} is getting started…` : `${trainerName} is shaping your plan`;
  const updateLabel = syncAgeSeconds === null ? 'Reviewing your notes' : syncAgeSeconds < 5 ? 'Coach notes updated' : 'Thoughtfully taking shape';
  return (
    <ScreenContainer withBottomInset style={styles.avaTakeover}>
      <View style={styles.avaBuildHeader}>
        <TouchableOpacity
          style={styles.avaBuildBackButton}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Back to workouts"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.avaBuildHeaderTitle}>Building your plan</Text>
        <View style={styles.avaBuildHeaderSpacer} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.avaBuildBody}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: buildProgress, text: `${buildProgress}% complete, ${estimateLabel}` }}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.avaStatusHero}>
          <View style={styles.avaCompactOrbWrap}>
            <Animated.View style={[styles.avaCompactPulse, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
            <View style={styles.avaCompactOrb}><Text style={styles.avaCompactInitial}>{trainerName.slice(0, 1).toUpperCase()}</Text></View>
            <Animated.View style={[styles.avaOnlineDot, { opacity: activityOpacity, transform: [{ scale: pulseScale }] }]} />
          </View>
          <View style={styles.avaStatusCopy}>
            <Text style={styles.avaStatusKicker}>Your coach is building your plan</Text>
            <Text style={styles.avaStatusTitle}>{trainerName} is designing your week</Text>
            <Text style={styles.avaStatusDetail}>{trainerName} is studying how you’ve trained, what your body responds to and how you want to feel—then shaping every session around you.</Text>
          </View>
        </View>

        <View style={styles.avaHeartbeatBar}>
          <View style={styles.avaHeartbeatStatus}>
            <Animated.View style={[styles.avaHeartbeatDot, !backendActive && styles.avaHeartbeatDotWaiting, { opacity: activityOpacity, transform: [{ scale: pulseScale }] }]} />
            <Text style={[styles.avaHeartbeatText, !backendActive && styles.avaHeartbeatTextWaiting]}>{connectionLabel}</Text>
          </View>
          <Text style={styles.avaElapsedText}>{elapsedLabel} elapsed</Text>
          <Text style={styles.avaUpdatedText}>{updateLabel}</Text>
        </View>

        <View style={styles.avaBuildCard}>
          <View style={styles.avaBuildTop}>
            <View>
              <Text style={styles.avaBuildLabel}>Curating your training week</Text>
              <Text style={styles.avaBuildEstimate}>{buildProgress >= 94 ? `${trainerName} is reviewing every detail` : estimateLabel}</Text>
            </View>
            <Text style={styles.avaBuildPercent}>{buildProgress}%</Text>
          </View>
          <View style={styles.avaProgressTrack}>
            <View style={[styles.avaProgressFill, { width: `${buildProgress}%` as `${number}%` }]} />
          </View>

          <View style={styles.avaDaysHeader}>
            <Text style={styles.avaDaysTitle}>Your tailored week</Text>
            <Text style={styles.avaDaysCount}>{daysBuilt} of 7 sessions shaped</Text>
          </View>
          <View style={styles.avaDaysGrid}>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const built = day <= daysBuilt;
              return (
                <View key={day} style={[styles.avaDayCell, built && styles.avaDayCellBuilt]}>
                  <Feather name={built ? 'check' : 'minus'} size={12} color={built ? colors.gold : colors.inkSubtle} />
                  <Text style={[styles.avaDayCellText, built && styles.avaDayCellTextBuilt]}>D{day}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.avaFeedHeader}>
            <Text style={styles.avaFeedLabel}>What {trainerName} is considering</Text>
            <View style={styles.avaLivePill}><View style={styles.avaLiveDot} /><Text style={styles.avaLiveText}>Live</Text></View>
          </View>
          <View style={styles.avaMessageFeed}>
            {visibleEvents.map((item, feedIndex) => {
              if (feedIndex === 0) {
                return (
                  <Animated.View key={`${item.at}-${item.text}`} style={[styles.avaFeedMessage, styles.avaFeedMessageActive, { opacity: activityOpacity }]}>
                    <ActivityIndicator size="small" color={colors.gold} />
                    <Text style={[styles.avaFeedMessageText, styles.avaFeedMessageTextActive]} numberOfLines={1}>{item.text}</Text>
                  </Animated.View>
                );
              }
              return (
                <View key={`${item.at}-${item.text}`} style={[styles.avaFeedMessage, { opacity: Math.max(0.46, 1 - feedIndex * 0.14) }]}>
                  <Feather name={item.icon} size={17} color={colors.inkSubtle} />
                  <Text style={styles.avaFeedMessageText} numberOfLines={1}>{item.text}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.avaBuildHintRow}><Feather name="check-circle" size={14} color={colors.gold} /><Text style={styles.avaBuildHint}>Your check-in is with {trainerName}. Your coach will keep shaping the plan even if you leave this tab.</Text></View>
        </View>
      </ScrollView>
      <View style={styles.avaSafeRow}><Feather name="shield" size={15} color={colors.inkSubtle} /><Text style={styles.avaSafeText}>You can step away—{trainerName} will keep designing your plan.</Text></View>
    </ScreenContainer>
  );
}

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
  error,
  switchingPlanId,
  onSelect,
  onRetry,
  onClose,
}: {
  visible: boolean;
  plans: UserPlanSummary[];
  loading: boolean;
  error: string | null;
  switchingPlanId: string;
  onSelect: (plan: UserPlanSummary) => void;
  onRetry: () => void;
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
            <View style={styles.planSheetLoading}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.planSkeletonRow}>
                  <SkeletonBlock style={styles.planSkeletonBadge} />
                  <View style={styles.planSkeletonText}>
                    <SkeletonBlock style={styles.planSkeletonTitle} />
                    <SkeletonBlock style={styles.planSkeletonMeta} />
                  </View>
                </View>
              ))}
            </View>
          ) : error ? (
            <View style={styles.planSheetError}>
              <View style={styles.planSheetErrorIcon}><Feather name="wifi-off" size={22} color={colors.error} /></View>
              <Text style={styles.planSheetErrorTitle}>Couldn’t load your plans</Text>
              <Text style={styles.planSheetErrorDetail}>{error}</Text>
              <PrimaryButton title="Try again" icon="refresh-cw" onPress={onRetry} variant="secondary" style={styles.planSheetRetry} />
            </View>
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
  avaTakeover: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  avaBuildHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avaBuildBackButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  avaBuildHeaderTitle: { ...typography.bodyBold, color: colors.ink },
  avaBuildHeaderSpacer: { width: 44, height: 44 },
  avaBuildBody: { flexGrow: 1, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  avaReadyBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xl },
  avaKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', textAlign: 'center', marginTop: spacing.lg },
  avaTitle: { ...typography.display, color: colors.ink, textAlign: 'center', marginTop: spacing.sm },
  avaDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24, textAlign: 'center', marginTop: spacing.sm, maxWidth: 430 },
  avaStatusHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  avaCompactOrbWrap: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  avaCompactPulse: { position: 'absolute', width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.borderStrong },
  avaCompactOrb: { width: 50, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.borderStrong },
  avaCompactInitial: { fontSize: 22, lineHeight: 27, fontWeight: '900', color: colors.ink },
  avaOnlineDot: { position: 'absolute', right: 3, bottom: 5, width: 13, height: 13, borderRadius: radius.pill, backgroundColor: colors.gold, borderWidth: 3, borderColor: colors.bg },
  avaStatusCopy: { flex: 1, minWidth: 0 },
  avaStatusKicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  avaStatusTitle: { ...typography.title, color: colors.ink, marginTop: 3 },
  avaStatusDetail: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  avaHeartbeatBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginTop: spacing.sm, paddingVertical: spacing.sm },
  avaHeartbeatStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avaHeartbeatDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.gold },
  avaHeartbeatDotWaiting: { backgroundColor: colors.inkSubtle },
  avaHeartbeatText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  avaHeartbeatTextWaiting: { color: colors.inkMuted },
  avaElapsedText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  avaUpdatedText: { ...typography.caption, color: colors.inkSubtle, marginLeft: 'auto' },
  avaBuildCard: { alignSelf: 'stretch', marginTop: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel, padding: spacing.lg },
  avaBuildTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avaBuildLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  avaBuildEstimate: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  avaBuildPercent: { fontSize: 24, lineHeight: 29, color: colors.ink, fontWeight: '900' },
  avaProgressTrack: { height: 8, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginTop: spacing.md },
  avaProgressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryAction },
  avaDaysHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg },
  avaDaysTitle: { ...typography.bodyBold, color: colors.ink },
  avaDaysCount: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  avaDaysGrid: { flexDirection: 'row', gap: 5, marginTop: spacing.sm },
  avaDayCell: { flex: 1, minWidth: 0, height: 44, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  avaDayCellBuilt: { borderColor: colors.borderStrong, backgroundColor: colors.panelRaised },
  avaDayCellText: { fontSize: 9, lineHeight: 11, color: colors.inkSubtle, fontWeight: '800' },
  avaDayCellTextBuilt: { color: colors.ink },
  avaFeedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  avaFeedLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  avaLivePill: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.panelRaised, paddingHorizontal: spacing.sm },
  avaLiveDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.gold },
  avaLiveText: { fontSize: 9, lineHeight: 11, color: colors.ink, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  avaMessageFeed: { minHeight: 58, marginTop: spacing.sm, gap: spacing.xs },
  avaFeedMessage: { minHeight: 42, paddingHorizontal: spacing.md, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  avaFeedMessageActive: { minHeight: 52, backgroundColor: colors.panelRaised, borderColor: colors.borderStrong },
  avaFeedMessageText: { ...typography.caption, color: colors.inkMuted, flex: 1, fontWeight: '600' },
  avaFeedMessageTextActive: { ...typography.bodyBold, color: colors.ink },
  avaBuildHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md },
  avaBuildHint: { ...typography.caption, color: colors.inkMuted, lineHeight: 19, flexShrink: 1 },
  avaSafeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingBottom: spacing.sm },
  avaSafeText: { ...typography.caption, color: colors.inkSubtle },
  avaReadyCard: { alignSelf: 'stretch', marginTop: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, padding: spacing.lg, gap: spacing.md },
  avaReadyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avaReadyText: { ...typography.body, color: colors.ink, flex: 1 },
  avaReadyButton: { alignSelf: 'stretch', marginBottom: spacing.sm },
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
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  planTitle: { fontWeight: '800', letterSpacing: -0.6, color: colors.ink, flexShrink: 1 },
  summary: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
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
  aiRefreshCard: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  aiRefreshCardFailed: { borderColor: colors.goldMuted },
  aiRefreshHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  aiRefreshIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelWarm,
  },
  aiRefreshCopy: { flex: 1, minWidth: 0 },
  aiRefreshContentAligned: { marginLeft: 42 + spacing.md },
  aiRefreshKicker: { ...typography.overline, color: colors.gold },
  aiRefreshTitle: { ...typography.title, color: colors.ink, marginTop: 3 },
  aiRefreshText: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs, lineHeight: 22 },
  aiRefreshMetaRow: { minHeight: 36, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  aiRefreshMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aiRefreshMetaText: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
  aiRefreshMetaDot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.inkSubtle },
  aiRefreshButton: { marginTop: spacing.sm },
  aiRefreshUnavailable: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  aiRefreshUnavailableText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18 },
  coachingFeatureSection: { marginTop: spacing.xl + spacing.sm },
  coachingFeatureHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  coachingFeatureHeaderLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  coachingFeatureHeaderCopy: { flex: 1, minWidth: 0 },
  coachingFeatureTitle: { ...typography.title, color: colors.ink },
  coachingFeatureSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  coachingFeatureSeeAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: spacing.sm },
  coachingFeatureSeeAllText: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  coachingFeatureHero: { height: 218, overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel },
  coachingFeatureHeroExpanded: { height: 260 },
  coachingFeatureHeroLargeText: { height: 'auto' },
  coachingFeatureImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  coachingFeatureImageStage: { height: 180, overflow: 'hidden', backgroundColor: colors.panelMuted },
  coachingFeatureImageFlow: { width: '100%', height: '100%' },
  coachingFeatureShade: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '61%', backgroundColor: 'rgba(5,6,10,0.78)' },
  coachingFeatureShadeExpanded: { width: '78%' },
  coachingFeatureCopy: { width: '58%', height: '100%', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  coachingFeatureCopyExpanded: { width: '76%', paddingHorizontal: spacing.lg },
  coachingFeatureCopyFlow: { padding: spacing.lg, backgroundColor: colors.panel },
  coachingFeatureKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  coachingFeatureHeroTitle: { fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.45, color: colors.inkStrong, marginTop: spacing.xs },
  coachingFeatureAction: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primaryAction, paddingHorizontal: spacing.md, marginTop: spacing.md },
  coachingFeatureActionText: { ...typography.caption, color: colors.onPrimary, fontWeight: '900' },
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
  trainerInfo: { flex: 1, minWidth: 0 },
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
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  weekHeaderCopy: { flex: 1, minWidth: 0 },
  weekTitle: { ...typography.subtitle, color: colors.ink },
  weekMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  weekPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
  },
  weekDay: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayNode: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayNodeDone: { backgroundColor: colors.primaryAction },
  weekDayNodeSelectedDone: { borderWidth: 2, borderColor: colors.gold },
  weekDayNodeToday: { backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  weekDayNodeSelected: { backgroundColor: colors.gold, borderWidth: 0 },
  weekDayNodeSelectedToday: { backgroundColor: colors.gold, borderWidth: 0 },
  weekDayNumber: { ...typography.label, color: colors.inkMuted, fontWeight: '700' },
  weekDayNumberToday: { color: colors.gold },
  weekDayNumberSelected: { color: colors.onPrimary, fontWeight: '900' },
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
  targetMusclesSection: {
    backgroundColor: colors.panelMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  targetMapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  targetMapEyebrow: { ...typography.overline, color: colors.goldMuted, textTransform: 'uppercase' },
  targetMapCount: { ...typography.caption, color: colors.inkSubtle, fontWeight: '700' },
  targetMuscleLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    height: 30,
    overflow: 'hidden',
  },
  targetMuscleChip: {
    minHeight: 28,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  targetMuscleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  targetMuscleText: { ...typography.caption, color: colors.ink, fontWeight: '700', flexShrink: 1 },
  targetMuscleOverflow: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', marginLeft: 2 },
  targetAnalysisEmpty: {
    height: 38,
    justifyContent: 'center',
  },
  targetAnalysisEmptyTitle: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  focusedWorkoutCopy: { flex: 1, minWidth: 0 },
  focusedWorkoutStateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusedWorkoutDay: { ...typography.caption, color: colors.inkSubtle },
  workoutStateDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.inkSubtle },
  focusedWorkoutState: { ...typography.caption, color: colors.inkMuted },
  focusedWorkoutStateToday: { color: colors.goldMuted, fontWeight: '700' },
  focusedWorkoutTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.1,
    height: 48,
    color: colors.ink,
    marginTop: spacing.xs,
  },
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
  planSheetLoading: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.md },
  planSkeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 78, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  planSkeletonBadge: { width: 44, height: 44, borderRadius: radius.md },
  planSkeletonText: { flex: 1, gap: spacing.sm },
  planSkeletonTitle: { width: '62%', height: 14 },
  planSkeletonMeta: { width: '82%', height: 10 },
  planSheetError: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  planSheetErrorIcon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.errorLight, marginBottom: spacing.md },
  planSheetErrorTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'center' },
  planSheetErrorDetail: { ...typography.body, color: colors.inkMuted, textAlign: 'center', lineHeight: 22, marginTop: spacing.sm },
  planSheetRetry: { alignSelf: 'stretch', marginTop: spacing.lg },
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
