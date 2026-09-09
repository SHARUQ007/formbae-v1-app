import { weeklyReportSchedule } from '../../utils/weeklyReportSchedule';
import { WeeklyReportPending } from '../../components/WeeklyReportPending';
import { useFocusEffect } from '@react-navigation/native';
import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Image, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line as SvgLine, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Card, ScreenContainer, ScreenTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { WeeklyReportStory } from '../../components/WeeklyReportStory';
import { ReportIllustration } from '../../components/ReportIllustration';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { loadProgressBundleCached, peekProgressBundleCached } from '../../services/preloadService';
import { logProgress } from '../../services/progressService';
import { subscribeToTrophySummary } from '../../services/trophyRealtime';
import type { ProgressSummary } from '../../types/api';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { reportTypography } from '../../theme/reportTypography';
import type { ProgressStackParamList } from '../../navigation/types';
import { deriveCurrentWeekStreak } from '../../utils/weeklyMuscles';
import { useAuthStore } from '../../store/authStore';
import { useProfileBodyGender } from '../../hooks/useProfileBodyGender';
import { getProgressReportArtwork } from '../../utils/reportArtwork';

type Loaded = {
  progress: ProgressSummary;
};
type LogMode = 'body';

const GOLD = '#f5b301';

type MetricKey = 'weight' | 'waist' | 'chest' | 'biceps';
const METRICS: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'waist', label: 'Waist', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'biceps', label: 'Biceps', unit: 'cm' },
];

type SeriesPoint = { date: string; value: number };

type Props =
  | NativeStackScreenProps<ProgressStackParamList, 'ProgressMain'>
  | NativeStackScreenProps<ProgressStackParamList, 'ProgressReport'>
  | NativeStackScreenProps<ProgressStackParamList, 'ProgressReportHistory'>;

