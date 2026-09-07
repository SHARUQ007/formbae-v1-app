import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Image, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import NativeLinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line as SvgLine, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Card, ScreenContainer, ScreenTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
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
  const { data, loading, error, reload, refresh, refreshing, setData } = useAsync<Loaded>((mode) =>
    loadProgressBundleCached({ force: mode === 'refresh' }),
  [], { initialData: peekProgressBundleCached() });

  const [weight, setWeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
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

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Progress</ScreenTitle>
        <LoadingState message="Loading your progress..." />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ScreenTitle>Progress</ScreenTitle>
        <ErrorState message={error || 'Could not load progress.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const { progress } = data;
  const completionRate = progress.planned ? Math.min(progress.completed / progress.planned, 1) : 0;
  const adherence = Number.isFinite(progress.adherencePct) ? Math.round(progress.adherencePct) : Math.round(completionRate * 100);
  const review = progress.weeklyReview;
  const currentUserId = user?.userId || status?.userId || '';
  const reviewReady = review?.status === 'ready'
    && Boolean(currentUserId)
    && progress.userId === currentUserId
    && review.generatedForUserId === currentUserId;
  const reviewStats = review?.stats ?? {
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
  const nextReviewDays = review?.nextInDays ?? 7;
  const reportCycleProgress = Math.max(0, Math.min(1, (7 - nextReviewDays) / 7));
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
  const nextReviewDayLabel = `${nextReviewDays} day${nextReviewDays === 1 ? '' : 's'}`;
  const reportHeroTitle = reviewReady
    ? 'Your week, explained'
    : showReportCountdown
      ? `Next report in ${nextReviewDayLabel}`
      : 'Your week is taking shape';
  const reportHeroDetail = reviewReady
    ? `Fresh insights · Updates in ${nextReviewDayLabel}`
    : showReportCountdown
      ? 'Your weekly inputs are complete'
      : hasMealRequirement
        ? `Workouts ${workoutGoalPercent}% · Meals ${mealGoalPercent}%`
        : `Workouts ${workoutGoalPercent}%`;
  const reportHeroProgress = reviewReady
    ? 1
    : showReportCountdown
      ? reportCycleProgress
      : activationProgress;
  const reportCompletionPercent = Math.round(Math.max(0, Math.min(1, reportHeroProgress)) * 100);
  const nextFocusDomain = review?.nextFocusDomain ?? 'workout';
  const nextFocusCta = nextFocusDomain === 'diet'
    ? 'Log your next meal'
    : nextFocusDomain === 'body'
      ? 'Add a body update'
      : 'Open your workout plan';

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

  const openNextFocus = () => {
    if (nextFocusDomain === 'diet') {
      navigation.getParent()?.navigate('Diet');
      return;
    }
    if (nextFocusDomain === 'body') {
      setLogMode('body');
      return;
    }
    navigation.getParent()?.navigate('Workouts', { screen: 'WorkoutList' });
  };

  const openWorkoutTask = () => {
    navigation.getParent()?.navigate('Workouts', { screen: 'WorkoutList' });
  };
  const openMealTask = () => {
    navigation.getParent()?.navigate('Diet');
  };

  const reportHistory = reviewReady ? review?.history ?? [] : [];
  const reportStats = reviewReady ? review?.reportStats ?? reviewStats : reviewStats;
  const fallbackDailyActivity = buildFallbackDailyActivity(progress.completionHistory ?? []);
  const reportMetrics = review?.metrics ?? {
    momentumScore: Math.round((Math.max(0, Math.min(100, reportStats.adherencePct)) * 0.75) + (Math.min(100, reportStats.currentStreak * 20) * 0.25)),
    momentumLabel: reportStats.adherencePct >= 80 ? 'Strong week' : reportStats.adherencePct >= 50 ? 'Building' : 'Starting point',
    dimensions: [
      { key: 'training', label: 'Plan adherence', value: Math.max(0, Math.min(100, reportStats.adherencePct)), status: reportStats.adherencePct >= 80 ? 'strong' as const : reportStats.adherencePct >= 50 ? 'building' as const : 'attention' as const },
      { key: 'consistency', label: 'Current streak', value: Math.min(100, reportStats.currentStreak * 20), status: reportStats.currentStreak >= 3 ? 'strong' as const : reportStats.currentStreak ? 'building' as const : 'attention' as const },
    ],
    dailyActivity: fallbackDailyActivity,
    workoutFocus: [],
    feedbackSignals: [],
    bodyChanges: [],
  };
  const reportHighlights = review?.highlights?.length
    ? review.highlights
    : (review?.wins ?? []).map(win => ({ title: win, evidence: '', whyItMatters: '' }));
  const reportFindings = review?.keyFindings?.length
    ? review.keyFindings.slice(0, 2)
    : reportHighlights.slice(0, 2).map(item => ({
        domain: 'progress',
        title: item.title,
        insight: item.whyItMatters || item.evidence,
      }));
  const reportActions = review?.actionPlan?.length
    ? review.actionPlan
    : review?.nextFocusTitle
      ? [{ priority: 1, domain: review.nextFocusDomain || 'workout', title: review.nextFocusTitle, why: review.nextFocusReason || '', steps: [], successMeasure: '' }]
      : [];

  if (route.name === 'ProgressReportHistory') {
    return (
      <ScreenContainer withBottomInset>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportHistoryScroll}>
          <View style={styles.reportHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.reportBackButton} accessibilityRole="button" accessibilityLabel="Back to progress report">
              <Feather name="chevron-left" size={22} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.reportHeaderText}>
              <Text style={styles.reportHeaderEyebrow}>Progress</Text>
              <Text style={styles.reportHeaderTitle}>Report history</Text>
            </View>
          </View>

          <Text style={styles.reportHistoryCount}>
            {reportHistory.length} generated report{reportHistory.length === 1 ? '' : 's'}
          </Text>

          {reportHistory.length ? reportHistory.map((item, index) => {
            const snapshot = item.report;
            const snapshotStats = snapshot.stats;
            return (
              <Card key={item.reportId || item.generatedAt} style={styles.reportHistoryCard}>
                <View style={styles.reportHistoryMeta}>
                  <Text style={styles.reportHistoryDate}>{formatDate(item.generatedAt)}</Text>
                  {index === 0 ? <Text style={styles.reportHistoryLatest}>Latest</Text> : null}
                </View>
                <Text style={styles.reportHistoryTitle}>{snapshot.headline || 'Weekly progress report'}</Text>
                {snapshot.summary ? <Text style={styles.reportHistorySummary}>{snapshot.summary}</Text> : null}
                {snapshotStats ? (
                  <View style={styles.reportHistoryStats}>
                    <Text style={styles.reportHistoryStat}>{snapshotStats.workoutsCompleted} workout{snapshotStats.workoutsCompleted === 1 ? '' : 's'}</Text>
                    <View style={styles.reportHistoryStatDot} />
                    <Text style={styles.reportHistoryStat}>{snapshotStats.mealsLogged} food log{snapshotStats.mealsLogged === 1 ? '' : 's'}</Text>
                  </View>
                ) : null}
                {snapshot.wins?.length ? (
                  <View style={styles.reportHistoryWins}>
                    {snapshot.wins.slice(0, 3).map(win => (
                      <View key={win} style={styles.reportHistoryWinRow}>
                        <Feather name="check" size={14} color={colors.gold} />
                        <Text style={styles.reportHistoryWinText}>{win}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {snapshot.workoutInsight ? (
                  <View style={styles.reportHistoryInsight}>
                    <Text style={styles.reportHistoryInsightLabel}>Training</Text>
                    <Text style={styles.reportHistoryInsightText}>{snapshot.workoutInsight}</Text>
                  </View>
                ) : null}
                {snapshot.nutritionInsight ? (
                  <View style={styles.reportHistoryInsight}>
                    <Text style={styles.reportHistoryInsightLabel}>Nutrition</Text>
                    <Text style={styles.reportHistoryInsightText}>{snapshot.nutritionInsight}</Text>
                  </View>
                ) : null}
              </Card>
            );
          }) : (
            <Card style={styles.reportHistoryEmpty}>
              <Feather name="file-text" size={24} color={colors.inkMuted} />
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
      <ScreenContainer withBottomInset>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportScroll}>
          <View style={styles.reportHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.reportBackButton} accessibilityRole="button" accessibilityLabel="Back to progress">
              <Feather name="chevron-left" size={22} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.reportHeaderText}>
              <Text style={styles.reportHeaderTitle}>Weekly report</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('ProgressReportHistory')} style={styles.reportHistoryButton} accessibilityRole="button" accessibilityLabel="View previous reports">
              <Feather name="clock" size={16} color={colors.gold} />
              <Text style={styles.reportHistoryButtonText}>History</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reportLead}>
            <View style={styles.reportLeadMeta}>
              <View style={styles.reportLeadStatus}>
                <View style={styles.reportLeadStatusDot} />
                <Text style={styles.reportLeadStatusText}>{reviewReady ? 'Latest report' : showReportCountdown ? 'Inputs complete' : 'Collecting activity'}</Text>
              </View>
            </View>
            <Text style={styles.reportLeadTitle} numberOfLines={2} adjustsFontSizeToFit>
              {reviewReady ? review?.headline : showReportCountdown ? 'Your weekly inputs are complete.' : 'Build a useful weekly baseline.'}
            </Text>
            <Text style={styles.reportLeadSummary} numberOfLines={2}>
              {reviewReady
                ? review?.summary
                : showReportCountdown
                  ? `Everything required for this cycle is logged. Your next report publishes in ${nextReviewDayLabel}.`
                  : hasMealRequirement
                    ? `Log ${workoutTarget} workouts and ${mealTarget} meals. Saved activity counts automatically toward this report.`
                    : `Complete ${workoutTarget} workout${workoutTarget === 1 ? '' : 's'} to create a useful progress report.`}
            </Text>
          </View>

          <View style={styles.reportDataRow}>
            <ReportDatum label="Workouts" value={`${reportStats.workoutsCompleted}`} />
            <View style={styles.reportDataDivider} />
            <ReportDatum label="Adherence" value={`${reportStats.adherencePct}%`} />
            <View style={styles.reportDataDivider} />
            <ReportDatum label="Food logs" value={`${reportStats.mealsLogged}`} />
          </View>

          {reviewReady ? (
            <>
              <View style={styles.reportOverviewGrid}>
                <Card style={styles.momentumCard}>
                  <MomentumRing value={reportMetrics.momentumScore} />
                  <View style={styles.momentumCopy}>
                    <Text style={styles.reportSectionKicker}>Weekly momentum</Text>
                    <Text style={styles.momentumLabel}>{reportMetrics.momentumLabel}</Text>
                  </View>
                </Card>
              </View>

              <ReportSectionHeader kicker="Activity" title="How your week unfolded" />
              <WeeklyActivityChart data={reportMetrics.dailyActivity} />

              {reportFindings.length ? (
                <>
                  <ReportSectionHeader kicker="Takeaways" title="What matters this week" />
                  <View style={styles.findingStack}>
                    {reportFindings.map((finding, index) => (
                      <View key={`${finding.title}-${index}`} style={styles.findingCard}>
                        <View style={styles.findingTop}>
                          <Text style={styles.findingDomain}>{finding.domain}</Text>
                        </View>
                        <Text style={styles.findingTitle}>{finding.title}</Text>
                        {finding.insight ? <Text style={styles.findingInsight} numberOfLines={2}>{finding.insight}</Text> : null}
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {reportActions.length ? (
                <>
                  <ReportSectionHeader kicker="Next week" title="Your next steps" />
                  <View style={styles.actionPlanStack}>
                    {reportActions.slice(0, 2).map((action, index) => (
                      <ActionPlanCard key={`${action.title}-${index}`} action={action} />
                    ))}
                  </View>
                </>
              ) : null}

              {review?.coachNote ? <Text style={styles.coachNote}>{review.coachNote}</Text> : null}
              <PrimaryButton title={nextFocusCta} icon="arrow-right" onPress={openNextFocus} style={styles.reportPrimaryAction} />
            </>
          ) : (
            <Card style={styles.activationStatusCard}>
              <View style={styles.activationHeading}>
                <View style={styles.activationHeadingCopy}>
                  <Text style={styles.activationStatusEyebrow}>Report requirements</Text>
                  <Text style={styles.activationStatusTitle}>{showReportCountdown ? 'Everything is logged' : hasMealRequirement ? 'Complete both inputs' : 'Complete your first workout'}</Text>
                  <Text style={styles.activationStatusLabel}>{activationGoalsComplete} of {activationGoalsTotal} complete</Text>
                </View>
                <View style={styles.activationCount}>
                  <Text style={styles.activationCountText}>{activationGoalsComplete}/{activationGoalsTotal}</Text>
                </View>
              </View>
              <View style={styles.activationGoals}>
                <ActivationGoalRow icon="activity" label="Workout goal" noun="workout" current={workoutProgress} target={workoutTarget} complete={workoutGoalMet} onPress={openWorkoutTask} />
                {hasMealRequirement ? <><View style={styles.activationGoalDivider} /><ActivationGoalRow icon="coffee" label="Nutrition goal" noun="meal" current={mealProgress} target={mealTarget} complete={mealGoalMet} onPress={openMealTask} /></> : null}
              </View>
              {showReportCountdown ? (
                <View style={styles.reportPending}>
                  <Feather name="clock" size={17} color={colors.gold} />
                  <Text style={styles.reportPendingText}>No action needed. The report refreshes automatically in {nextReviewDayLabel}.</Text>
                </View>
              ) : (
                <PrimaryButton
                  title={workoutGoalMet ? 'Log your next meal' : 'Continue workout plan'}
                  icon="arrow-right"
                  onPress={workoutGoalMet ? openMealTask : openWorkoutTask}
                  style={styles.activationButton}
                />
              )}
            </Card>
          )}
        </ScrollView>
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
                  <Feather name="edit-3" size={19} color={colors.gold} />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.progressScreenTitle} accessibilityRole="header">Progress</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${nextReviewDayLabel} to next report. ${reportCompletionPercent}% complete`}>
            <View style={styles.reportCountdown}>
              <Text style={styles.reportCountdownValue}>{nextReviewDayLabel} to next report</Text>
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

        <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`Open progress report. ${nextReviewDayLabel} to next report. ${reportCompletionPercent}% complete`}>
          {reviewReady ? (
            <View style={styles.reportCard}>
              <Image
                source={getProgressReportArtwork(profileGender)}
                style={styles.reportArtwork}
                resizeMode="cover"
                accessible={false}
                testID="progress-report-art"
              />
              <NativeLinearGradient
                colors={['rgba(5,6,10,0.98)', 'rgba(5,6,10,0.9)', 'rgba(5,6,10,0.3)', 'rgba(5,6,10,0.02)']}
                locations={[0, 0.48, 0.76, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.reportArtworkShade}
                pointerEvents="none"
              />
              <View style={styles.reportHeroContent}>
                <View style={styles.reportHeroStatus}>
                  <View style={[styles.reportHeroStatusDot, styles.reportHeroStatusDotReady]} />
                  <Text style={styles.reportHeroKicker}>Latest ready</Text>
                </View>
                <Text style={styles.reportTitle} numberOfLines={2}>{reportHeroTitle}</Text>
                <Text style={styles.reportHeroDetail} numberOfLines={1}>{reportHeroDetail}</Text>
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
                <Text style={styles.reportPendingCountdown}>{nextReviewDayLabel} to next report</Text>
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
        <Feather name="plus" size={18} color={colors.gold} />
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

function buildFallbackDailyActivity(history: NonNullable<ProgressSummary['completionHistory']>) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const dateKey = date.toISOString().slice(0, 10);
    return {
      date: dateKey,
      label: date.toLocaleDateString('en-IN', { weekday: 'narrow' }),
      workouts: history.filter(item => item.date.slice(0, 10) === dateKey).length,
      foodLogs: 0,
    };
  });
}

function ReportSectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View style={styles.reportSectionHead}>
      <Text style={styles.reportSectionKicker}>{kicker}</Text>
      <Text style={styles.reportSectionTitle}>{title}</Text>
    </View>
  );
}

function MomentumRing({ value }: { value: number }) {
  const size = 78;
  const stroke = 7;
  const radiusValue = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const dash = progress * circumference;
  return (
    <View style={styles.momentumRing} accessible accessibilityLabel={`Weekly momentum ${Math.round(value)} out of 100`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} fill="none" stroke={colors.panelRaised} strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} fill="none" stroke={colors.gold} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={styles.momentumRingValue}><Text style={styles.momentumRingNumber}>{Math.round(value)}</Text><Text style={styles.momentumRingUnit}>/100</Text></View>
    </View>
  );
}

function WeeklyActivityChart({ data }: { data: Array<{ date: string; label: string; workouts: number; foodLogs: number }> }) {
  const hasActivity = data.some(item => item.workouts > 0 || item.foodLogs > 0);
  if (!hasActivity) {
    return (
      <Card style={styles.activityEmpty}>
        <View style={styles.activityEmptyIcon}><Feather name="calendar" size={19} color={colors.gold} /></View>
        <View style={styles.activityEmptyCopy}>
          <Text style={styles.activityEmptyTitle}>No activity logged this week</Text>
          <Text style={styles.activityEmptyText}>Your workouts and food logs will appear here.</Text>
        </View>
      </Card>
    );
  }
  const peak = Math.max(1, ...data.map(item => Math.max(item.workouts, item.foodLogs)));
  return (
    <Card style={styles.activityChart}>
      <View style={styles.chartLegend}>
        <View style={styles.chartLegendItem}><View style={styles.chartLegendWorkout} /><Text style={styles.chartLegendText}>Workouts</Text></View>
        <View style={styles.chartLegendItem}><View style={styles.chartLegendFood} /><Text style={styles.chartLegendText}>Food logs</Text></View>
      </View>
      <View style={styles.activityBars} accessible accessibilityLabel={`Seven day activity. ${data.map(item => `${item.label}: ${item.workouts} workouts and ${item.foodLogs} food logs`).join('. ')}`}>
        {data.map(item => (
          <View key={item.date} style={styles.activityDay}>
            <View style={styles.activityBarArea}>
              <View style={[styles.activityBar, styles.activityWorkoutBar, activityBarHeight(item.workouts, peak)]} />
              <View style={[styles.activityBar, styles.activityFoodBar, activityBarHeight(item.foodLogs, peak)]} />
            </View>
            <Text style={styles.activityDayLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function activityBarHeight(value: number, peak: number) {
  return { height: value ? Math.max(8, (value / peak) * 86) : 2 };
}

function ActionPlanCard({ action }: { action: { priority: number; domain: string; title: string; why: string; steps?: string[]; successMeasure?: string } }) {
  return (
    <Card style={styles.actionPlanCard}>
      <View style={styles.actionPlanHead}>
        <View style={styles.actionPriority}><Text style={styles.actionPriorityText}>{action.priority}</Text></View>
        <View style={styles.actionPlanHeadCopy}><Text style={styles.actionDomain}>{action.domain}</Text><Text style={styles.actionTitle}>{action.title}</Text></View>
      </View>
      <Text style={styles.actionWhy} numberOfLines={2}>{action.why}</Text>
      {action.successMeasure ? <View style={styles.successMeasure}><Feather name="target" size={15} color={colors.gold} /><Text style={styles.successMeasureText}>Done when: {action.successMeasure}</Text></View> : null}
    </Card>
  );
}

function ReportDatum({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reportDatum}>
      <Text style={styles.reportDatumValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.reportDatumLabel}>{label}</Text>
    </View>
  );
}

function ActivationGoalRow({ icon, label, noun, current, target, complete, onPress }: { icon: string; label: string; noun: string; current: number; target: number; complete: boolean; onPress: () => void }) {
  const remaining = Math.max(0, target - current);
  const progress = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
  const detail = complete ? 'Goal complete' : `${remaining} more ${noun}${remaining === 1 ? '' : 's'} to go`;

  return (
    <TouchableOpacity onPress={onPress} disabled={complete} activeOpacity={0.72} style={styles.activationGoal} accessibilityRole={complete ? undefined : 'button'} accessibilityLabel={`${label}. ${current} of ${target}. ${detail}`}>
      <View style={[styles.activationGoalIcon, complete && styles.activationGoalIconComplete]}>
        <Feather name={complete ? 'check' : icon} size={18} color={colors.gold} />
      </View>
      <View style={styles.activationGoalCopy}>
        <View style={styles.activationGoalTitleRow}>
          <Text style={styles.activationGoalLabel}>{label}</Text>
          <Text style={[styles.activationGoalValue, complete && styles.activationGoalValueComplete]}>{current}/{target}</Text>
        </View>
        <Text style={[styles.activationGoalDetail, complete && styles.activationGoalDetailComplete]}>{detail}</Text>
        <View style={styles.activationGoalTrack}><View style={[styles.activationGoalFill, complete && styles.activationGoalFillComplete, { width: `${progress}%` }]} /></View>
      </View>
      {!complete ? <Feather name="chevron-right" size={19} color={colors.inkSubtle} /> : null}
    </TouchableOpacity>
  );
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
  reportScroll: { paddingBottom: spacing.xl },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  reportBackButton: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  reportHeaderText: { flex: 1, minWidth: 0 },
  reportHeaderEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase', marginBottom: 1 },
  reportHeaderTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.35, color: colors.ink },
  reportHistoryButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.md },
  reportHistoryButtonText: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  reportHistoryScroll: { paddingBottom: spacing.xl, gap: spacing.md },
  reportHistoryCount: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.xs },
  reportHistoryCard: { padding: spacing.lg, gap: spacing.sm },
  reportHistoryMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reportHistoryDate: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  reportHistoryLatest: { fontSize: 10, lineHeight: 13, color: colors.gold, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  reportHistoryTitle: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  reportHistorySummary: { ...typography.body, color: colors.inkMuted },
  reportHistoryStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  reportHistoryStat: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  reportHistoryStatDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.inkSubtle },
  reportHistoryWins: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  reportHistoryWinRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reportHistoryWinText: { ...typography.caption, color: colors.ink, flex: 1 },
  reportHistoryInsight: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 3 },
  reportHistoryInsightLabel: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  reportHistoryInsightText: { ...typography.caption, color: colors.inkMuted },
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
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
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
  reportArtworkShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
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

  reportLead: { paddingBottom: 20 },
  reportLeadMeta: { flexDirection: 'row', alignItems: 'center' },
  reportLeadStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportLeadStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.gold },
  reportLeadStatusText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  reportLeadTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.35, color: colors.ink, marginTop: spacing.sm },
  reportLeadSummary: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: spacing.sm, maxWidth: 520 },
  reportDataRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  reportDatum: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: spacing.xs },
  reportDatumValue: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  reportDatumLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: 3, textAlign: 'center' },
  reportDataDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: colors.borderStrong },
  reportHighlights: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
  reportSectionHead: { marginBottom: spacing.sm },
  reportSectionKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  reportSectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.ink, marginTop: 2 },
  reportOverviewGrid: { marginBottom: spacing.lg },
  momentumCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14 },
  momentumRing: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  momentumRingValue: { position: 'absolute', alignItems: 'center' },
  momentumRingNumber: { fontSize: 22, lineHeight: 25, fontWeight: '900', color: colors.ink, letterSpacing: -0.4 },
  momentumRingUnit: { fontSize: 9, lineHeight: 12, color: colors.inkMuted, fontWeight: '700' },
  momentumCopy: { flex: 1, minWidth: 0 },
  momentumLabel: { fontSize: 18, lineHeight: 23, color: colors.ink, fontWeight: '800', marginTop: 2 },
  momentumCaption: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 4 },
  activityChart: { padding: spacing.md, marginBottom: spacing.lg },
  activityEmpty: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.panelMuted },
  activityEmptyIcon: { width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.panelWarm },
  activityEmptyCopy: { flex: 1, minWidth: 0 },
  activityEmptyTitle: { ...typography.bodyBold, color: colors.ink, fontWeight: '600' },
  activityEmptyText: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartLegendWorkout: { width: 9, height: 9, borderRadius: 2, backgroundColor: colors.gold },
  chartLegendFood: { width: 9, height: 9, borderRadius: 2, backgroundColor: colors.inkSubtle },
  chartLegendText: { ...typography.caption, color: colors.inkMuted },
  activityBars: { height: 122, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  activityDay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  activityBarArea: { height: 92, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  activityBar: { width: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  activityWorkoutBar: { backgroundColor: colors.gold },
  activityFoodBar: { backgroundColor: colors.inkSubtle },
  activityDayLabel: { fontSize: 10, lineHeight: 14, color: colors.inkMuted, fontWeight: '700', marginTop: 6, marginBottom: 3 },
  dimensionCard: { padding: spacing.md, gap: spacing.md, marginBottom: spacing.md },
  dimensionRow: { gap: 6 },
  dimensionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dimensionLabel: { ...typography.bodyBold, color: colors.ink },
  dimensionValue: { ...typography.bodyBold, color: colors.gold },
  dimensionTrack: { height: 7, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden' },
  dimensionFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  dimensionStatus: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', textTransform: 'capitalize' },
  reportChartPair: { gap: spacing.sm, marginBottom: spacing.xl },
  distributionCard: { padding: spacing.md, gap: spacing.sm },
  distributionTitle: { ...typography.bodyBold, color: colors.ink, marginBottom: 2 },
  distributionRow: { gap: 4 },
  distributionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  distributionLabel: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  distributionValue: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  distributionTrack: { height: 5, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden' },
  distributionFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  highlightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  highlightCard: { width: '48%', minHeight: 108, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  highlightNumber: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelWarm, marginBottom: spacing.sm },
  highlightNumberText: { fontSize: 12, lineHeight: 15, color: colors.gold, fontWeight: '900' },
  highlightTitle: { ...typography.bodyBold, color: colors.ink },
  highlightEvidence: { ...typography.caption, color: colors.gold, fontWeight: '700', marginTop: 5 },
  highlightMeaning: { fontSize: 11, lineHeight: 16, color: colors.inkMuted, marginTop: 4 },
  findingStack: { gap: spacing.sm, marginBottom: spacing.lg },
  findingCard: { borderLeftWidth: 2, borderLeftColor: colors.gold, borderRadius: radius.sm, backgroundColor: colors.panel, padding: spacing.md },
  findingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  findingDomain: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  findingTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: colors.ink, marginTop: spacing.xs },
  findingInsight: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 3 },
  findingEvidence: { fontSize: 10, lineHeight: 15, color: colors.inkSubtle, marginTop: spacing.sm },
  domainStack: { gap: spacing.sm, marginBottom: spacing.lg },
  domainCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  domainHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  domainIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.panelWarm, alignItems: 'center', justifyContent: 'center' },
  domainTitle: { ...typography.subtitle, color: colors.ink, flex: 1 },
  domainStatus: { fontSize: 10, lineHeight: 13, color: colors.gold, fontWeight: '800', textTransform: 'uppercase' },
  domainSummary: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: spacing.sm },
  domainEvidence: { gap: 4, marginTop: spacing.sm },
  domainEvidenceText: { ...typography.caption, color: colors.inkMuted },
  domainActions: { borderTopWidth: 1, borderTopColor: colors.border, gap: 5, paddingTop: spacing.sm, marginTop: spacing.md },
  domainActionsLabel: { ...typography.overline, color: colors.gold },
  domainActionText: { ...typography.caption, color: colors.ink, lineHeight: 18 },
  bodyChangeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  bodyChangeCard: { width: '48%', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  bodyChangeLabel: { ...typography.caption, color: colors.inkMuted },
  bodyChangeValue: { fontSize: 22, lineHeight: 28, color: colors.ink, fontWeight: '900', marginTop: 3 },
  bodyChangeUnit: { fontSize: 12, color: colors.inkMuted, fontWeight: '700' },
  bodyChangeDelta: { ...typography.caption, color: colors.gold, fontWeight: '700', marginTop: 2 },
  watchoutStack: { gap: spacing.sm, marginBottom: spacing.xl },
  watchoutCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted, padding: spacing.md },
  watchoutCopy: { flex: 1, minWidth: 0 },
  watchoutTitle: { ...typography.bodyBold, color: colors.ink },
  watchoutReason: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  watchoutResponse: { ...typography.caption, color: colors.gold, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  actionPlanStack: { gap: spacing.sm },
  actionPlanCard: { padding: spacing.md, gap: spacing.sm },
  actionPlanHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionPriority: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  actionPriorityText: { fontSize: 14, lineHeight: 18, color: colors.onPrimary, fontWeight: '900' },
  actionPlanHeadCopy: { flex: 1, minWidth: 0 },
  actionDomain: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  actionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: colors.ink, marginTop: 2 },
  actionWhy: { fontSize: 13, lineHeight: 19, color: colors.inkMuted },
  actionSteps: { gap: 4 },
  actionStep: { ...typography.caption, color: colors.ink, lineHeight: 18 },
  successMeasure: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  successMeasureText: { ...typography.caption, color: colors.gold, fontWeight: '700', flex: 1 },
  coachNote: { ...typography.body, color: colors.inkMuted, textAlign: 'center', fontStyle: 'italic', lineHeight: 22, marginVertical: spacing.lg, paddingHorizontal: spacing.md },
  reportPrimaryAction: { marginBottom: spacing.lg },
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

  activationStatusCard: { padding: 0, overflow: 'hidden', backgroundColor: colors.panel, borderColor: colors.borderStrong },
  activationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 20 },
  activationHeadingCopy: { flex: 1, minWidth: 0 },
  activationStatusEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  activationStatusTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', color: colors.ink, letterSpacing: -0.2, marginTop: 2 },
  activationStatusLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  activationCount: { minWidth: 46, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  activationCountComplete: { backgroundColor: colors.accentLight },
  activationCountText: { ...typography.label, color: colors.inkMuted, fontWeight: '800' },
  activationCountTextComplete: { color: colors.gold },
  activationGoals: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  activationGoal: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 20, paddingVertical: spacing.md },
  activationGoalDivider: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
  activationGoalIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  activationGoalIconComplete: { backgroundColor: colors.panelWarm },
  activationGoalCopy: { flex: 1, minWidth: 0 },
  activationGoalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  activationGoalLabel: { ...typography.bodyBold, color: colors.ink },
  activationGoalValue: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  activationGoalValueComplete: { color: colors.gold },
  activationGoalDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  activationGoalDetailComplete: { color: colors.gold },
  activationGoalTrack: { height: 4, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden', marginTop: spacing.sm },
  activationGoalFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  activationGoalFillComplete: { backgroundColor: colors.gold },
  activationButton: { margin: 20 },
  reportPending: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: 20, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  reportPendingText: { ...typography.caption, color: colors.ink, lineHeight: 18, flex: 1 },

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
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
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