export function ProgressScreen({ route, navigation }: Props) {
  const { user, status } = useAuthStore();
  const profileGender = useProfileBodyGender();
  // The progress navigator is also rendered standalone while previewing this
  // flow, where no bottom-tab height provider exists.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const insets = useSafeAreaInsets();
  const { data, loading, error, reload, refresh, refreshing, setData } = useAsync<Loaded>((mode) =>
    loadProgressBundleCached({ force: mode === 'refresh' }),
  [], { initialData: peekProgressBundleCached() });

  // Only a user pull should reveal the native refresh control. Focus updates
  // and report polling share the fetcher, but must not shift the scroll view.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh]);

  const analysisPending = Boolean(weeklyReportSchedule(data?.progress.weeklyReview).preparing || data?.progress.bodyForecast?.generationPending);

  // Refresh on returning to the tab, including recovery from a failed first load.
  useEffect(() => navigation.addListener('focus', () => { refresh().catch(() => undefined); }), [navigation, refresh]);
  useFocusEffect(useCallback(() => {
    if (!analysisPending || refreshing) return;
    const timer = setInterval(() => { refresh().catch(() => undefined); }, 15000);
    return () => clearInterval(timer);
  }, [analysisPending, refresh, refreshing]));

  const [weight, setWeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
  const [expandedHistoryReportId, setExpandedHistoryReportId] = useState<string | null>(null);
  const hasBodyEntry = [weight, chest, waist, biceps].some((value) => value.trim().length > 0);

  useEffect(() => subscribeToTrophySummary((trophies) => {
    setData((current) => current ? {
      ...current,
      progress: { ...current.progress, trophies },
    } : current);
  }), [setData]);

  useEffect(() => {
    if (route.name !== 'ProgressMain') return;
    const action = route.params?.action;
    if (!action) return;
    if (action === 'logBody') setLogMode('body');
    if (action === 'overview') refresh().catch(() => undefined);
    const mainNavigation = navigation as NativeStackScreenProps<ProgressStackParamList, 'ProgressMain'>['navigation'];
    mainNavigation.setParams({ action: undefined, requestId: undefined });
  }, [navigation, refresh, route]);

  const trend = useMemo(() => data?.progress.bodyTrend ?? [], [data]);
  const series = useMemo(() => {
    const map = {} as Record<MetricKey, SeriesPoint[]>;
    for (const metric of METRICS) {
      map[metric.key] = trend
        .map((point) => ({ date: point.date, value: Number(point[metric.key]) }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0);
    }
    return map;
  }, [trend]);
  const onLogBody = async () => {
    if (!weight && !chest && !waist && !biceps) {
      Alert.alert('Add measurement', 'Enter at least one measurement to save.');
      return;
    }
    setSavingBody(true);
    try {
      const result = await logProgress({ weight, chest, waist, biceps });
      setWeight('');
      setChest('');
      setWaist('');
      setBiceps('');
      setLogMode(null);
      if (result.synced) {
        try {
          await loadProgressBundleCached({ force: true });
          await reload();
        } catch {
          Alert.alert('Measurement saved', 'Your measurement is in the database. Pull to refresh when you are back online.');
        }
      } else {
        Alert.alert('Saved on this device', 'Your measurement is safe and will sync to the database automatically when the connection returns.');
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingBody(false);
    }
  };

  const goBackFromReport = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(route.name === 'ProgressReportHistory' ? 'ProgressReport' : 'ProgressMain');
  };
  const reportHeader = route.name === 'ProgressMain' ? null : (
    <ReportNavigationHeader
      history={route.name === 'ProgressReportHistory'}
      onBack={goBackFromReport}
      onHistory={() => navigation.navigate('ProgressReportHistory')}
    />
  );

  if (loading) {
    return (
      <ScreenContainer>
        {reportHeader || <ScreenTitle>Progress</ScreenTitle>}
        <LoadingState message="Loading your progress..." />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        {reportHeader || <ScreenTitle>Progress</ScreenTitle>}
        <ErrorState message={error || 'Could not load progress.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const { progress } = data;
  const completionRate = progress.planned ? Math.min(progress.completed / progress.planned, 1) : 0;
  const adherence = Number.isFinite(progress.adherencePct) ? Math.round(progress.adherencePct) : Math.round(completionRate * 100);
  const review = progress.weeklyReview;
  const currentUserId = user?.userId || status?.userId || '';
  const reviewOwned = Boolean(currentUserId)
    && progress.userId === currentUserId
    && review?.generatedForUserId === currentUserId;
  const reviewReady = reviewOwned && review?.status === 'ready';
  const reviewStats = review?.cycleStats ?? review?.stats ?? {
    workoutsCompleted: progress.completed,
    workoutsPlanned: progress.planned,
    adherencePct: adherence,
    currentStreak: progress.currentStreak,
    mealsLogged: 0,
    dietDaysLogged: 0,
    workoutFeedbackCount: 0,
    checkInCount: 0,
    bodyLogCount: 0,
  };
  const weeklyStreak = progress.completionHistory
    ? deriveCurrentWeekStreak(progress.completionHistory)
    : Math.min(7, progress.currentStreak);
  const fallbackWorkoutCount = progress.completionHistory?.length ?? progress.completed;
  const fallbackFoodLogPoints = reviewStats.mealsLogged;
  const fallbackTrophyScore = fallbackWorkoutCount * 10 + fallbackFoodLogPoints + weeklyStreak * 2;
  const trophies = progress.trophies ?? {
    score: fallbackTrophyScore,
    change: 0,
    safeZone: Math.floor(fallbackTrophyScore / 25) * 25,
    nextMilestone: (Math.floor(fallbackTrophyScore / 25) + 1) * 25,
    pointsToNext: 25 - (fallbackTrophyScore % 25),
    workoutCount: fallbackWorkoutCount,
    starCount: reviewStats.mealsLogged,
    currentStreak: weeklyStreak,
    breakdown: { workouts: fallbackWorkoutCount * 10, stars: fallbackFoodLogPoints, streakAchievement: 0, streakMomentum: weeklyStreak * 2, weeklyPace: 0, foodPace: 0 },
  };
  const trophyBandSize = Math.max(1, trophies.nextMilestone - trophies.safeZone);
  const trophyBandProgress = Math.max(0, Math.min(1, (trophies.score - trophies.safeZone) / trophyBandSize));
  const schedule = weeklyReportSchedule(review);
  const nextReviewDays = schedule.days;
  const workoutTarget = review?.requirements?.workouts ?? 3;
  const mealTarget = review?.requirements?.meals ?? 12;
  const workoutProgress = Math.min(reviewStats.workoutsCompleted, workoutTarget);
  const mealProgress = Math.min(reviewStats.mealsLogged, mealTarget);
  const workoutGoalPercent = workoutTarget > 0 ? Math.min(100, Math.round((workoutProgress / workoutTarget) * 100)) : 100;
  const mealGoalPercent = mealTarget > 0 ? Math.min(100, Math.round((mealProgress / mealTarget) * 100)) : 100;
  const workoutGoalMet = workoutProgress >= workoutTarget;
  const hasMealRequirement = mealTarget > 0;
  const mealGoalMet = hasMealRequirement && mealProgress >= mealTarget;
  const activationGoalsTotal = hasMealRequirement ? 2 : 1;
  const activationGoalsComplete = Number(workoutGoalMet) + Number(mealGoalMet);
  const activationTarget = workoutTarget + mealTarget;
  const activationProgress = activationTarget > 0 ? (workoutProgress + mealProgress) / activationTarget : 0;
  const showReportCountdown = reviewReady || activationGoalsComplete === activationGoalsTotal;
  const nextReviewDayLabel = schedule.dayLabel;
  const reportHeroTitle = reviewReady
    ? 'Your week, explained'
    : showReportCountdown
      ? `Next report in ${nextReviewDayLabel}`
      : 'Your week is taking shape';
  const reportHeroDetail = reviewReady
    ? review?.lastCycleStatus === 'insufficient_activity'
      ? 'Last report saved · New week in progress'
      : schedule.preparing
        ? 'Last report saved · Next review preparing'
        : nextReviewDays > 0 ? `Saved report · Next review in ${nextReviewDayLabel}` : 'Your latest report is available'
    : schedule.preparing
      ? 'Your report is being prepared'
      : review?.cycleState === 'retry_wait'
        ? 'Your activity is saved. We’ll retry the review.'
        : showReportCountdown
          ? 'Goals met · Your review is scheduled'
          : hasMealRequirement
            ? `Workouts ${workoutGoalPercent}% · Meals ${mealGoalPercent}%`
            : `Workouts ${workoutGoalPercent}%`;
  const reportHeroProgress = reviewReady ? 1 : activationProgress;
  const reportCompletionPercent = Math.round(Math.max(0, Math.min(1, reportHeroProgress)) * 100);
  const measuredMetrics = METRICS.filter((metric) => series[metric.key].length > 0);
  const lastLogged = trend[trend.length - 1]?.date;
  const activeMetric = measuredMetrics.find((metric) => metric.key === selectedMetric) || measuredMetrics[0];
  const activeSeries = activeMetric ? series[activeMetric.key] : [];
  const activeForecast = activeMetric
    ? (progress.bodyForecast?.metrics?.[activeMetric.key] ?? [])
        .map((point) => ({ ...point, value: Number(point.value) }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0)
    : [];
  const activeDelta = seriesDelta(activeSeries);
  const activeLastLogged = activeSeries[activeSeries.length - 1]?.date;

  const openReportAction = (domain: 'workout' | 'diet' | 'body') => {
    if (domain === 'diet') {
      navigation.getParent()?.navigate('Diet', { action: 'log', requestId: Date.now() });
      return;
    }
    if (domain === 'body') {
      navigation.navigate('ProgressMain', { action: 'logBody', requestId: Date.now() });
      return;
    }
    navigation.getParent()?.navigate('Workouts', { screen: 'WorkoutList' });
  };

  const openWorkoutTask = () => {
    navigation.getParent()?.navigate('Workouts', { screen: 'WorkoutList' });
  };
  const openMealTask = () => {
    navigation.getParent()?.navigate('Diet', { action: 'log', requestId: Date.now() });
  };

  const reportHistory = reviewOwned ? review?.history ?? [] : [];
  if (route.name === 'ProgressReportHistory') {
    return (
      <ScreenContainer style={styles.reportScreen}>
        {reportHeader}
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.reportHistoryScroll, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.reportHistoryIntro}>
            <View style={styles.reportHistoryArtwork} accessible={false}>
              <ReportIllustration kind="evidence" size={48} />
            </View>
            <View style={styles.reportHistoryIntroCopy}>
              <Text style={styles.reportHistoryIntroTitle}>Week by week</Text>
              <Text style={styles.reportHistoryIntroText}>Compare your strongest signal and the next move from every review.</Text>
            </View>
          </View>

          {reportHistory.length ? (
            <View style={styles.reportHistoryList}>
              {reportHistory.map((item, index) => {
                const snapshot = item.report;
                const snapshotStats = snapshot.reportStats ?? snapshot.stats;
                const reportKey = item.reportId || item.generatedAt;
                const isExpanded = expandedHistoryReportId === reportKey;
                const finding = snapshot.keyFindings?.[0];
                const action = snapshot.actionPlan?.[0];
                const start = snapshot.period?.start || item.weekStartDate;
                const end = snapshot.period?.end;
                const period = start
                  ? `${formatShortDate(start)}${end ? ` – ${formatShortDate(end)}` : ''}`
                  : `Generated ${formatDate(item.generatedAt)}`;
                const insightTitle = finding?.title || snapshot.wins?.[0] || snapshot.workoutInsight || snapshot.nutritionInsight;
                const actionTitle = action?.title || snapshot.nextFocusTitle || snapshot.workoutRecommendation || snapshot.nutritionRecommendation;

                return (
                  <View key={reportKey} style={styles.reportHistoryTimelineRow}>
                    <View style={styles.reportHistoryRail} accessible={false}>
                      <View style={[styles.reportHistoryNode, index === 0 && styles.reportHistoryNodeActive]} />
                      {index < reportHistory.length - 1 ? <View style={styles.reportHistoryRailLine} /> : null}
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.84}
                      onPress={() => setExpandedHistoryReportId(current => current === reportKey ? null : reportKey)}
                      style={[styles.reportHistoryCard, isExpanded && styles.reportHistoryCardExpanded]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityLabel={`${period}. ${snapshot.headline || 'Weekly progress report'}`}
                      accessibilityHint={isExpanded ? 'Collapses report details' : 'Shows report insight and action'}
                    >
                      <View style={styles.reportHistoryMeta}>
                        <View style={styles.reportHistoryPeriodWrap}>
                          <Text style={[styles.reportHistoryLatest, index !== 0 && styles.reportHistorySequence]}>
                            {index === 0 ? 'Latest report' : `Report ${reportHistory.length - index}`}
                          </Text>
                          <Text style={styles.reportHistoryDate}>{period}</Text>
                        </View>

                      </View>

                      <Text style={styles.reportHistoryTitle} numberOfLines={2}>{snapshot.headline || 'Weekly progress report'}</Text>

                      {snapshotStats ? (
                        <View style={styles.reportHistoryStats}>
                          <View style={styles.reportHistoryStatChip}>
                            <ReportIllustration kind="training" size={22} reportKey={start || item.generatedAt} />
                            <Text style={styles.reportHistoryStat}>{snapshotStats.workoutsCompleted} workouts</Text>
                          </View>
                          <View style={styles.reportHistoryStatChip}>
                            <ReportIllustration kind="nutrition" size={22} reportKey={start || item.generatedAt} />
                            <Text style={styles.reportHistoryStat}>{snapshotStats.dietDaysLogged} food days</Text>
                          </View>
                        </View>
                      ) : null}

                      {insightTitle ? (
                        <View style={styles.reportHistorySignalRow}>
                          <View style={styles.reportHistorySignalIcon}><ReportIllustration kind="evidence" size={26} reportKey={start || item.generatedAt} /></View>
                          <View style={styles.reportHistorySignalCopy}>
                            <Text style={styles.reportHistorySignalLabel}>Major insight</Text>
                            <Text style={styles.reportHistorySignalText} numberOfLines={isExpanded ? undefined : 2}>{insightTitle}</Text>
                          </View>
                        </View>
                      ) : null}

                      {isExpanded ? (
                        <View style={styles.reportHistoryExpandedBody}>
                          {snapshot.summary ? <Text style={styles.reportHistorySummary}>{snapshot.summary}</Text> : null}
                          {finding?.whyItMatters ? (
                            <Text style={styles.reportHistoryDetailText}><Text style={styles.reportHistoryDetailLabel}>Why it matters: </Text>{finding.whyItMatters}</Text>
                          ) : null}
                          {finding?.benefit ? (
                            <Text style={styles.reportHistoryDetailText}><Text style={styles.reportHistoryDetailLabel}>Benefit: </Text>{finding.benefit}</Text>
                          ) : null}
                        </View>
                      ) : null}

                      {actionTitle ? (
                        <View style={styles.reportHistoryActionRow}>
                          <View style={styles.reportHistoryActionCopy}>
                            <Text style={styles.reportHistoryActionLabel}>Next action</Text>
                            <Text style={styles.reportHistoryActionText} numberOfLines={isExpanded ? undefined : 1}>{actionTitle}</Text>
                          </View>
                          <Feather name="arrow-up-right" size={17} color={colors.gold} />
                        </View>
                      ) : null}

                      <View style={styles.reportHistoryExpandRow}>
                        <Text style={styles.reportHistoryExpandText}>{isExpanded ? 'Show less' : 'Review details'}</Text>
                        <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkMuted} />
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : (
            <Card style={styles.reportHistoryEmpty}>
              <ReportIllustration kind="evidence" size={48} />
              <Text style={styles.reportHistoryEmptyTitle}>No previous reports yet</Text>
              <Text style={styles.reportHistoryEmptyText}>Each generated weekly report will be saved here.</Text>
            </Card>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (route.name === 'ProgressReport') {
    return (
      <ScreenContainer style={styles.reportScreen}>
        {reportHeader}
        {reviewReady && review ? (
          <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.reportScroll, { paddingBottom: insets.bottom + spacing.xl }]}>
            <WeeklyReportStory report={review} onAction={openReportAction} />
          </ScrollView>
        ) : (
          <WeeklyReportPending workouts={workoutProgress} workoutTarget={workoutTarget} meals={mealProgress} mealTarget={mealTarget}
            generating={schedule.preparing} queued={showReportCountdown} nextInDays={nextReviewDays}
            bottomInset={insets.bottom} onWorkout={openWorkoutTask} onMeal={openMealTask} onRankings={() => navigation.navigate('TrophyDetails')} />
        )}
      </ScreenContainer>
    );
  }

  if (logMode) {
    return (
      <KeyboardScreen>
        <ScreenContainer>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]} keyboardShouldPersistTaps="handled">
            <View style={styles.logHeader}>
              <TouchableOpacity onPress={() => setLogMode(null)} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to progress">
                <Feather name="chevron-left" size={24} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.logHeaderText}>
                <Text style={styles.eyebrow}>Progress update</Text>
                <Text style={styles.logTitle}>Body measurements</Text>
              </View>
            </View>

            <Card variant="outline" style={styles.formCard}>
              <View style={styles.formIntro}>
                <View style={styles.formIcon}>
                  <ReportIllustration kind="measurements" size={48} />
                </View>
                <View style={styles.formIntroText}>
                  <Text style={styles.cardTitle}>Add today’s measurements</Text>
                  <Text style={styles.cardSub}>
                    {lastLogged ? `Last update ${formatDate(lastLogged)}. Enter only what you measured today.` : 'Enter at least one measurement to begin your trend.'}
                  </Text>
                </View>
              </View>
              <View style={styles.inputGrid}>
                <FormInput label="Weight" icon="trending-up" value={weight} onChangeText={setWeight} placeholder="kg" keyboardType="numeric" />
                <FormInput label="Chest" icon="maximize-2" value={chest} onChangeText={setChest} placeholder="cm" keyboardType="numeric" />
                <FormInput label="Waist" icon="minimize-2" value={waist} onChangeText={setWaist} placeholder="cm" keyboardType="numeric" />
                <FormInput label="Biceps" icon="activity" value={biceps} onChangeText={setBiceps} placeholder="cm" keyboardType="numeric" />
              </View>
              <View style={styles.formSaveArea}>
                <Text style={styles.formSaveHint}>{hasBodyEntry ? 'Only filled fields will be updated.' : 'Enter at least one value to save.'}</Text>
                <PrimaryButton
                  title="Save measurements"
                  icon="check"
                  onPress={onLogBody}
                  loading={savingBody}
                  disabled={!hasBodyEntry}
                  style={styles.formSaveButton}
                />
              </View>
            </Card>
          </ScrollView>
        </ScreenContainer>
      </KeyboardScreen>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.progressScreenTitle} accessibilityRole="header">Progress</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${schedule.countdown}. ${reportCompletionPercent}% complete`}>
            <View style={styles.reportCountdown}>
              <Text style={styles.reportCountdownValue}>{schedule.countdown}</Text>
              <Feather name="chevron-right" size={17} color={colors.gold} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.trophySection}>
          <TouchableOpacity
            style={styles.trophyMain}
            onPress={() => navigation.navigate('TrophyDetails', { openInfo: true })}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open information about trophies"
          >
            <TrophyRing value={trophyBandProgress} />
            <View style={styles.trophyCopy}>
              <Text style={styles.trophyLabel}>Trophies</Text>
              <View style={styles.trophyValueRow}>
                <Text style={styles.trophyValue}>{trophies.score}</Text>
                {trophies.change !== 0 ? <Text style={[styles.trophyChange, trophies.change < 0 && styles.trophyChangeDown]}>{trophies.change > 0 ? '+' : ''}{trophies.change}</Text> : null}
              </View>
              <Text style={styles.trophyRemaining} numberOfLines={1} adjustsFontSizeToFit>{trophies.pointsToNext} trophies to safe zone</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.weeklyOverview}>
            <View style={styles.overviewHead}>
              <View>
                <Text style={styles.overviewKicker}>This week</Text>
                <Text style={styles.overviewTitle}>Workout completion</Text>
              </View>
              <Text style={styles.overviewValue}>{adherence}%</Text>
            </View>
            <View style={styles.overviewBar}><ProgressBar value={completionRate} /></View>
          </View>

          <View style={styles.trophyMetricGrid}>
            <TrophyMetric icon="fire" value={`${trophies.currentStreak}`} label="Streak" material />
            <TrophyMetric icon="star" value={`${trophies.starCount}`} label="Star points" />
            <TrophyMetric icon="shield-check" value={`${trophies.nextMilestone}`} label="Safe zone" material />
          </View>

          <TouchableOpacity style={styles.rankingsCta} onPress={() => navigation.navigate('TrophyDetails')} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Open leaderboard">
            <View style={styles.rankingsIcon}><MaterialCommunityIcon name="podium-gold" size={20} color={colors.gold} /></View>
            <View style={styles.rankingsCopy}>
              <Text style={styles.rankingsTitle}>View rankings</Text>
            </View>
            <Feather name="arrow-right" size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`Open progress report. ${schedule.countdown}. ${reportCompletionPercent}% complete`}>
          {reviewReady ? (
            <View style={styles.reportCard}>
              <Image
                source={getProgressReportArtwork(profileGender)}
                style={styles.reportArtwork}
                resizeMode="cover"
                accessible={false}
                testID="progress-report-art"
              />
              <View style={styles.reportArtworkShade} pointerEvents="none" />
              <View style={styles.reportHeroContent}>
                <View style={styles.reportHeroStatus}>
                  <View style={[styles.reportHeroStatusDot, styles.reportHeroStatusDotReady]} />
                  <Text style={styles.reportHeroKicker}>Latest ready</Text>
                </View>
                <Text style={styles.reportTitle} numberOfLines={2}>{reportHeroTitle}</Text>
                <Text style={styles.reportHeroDetail} numberOfLines={2}>{reportHeroDetail}</Text>
                <View style={styles.reportAction}>
                  <Text style={styles.reportActionText}>View report</Text>
                  <Feather name="arrow-right" size={16} color={colors.onPrimary} />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.reportPendingCard}>
              <View style={styles.reportPendingIcon}>
                <Feather name="file-text" size={19} color={colors.gold} />
              </View>
              <View style={styles.reportPendingCopy}>
                <View style={styles.reportPendingHead}>
                  <Text style={styles.reportPendingTitle}>Weekly report</Text>
                  <Text style={styles.reportPendingPercent}>{reportCompletionPercent}%</Text>
                </View>
                <Text style={styles.reportPendingDetail}>{reportHeroDetail}</Text>
                <Text style={styles.reportPendingCountdown}>{schedule.countdown}</Text>
                <View style={styles.reportPendingTrack}>
                  <View style={[styles.reportTrackFill, { width: `${reportCompletionPercent}%` }]} />
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.bodyMeasurementsTitle} accessibilityRole="header">Body measurements</Text>

        {measuredMetrics.length ? (
          activeMetric ? (
            <>
              <Card variant="outline" style={styles.trendCard}>
                {measuredMetrics.length > 1 ? (
                  <View style={styles.metricChips}>
                    {measuredMetrics.map((metric) => {
                      const on = metric.key === activeMetric.key;
                      return (
                        <TouchableOpacity
                          key={metric.key}
                          onPress={() => setSelectedMetric(metric.key)}
                          style={[styles.metricChip, on && styles.metricChipOn]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          hitSlop={{ top: 5, right: 2, bottom: 5, left: 2 }}
                        >
                          <Text style={[styles.metricChipText, on && styles.metricChipTextOn]}>{metric.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.singleMetricTitle}>{activeMetric.label} trend</Text>
                )}
                {measuredMetrics.length === 1 ? (
                  <View style={styles.singleMetricStats}>
                    <View style={styles.singleMetricStat}>
                      <Text style={styles.singleMetricStatLabel}>Current</Text>
                      <Text style={styles.trendValue}>{trimNumber(activeSeries[activeSeries.length - 1].value)}<Text style={styles.trendUnit}> {activeMetric.unit}</Text></Text>
                      {activeLastLogged ? <Text style={styles.trendDate}>Updated {formatDate(activeLastLogged)}</Text> : null}
                    </View>
                    <View style={[styles.singleMetricStat, styles.singleMetricStatRight]}>
                      <Text style={styles.singleMetricStatLabel}>Change</Text>
                      {activeDelta ? (
                        <View style={styles.singleMetricChangeRow}>
                          <Feather name={deltaIcon(activeDelta.dir)} size={15} color={colors.inkMuted} />
                          <Text style={styles.singleMetricChange}>{activeDelta.text.replace(/^[+-]/, '')}<Text style={styles.singleMetricChangeUnit}> {activeMetric.unit}</Text></Text>
                        </View>
                      ) : (
                        <Text style={styles.singleMetricChange}>—</Text>
                      )}
                      <Text style={styles.trendDate}>
                        {activeSeries[0]?.date ? `Since ${formatDate(activeSeries[0].date)}` : 'From first log'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.trendSummary}>
                    <View>
                      <Text style={styles.trendValue}>{trimNumber(activeSeries[activeSeries.length - 1].value)}<Text style={styles.trendUnit}> {activeMetric.unit}</Text></Text>
                      {activeLastLogged ? <Text style={styles.trendDate}>Updated {formatDate(activeLastLogged)}</Text> : null}
                    </View>
                    {activeDelta ? (
                      <View style={styles.trendDelta}><Feather name={deltaIcon(activeDelta.dir)} size={13} color={colors.inkMuted} /><Text style={styles.trendDeltaText}>{activeDelta.text} {activeMetric.unit}</Text></View>
                    ) : null}
                  </View>
                )}
                {activeSeries.length > 1 ? (
                  <>
                    <View style={styles.trendLegend}>
                      <View style={styles.legendItem}><View style={styles.legendActual} /><Text style={styles.legendText}>Logged</Text></View>
                      {activeForecast.length ? <View style={styles.legendItem}><View style={styles.legendForecast} /><Text style={styles.legendText}>Projection</Text></View> : null}
                    </View>
                    <TrendLineChart points={activeSeries} forecast={activeForecast} metricLabel={activeMetric.label} unit={activeMetric.unit} />
                    {activeForecast.length ? (
                      <View style={styles.forecastNote}>
                        <Feather name="refresh-cw" size={13} color={colors.goldMuted} />
                        <Text style={styles.forecastNoteTitle}>Forecast refreshes with your next report</Text>
                      </View>
                    ) : (
                      <Text style={styles.forecastEmpty}>Forecast available after your next report.</Text>
                    )}
                  </>
                ) : (
                  <View style={styles.trendFirstLog}><Feather name="trending-up" size={20} color={colors.inkMuted} /><Text style={styles.trendFirstLogText}>Add one more {activeMetric.label.toLowerCase()} log to start the trend.</Text></View>
                )}
              </Card>
              <MeasurementLogAction onPress={() => setLogMode('body')} />
            </>
          ) : null
        ) : (
          <>
            <Card variant="outline" style={styles.emptyMeasure}>
              <View style={styles.emptyIcon}>
                <Feather name="activity" size={20} color={colors.gold} />
              </View>
              <View style={styles.emptyMeasureCopy}>
                <Text style={styles.emptyTitle}>No measurements yet</Text>
                <Text style={styles.emptyText}>Add a weight or body measurement to start your trend.</Text>
              </View>
            </Card>
            <MeasurementLogAction firstLog onPress={() => setLogMode('body')} />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

export function ReportNavigationHeader({ history, onBack, onHistory }: { history: boolean; onBack: () => void; onHistory: () => void }) {
  return (
    <View style={styles.reportHeader} testID="weekly-report-navigation">
      <TouchableOpacity
        onPress={onBack}
        style={styles.reportBackButton}
        accessibilityRole="button"
        accessibilityLabel={history ? 'Back to weekly report' : 'Back to progress'}
      >
        <Feather name="chevron-left" size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.reportHeaderTitle} numberOfLines={1} accessibilityRole="header">{history ? 'Report history' : 'Weekly report'}</Text>
      {!history ? (
        <TouchableOpacity onPress={onHistory} style={styles.reportHistoryButton} accessibilityRole="button" accessibilityLabel="View previous reports">
          <Text style={styles.reportHistoryButtonText} numberOfLines={1}>History</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MeasurementLogAction({ onPress, firstLog = false }: { onPress: () => void; firstLog?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={styles.measurementLogAction}
      accessibilityRole="button"
      accessibilityLabel={firstLog ? 'Add your first body measurement' : 'Log a new body measurement'}
      accessibilityHint="Opens the body measurement form"
    >
      <View style={styles.measurementLogIcon}>
        <ReportIllustration kind="measurements" size={36} />
      </View>
      <Text style={styles.measurementLogTitle}>{firstLog ? 'Add measurement' : 'Log measurement'}</Text>
      <Feather name="chevron-right" size={19} color={colors.inkSubtle} />
    </TouchableOpacity>
  );
}

function trimNumber(value: number) {
  return `${Math.round(value * 10) / 10}`;
}

function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

type Delta = { dir: 'up' | 'down' | 'flat'; text: string };

function seriesDelta(points: SeriesPoint[]): Delta | null {
  if (points.length < 2) return null;
  const diff = points[points.length - 1].value - points[0].value;
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return { dir: 'flat', text: '0' };
  return { dir: rounded > 0 ? 'up' : 'down', text: `${rounded > 0 ? '+' : ''}${rounded}` };
}

function deltaIcon(dir: Delta['dir']) {
  if (dir === 'down') return 'arrow-down';
  if (dir === 'up') return 'arrow-up';
  return 'minus';
}


function TrophyMetric({ icon, value, label, material = false }: { icon: string; value: string; label: string; material?: boolean }) {
  return (
    <View style={styles.trophyMetricCard}>
      <View style={styles.trophyMetricValueRow}>
        <View style={styles.trophyMetricIcon}>
          {material
            ? <MaterialCommunityIcon name={icon} size={18} color={colors.gold} />
            : <Feather name={icon} size={18} color={colors.gold} />}
        </View>
        <Text style={styles.trophyMetricValue}>{value}</Text>
      </View>
      <Text style={styles.trophyMetricLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
  );
}

function TrophyRing({ value }: { value: number }) {
  const size = 96;
  const stroke = 7;
  const center = size / 2;
  const ringRadius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const progress = Math.max(0, Math.min(1, value));
  const dash = Math.max(progress * circumference, progress > 0 ? 4 : 0);

  return (
    <View style={[styles.trophyRing, { width: size, height: size }]} accessibilityLabel={`${Math.round(progress * 100)} percent toward the next trophy safe zone`}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={ringRadius} stroke={colors.borderStrong} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={colors.gold}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.trophyRingCenter}>
        <MaterialCommunityIcon name="trophy" size={32} color={colors.gold} />
      </View>
    </View>
  );
}

function TrendLineChart({
  points,
  forecast = [],
  metricLabel,
  unit,
}: {
  points: SeriesPoint[];
  forecast?: SeriesPoint[];
  metricLabel: string;
  unit: string;
}) {
  const [width, setWidth] = useState(0);
  const height = 176;
  const padTop = 22;
  const padBottom = 28;
  const padLeft = 36;
  const padRight = 12;
  const data = points.slice(-8);
  const projected = forecast.slice(0, 4);
  const visibleDelta = seriesDelta(data);
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  const forecastEnd = projected[projected.length - 1];
  const chartDescription = firstPoint && lastPoint
    ? [
        `${metricLabel} trend from ${formatDate(firstPoint.date)} to ${formatDate(lastPoint.date)}`,
        `Current ${trimNumber(lastPoint.value)} ${unit}`,
        visibleDelta ? `Change ${visibleDelta.text} ${unit}` : '',
        forecastEnd ? `Forecast through ${formatDate(forecastEnd.date)}` : '',
      ].filter(Boolean).join('. ')
    : `${metricLabel} trend`;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width <= 0 || data.length < 2) return null;
    const values = [...data, ...projected].map((point) => point.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const visualPadding = Math.max((max - min) * 0.16, 0.5);
    const chartMax = max + visualPadding;
    const chartMin = Math.max(0, min - visualPadding);
    const range = Math.max(chartMax - chartMin, 1);
    const innerW = Math.max(width - padLeft - padRight, 1);
    const innerH = height - padTop - padBottom;
    const totalPoints = data.length + projected.length;
    const xAt = (i: number) => padLeft + (i / Math.max(1, totalPoints - 1)) * innerW;
    const yAt = (v: number) => padTop + (1 - (v - chartMin) / range) * innerH;
    const line = data.map((point, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ');
    const forecastLine = projected.length
      ? [data[data.length - 1], ...projected].map((point, i) => `${i === 0 ? 'M' : 'L'} ${xAt(data.length - 1 + i).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ')
      : '';
    const baseY = height - padBottom;
    const area = `${line} L ${xAt(data.length - 1).toFixed(1)} ${baseY} L ${xAt(0).toFixed(1)} ${baseY} Z`;
    const lastIndex = data.length - 1;
    const forecastBoundary = projected.length ? (xAt(lastIndex) + xAt(lastIndex + 1)) / 2 : 0;
    return { xAt, yAt, line, forecastLine, area, baseY, lastIndex, chartMin, chartMax, forecastBoundary };
  }, [width, data, projected]);

  return (
    <View
      style={{ height }}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={chartDescription}
    >
      {geometry ? (
        <Svg width={width} height={height}>
          <Defs>
            <SvgLinearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.ink} stopOpacity={0.12} />
              <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          {projected.length ? <Rect x={geometry.forecastBoundary} y={padTop} width={Math.max(0, width - padRight - geometry.forecastBoundary)} height={geometry.baseY - padTop} fill={colors.accentLight} rx={6} /> : null}
          {[0, 0.5, 1].map((ratio) => {
            const y = padTop + ratio * (geometry.baseY - padTop);
            const value = geometry.chartMax - ratio * (geometry.chartMax - geometry.chartMin);
            return (
              <Fragment key={ratio}>
                <SvgLine x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray={ratio === 1 ? undefined : '3 5'} />
                <SvgText x={0} y={y + 4} fontSize={9} fill={colors.inkSubtle}>{trimNumber(value)}</SvgText>
              </Fragment>
            );
          })}
          {projected.length ? <SvgLine x1={geometry.forecastBoundary} y1={padTop} x2={geometry.forecastBoundary} y2={geometry.baseY} stroke={colors.goldMuted} strokeWidth={1} strokeDasharray="3 5" /> : null}
          {projected.length ? <SvgText x={geometry.forecastBoundary + 6} y={16} fontSize={9} fontWeight="700" fill={colors.gold}>FORECAST</SvgText> : null}
          <Path d={geometry.area} fill="url(#trendArea)" />
          <Path d={geometry.line} stroke={colors.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {geometry.forecastLine ? <Path d={geometry.forecastLine} stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 6" /> : null}
          {data.map((point, index) => <Circle key={`actual-${point.date}-${index}`} cx={geometry.xAt(index)} cy={geometry.yAt(point.value)} r={3} fill={colors.panel} stroke={colors.ink} strokeWidth={2} />)}
          {projected.map((point, index) => <Circle key={`forecast-${point.date}-${index}`} cx={geometry.xAt(data.length + index)} cy={geometry.yAt(point.value)} r={3} fill={colors.panel} stroke={GOLD} strokeWidth={2} />)}
          <Circle cx={geometry.xAt(geometry.lastIndex)} cy={geometry.yAt(data[geometry.lastIndex].value)} r={6} fill={colors.white} />
          <Circle cx={geometry.xAt(geometry.lastIndex)} cy={geometry.yAt(data[geometry.lastIndex].value)} r={4} fill={GOLD} />
          <SvgText x={padLeft} y={height - 8} fontSize={10} fill={colors.inkSubtle} textAnchor="start">
            {formatShortDate(data[0].date)}
          </SvgText>
          {projected.length ? <SvgText x={geometry.xAt(geometry.lastIndex)} y={height - 8} fontSize={10} fill={colors.inkMuted} textAnchor="middle">Now</SvgText> : null}
          <SvgText x={width - padRight} y={height - 8} fontSize={10} fill={projected.length ? GOLD : colors.inkSubtle} textAnchor="end">
            {formatShortDate(projected[projected.length - 1]?.date || data[geometry.lastIndex].date)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  reportScreen: { paddingBottom: 0 },
  reportScroll: { paddingBottom: spacing.xl },
  reportHeader: { width: '100%', minHeight: 56, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, marginBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bg },
  reportStickyHeader: { zIndex: 20, elevation: 4, backgroundColor: colors.bg },
  reportBackButton: { width: 44, minHeight: 44, flexShrink: 0, borderRadius: radius.pill, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  reportBackText: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 20, color: colors.ink },
  reportHeaderLeading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportHeaderTitle: { ...reportTypography.heading, flex: 1, minWidth: 0, color: colors.ink },
  reportHistoryButton: { width: 60, minHeight: 44, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' },
  reportHistoryButtonText: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600' },
  reportHistoryScroll: { paddingBottom: spacing.xl },
  reportHistoryHeader: { marginBottom: spacing.md },
  reportHistoryCountChip: { minWidth: 38, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportHistoryCountValue: { ...reportTypography.data, color: colors.ink },
  reportHistoryIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginBottom: spacing.lg },
  reportHistoryArtwork: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  reportHistoryArtworkBar: { width: 5, borderRadius: radius.pill, backgroundColor: colors.gold },
  reportHistoryArtworkBarShort: { height: 10, opacity: 0.48 },
  reportHistoryArtworkBarMedium: { height: 17, opacity: 0.72 },
  reportHistoryArtworkBarTall: { height: 25 },
  reportHistoryArtworkLine: { position: 'absolute', left: 10, right: 10, bottom: 9, height: 1, backgroundColor: colors.goldMuted, opacity: 0.45 },
  reportHistoryIntroCopy: { flex: 1, minWidth: 0 },
  reportHistoryIntroTitle: { ...typography.subtitle, color: colors.ink },
  reportHistoryIntroText: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  reportHistoryList: { gap: 0 },
  reportHistoryTimelineRow: { flexDirection: 'row', alignItems: 'stretch' },
  reportHistoryRail: { width: 24, alignItems: 'center' },
  reportHistoryNode: { width: 9, height: 9, borderRadius: radius.pill, marginTop: 22, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bg, zIndex: 1 },
  reportHistoryNodeActive: { width: 11, height: 11, borderColor: colors.gold, backgroundColor: colors.gold },
  reportHistoryRailLine: { position: 'absolute', top: 30, bottom: -22, width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  reportHistoryCard: { flex: 1, minWidth: 0, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportHistoryCardExpanded: { borderColor: colors.borderStrong, backgroundColor: colors.panelMuted },
  reportHistoryMeta: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  reportHistoryPeriodWrap: { flex: 1, minWidth: 0 },
  reportHistoryDate: { ...reportTypography.data, color: colors.ink, marginTop: 2 },
  reportHistoryLatest: { ...typography.label, color: colors.gold },
  reportHistorySequence: { color: colors.inkMuted },
  reportHistoryScoreWrap: { flexDirection: 'row', alignItems: 'baseline' },
  reportHistoryScore: { ...reportTypography.dataLarge, fontSize: 22, lineHeight: 27, color: colors.ink },
  reportHistoryScoreMax: { ...reportTypography.data, color: colors.inkSubtle },
  reportHistoryDelta: { ...typography.caption, color: colors.inkMuted, marginLeft: 6 },
  reportHistoryDeltaPositive: { color: colors.success },
  reportHistoryTitle: { ...typography.title, fontSize: 19, lineHeight: 25, color: colors.ink, marginTop: spacing.md },
  reportHistorySummary: { ...typography.body, color: colors.inkMuted },
  reportHistoryStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reportHistoryStatChip: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.bgTint },
  reportHistoryStat: { ...typography.caption, color: colors.inkMuted },
  reportHistorySignalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  reportHistorySignalIcon: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  reportHistorySignalCopy: { flex: 1, minWidth: 0 },
  reportHistorySignalLabel: { ...typography.label, fontSize: 11, lineHeight: 15, color: colors.gold },
  reportHistorySignalText: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  reportHistoryExpandedBody: { gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reportHistoryDetailText: { ...typography.caption, color: colors.inkMuted },
  reportHistoryDetailLabel: { color: colors.ink, fontWeight: '600' },
  reportHistoryActionRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.panelRaised },
  reportHistoryActionCopy: { flex: 1, minWidth: 0 },
  reportHistoryActionLabel: { ...typography.label, fontSize: 11, lineHeight: 15, color: colors.gold },
  reportHistoryActionText: { ...typography.caption, color: colors.ink, marginTop: 1 },
  reportHistoryExpandRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reportHistoryExpandText: { ...typography.label, color: colors.inkMuted },
  reportHistoryEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  reportHistoryEmptyTitle: { ...typography.bodyBold, color: colors.ink },
  reportHistoryEmptyText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  headerCopy: { flex: 1 },
  progressScreenTitle: { fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -0.35, color: colors.ink },
  reportCountdown: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.sm },
  reportCountdownValue: { fontSize: 12, lineHeight: 16, color: colors.inkMuted, fontWeight: '600' },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logHeaderText: { flex: 1 },
  logTitle: { ...typography.title, color: colors.ink },
  formCard: { gap: spacing.sm, padding: spacing.md },
  formIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  formIcon: {
    width: 52,
    height: 52,
    flexShrink: 0,
    borderRadius: radius.md,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formIntroText: { flex: 1, minWidth: 0 },
  inputGrid: { gap: 0 },
  formSaveArea: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  formSaveHint: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
  formSaveButton: { backgroundColor: colors.gold, borderColor: colors.gold },

  trophySection: { paddingTop: spacing.xs, paddingBottom: spacing.lg },
  trophyMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trophyRing: { alignItems: 'center', justifyContent: 'center' },
  trophyRingCenter: { position: 'absolute', width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  trophyCopy: { flex: 1, minWidth: 0 },
  trophyLabel: { ...typography.overline, color: colors.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  trophyValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trophyValue: { fontSize: 38, lineHeight: 43, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  trophyChange: { ...typography.caption, color: colors.gold, fontWeight: '600', backgroundColor: colors.panelWarm, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  trophyChangeDown: { color: colors.error, backgroundColor: colors.errorLight },
  trophyRemaining: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.inkMuted, marginTop: 1 },
  weeklyOverview: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  trophyMetricGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  trophyMetricCard: { flex: 1, minWidth: 0, minHeight: 80, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 12 },
  trophyMetricValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  trophyMetricIcon: { width: 20, alignItems: 'flex-start', justifyContent: 'center' },
  trophyMetricValue: { fontSize: 19, lineHeight: 23, fontWeight: '600', color: colors.ink, letterSpacing: -0.1 },
  trophyMetricLabel: { fontSize: 11, lineHeight: 15, color: colors.inkMuted, fontWeight: '500', marginTop: 2 },
  rankingsCta: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.gold, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.md },
  rankingsIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onPrimary },
  rankingsCopy: { flex: 1, minWidth: 0 },
  rankingsTitle: { ...typography.bodyBold, color: colors.onPrimary, fontWeight: '600' },

  reportCard: { minHeight: 190, overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel },
  // All report artwork is 3:2. Preserve that ratio and anchor it to the top;
  // the wide card then trims only the lower scene instead of the subject's head.
  reportArtwork: { position: 'absolute', top: 0, left: 0, width: '100%', aspectRatio: 1.5 },
  reportArtworkShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,6,10,0.68)' },
  reportHeroContent: { width: '64%', minHeight: 190, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  reportHeroStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportHeroStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.inkSubtle },
  reportHeroStatusDotReady: { backgroundColor: colors.gold },
  reportHeroKicker: { fontSize: 10, lineHeight: 13, letterSpacing: 0.8, color: colors.gold, fontWeight: '700', textTransform: 'uppercase' },
  bodyMeasurementsTitle: { fontSize: 18, lineHeight: 24, fontWeight: '500', color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  reportTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: colors.inkStrong, letterSpacing: -0.2, marginTop: spacing.sm },
  reportHeroDetail: { fontSize: 11, lineHeight: 16, color: colors.onAccentMuted, fontWeight: '500', marginTop: 4 },
  reportTrack: { width: '100%', height: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden', marginTop: spacing.md },
  reportTrackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  reportAction: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primaryAction, paddingHorizontal: 14, marginTop: spacing.md },
  reportActionText: { ...typography.caption, color: colors.onPrimary, fontWeight: '600' },
  reportPendingCard: { minHeight: 118, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  reportPendingIcon: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.panelWarm },
  reportPendingCopy: { flex: 1, minWidth: 0 },
  reportPendingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reportPendingTitle: { ...typography.bodyBold, color: colors.ink, fontWeight: '600' },
  reportPendingPercent: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  reportPendingDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  reportPendingCountdown: { fontSize: 11, lineHeight: 15, color: colors.inkSubtle, marginTop: 2 },
  reportPendingTrack: { height: 3, borderRadius: radius.pill, backgroundColor: colors.borderStrong, overflow: 'hidden', marginTop: spacing.sm },



  overviewHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg },
  overviewKicker: { ...typography.overline, color: colors.inkMuted, fontWeight: '600', textTransform: 'uppercase' },
  overviewTitle: { fontSize: 16, lineHeight: 22, fontWeight: '500', color: colors.ink, marginTop: 3 },
  overviewValue: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  overviewBar: { marginTop: spacing.md },

  reportMethodology: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  reportMethodologyText: { fontSize: 10, lineHeight: 15, color: colors.inkSubtle, flex: 1 },
  reviewHero: { padding: 20, marginBottom: spacing.md, backgroundColor: colors.panelWarm, borderColor: colors.accentSurface },
  reviewHeroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiMark: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  aiMarkText: { fontSize: 17, lineHeight: 21, fontWeight: '900', color: colors.gold },
  reviewHeroLabelCopy: { flex: 1, minWidth: 0 },
  reviewHeroKicker: { ...typography.bodyBold, color: colors.ink },
  reviewHeroMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  reviewStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  reviewStatusReady: { backgroundColor: colors.accentLight },
  reviewStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.inkSubtle },
  reviewStatusDotReady: { backgroundColor: colors.gold },
  reviewStatusText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: colors.inkMuted },
  reviewStatusTextReady: { color: colors.gold },
  reviewHeadline: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.45, color: colors.ink, marginTop: spacing.lg },
  reviewSummary: { ...typography.body, color: colors.inkMuted, lineHeight: 23, marginTop: spacing.sm },
  winList: { gap: spacing.xs, marginTop: spacing.md },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  winText: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reviewEvidence: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.lg },
  reviewEvidenceText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, flex: 1 },
  heroProgress: { borderTopWidth: 1, borderTopColor: colors.accentSurface, paddingTop: spacing.md, marginTop: spacing.lg },
  heroProgressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  heroProgressLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  heroProgressValue: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  heroProgressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden' },
  heroProgressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  heroMetrics: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  heroMetric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetricText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },

  insightStack: { borderTopWidth: 1, borderTopColor: colors.border },
  insightCard: { gap: spacing.sm, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  insightIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  insightHeadCopy: { flex: 1, minWidth: 0 },
  insightEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  insightTitle: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  insightText: { ...typography.body, color: colors.inkMuted, lineHeight: 23 },
  recommendationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  recommendationLabel: { ...typography.overline, color: colors.gold, paddingTop: 2 },
  recommendationText: { ...typography.bodyBold, color: colors.ink, lineHeight: 21, flex: 1 },

  nextFocusCard: { marginTop: spacing.lg, backgroundColor: colors.panelWarm, borderColor: colors.accentSurface, gap: spacing.sm },
  nextFocusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextFocusIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  nextFocusCopy: { flex: 1, minWidth: 0 },
  nextFocusEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  nextFocusTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  nextFocusReason: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  nextFocusButton: { marginTop: spacing.xs },
  bodyInvestment: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  bodyInvestmentText: { ...typography.caption, color: colors.ink, fontWeight: '800', textAlign: 'center' },



  trendCard: { gap: 10, padding: spacing.md, backgroundColor: colors.panel },
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metricChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricChipOn: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  metricChipText: { ...typography.caption, color: colors.inkMuted, fontWeight: '500' },
  metricChipTextOn: { color: colors.white, fontWeight: '600' },
  singleMetricTitle: { ...typography.bodyBold, color: colors.ink, fontWeight: '500' },
  singleMetricStats: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 11,
  },
  singleMetricStat: { flex: 1, minWidth: 0, justifyContent: 'center' },
  singleMetricStatRight: { alignItems: 'flex-end', paddingRight: spacing.xs },
  singleMetricStatLabel: {
    ...typography.overline,
    color: colors.inkSubtle,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  singleMetricChangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  singleMetricChange: { fontSize: 23, lineHeight: 28, fontWeight: '600', color: colors.ink, letterSpacing: -0.2 },
  singleMetricChangeUnit: { ...typography.label, color: colors.inkMuted },
  trendSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  trendValue: { fontSize: 29, lineHeight: 34, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  trendUnit: { ...typography.body, color: colors.inkMuted },
  trendDate: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  trendDelta: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.panelMuted, paddingHorizontal: 10, paddingVertical: 6 },
  trendDeltaText: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
  trendLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: -2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendActual: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.ink },
  legendForecast: { width: 18, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.gold },
  legendText: { ...typography.caption, color: colors.inkMuted, fontWeight: '500' },
  forecastNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  forecastNoteTitle: { ...typography.caption, color: colors.inkSubtle, fontWeight: '500', flexShrink: 1 },
  forecastEmpty: { ...typography.caption, color: colors.inkSubtle, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, lineHeight: 17 },
  trendFirstLog: { minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  trendFirstLogText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  measurementLogAction: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  measurementLogIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  measurementLogTitle: { ...typography.bodyBold, color: colors.ink, fontWeight: '600', flex: 1, minWidth: 0 },

  emptyMeasure: { minHeight: 88, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMeasureCopy: { flex: 1, minWidth: 0 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, fontWeight: '500' },
  emptyText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 2 },

  cardTitle: { ...typography.subtitle, color: colors.ink },
  cardSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
