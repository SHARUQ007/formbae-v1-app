import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line as SvgLine, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Card, ScreenContainer, ScreenTitle, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { loadProgressBundleCached, peekProgressBundleCached } from '../../services/preloadService';
import { logProgress } from '../../services/progressService';
import type { ProgressSummary } from '../../types/api';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { ProgressStackParamList } from '../../navigation/types';
import { deriveCurrentWeekStreak } from '../../utils/weeklyMuscles';

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
  | NativeStackScreenProps<ProgressStackParamList, 'ProgressReport'>;

export function ProgressScreen({ route, navigation }: Props) {
  // The progress navigator is also rendered standalone while previewing this
  // flow, where no bottom-tab height provider exists.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { data, loading, error, reload, refresh, refreshing } = useAsync<Loaded>((mode) =>
    loadProgressBundleCached({ force: mode === 'refresh' }),
  [], { initialData: peekProgressBundleCached() });

  const [weight, setWeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');

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
  const reviewReady = review?.status === 'ready';
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
  const fallbackFoodLogPoints = Math.floor(reviewStats.mealsLogged / 3);
  const fallbackTrophyScore = fallbackWorkoutCount * 3 + fallbackFoodLogPoints + weeklyStreak * 2;
  const trophies = progress.trophies ?? {
    score: fallbackTrophyScore,
    change: 0,
    safeZone: Math.floor(fallbackTrophyScore / 25) * 25,
    nextMilestone: (Math.floor(fallbackTrophyScore / 25) + 1) * 25,
    pointsToNext: 25 - (fallbackTrophyScore % 25),
    workoutCount: fallbackWorkoutCount,
    starCount: reviewStats.mealsLogged,
    currentStreak: weeklyStreak,
    breakdown: { workouts: fallbackWorkoutCount * 3, stars: fallbackFoodLogPoints, streakAchievement: 0, streakMomentum: weeklyStreak * 2, weeklyPace: 0, foodPace: 0 },
  };
  const trophyBandSize = Math.max(1, trophies.nextMilestone - trophies.safeZone);
  const trophyBandProgress = Math.max(0, Math.min(1, (trophies.score - trophies.safeZone) / trophyBandSize));
  const nextReviewDays = review?.nextInDays ?? 7;
  const reportCycleProgress = Math.max(0, Math.min(1, (7 - nextReviewDays) / 7));
  const workoutTarget = review?.requirements?.workouts ?? 3;
  const mealTarget = review?.requirements?.meals ?? 12;
  const workoutProgress = Math.min(reviewStats.workoutsCompleted, workoutTarget);
  const mealProgress = Math.min(reviewStats.mealsLogged, mealTarget);
  const workoutGoalMet = workoutProgress >= workoutTarget;
  const mealGoalMet = mealProgress >= mealTarget;
  const activationGoalsComplete = Number(workoutGoalMet) + Number(mealGoalMet);
  const activationProgress = (workoutProgress + mealProgress) / (workoutTarget + mealTarget);
  const showReportCountdown = reviewReady || activationGoalsComplete === 2;
  const nextReviewDayLabel = `${nextReviewDays} day${nextReviewDays === 1 ? '' : 's'}`;
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
  const activeForecast = activeMetric ? progress.bodyForecast?.metrics?.[activeMetric.key] ?? [] : [];
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

  if (route.name === 'ProgressReport') {
    return (
      <ScreenContainer withBottomInset>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reportScroll}>
          <View style={styles.reportHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.reportBackButton} accessibilityRole="button" accessibilityLabel="Back to progress">
              <Feather name="chevron-left" size={22} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.reportHeaderText}>
              <Text style={styles.reportHeaderEyebrow}>Progress</Text>
              <Text style={styles.reportHeaderTitle}>Progress report</Text>
            </View>
          </View>

          <View style={styles.reportLead}>
            <View style={styles.reportLeadMeta}>
              <Text style={styles.reportLeadKicker}>Weekly report</Text>
              <View style={styles.reportLeadStatus}>
                <View style={styles.reportLeadStatusDot} />
                <Text style={styles.reportLeadStatusText}>{reviewReady ? 'Latest report' : showReportCountdown ? 'Inputs complete' : 'Collecting activity'}</Text>
              </View>
            </View>
            <Text style={styles.reportLeadTitle}>
              {reviewReady ? review?.headline : showReportCountdown ? 'Your weekly inputs are complete.' : 'Build a useful weekly baseline.'}
            </Text>
            <Text style={styles.reportLeadSummary}>
              {reviewReady
                ? review?.summary
                : showReportCountdown
                  ? `Everything required for this cycle is logged. Your next report publishes in ${nextReviewDayLabel}.`
                  : `Log ${workoutTarget} workouts and ${mealTarget} meals. Saved activity counts automatically toward this report.`}
            </Text>
          </View>

          <View style={styles.reportDataRow}>
            <ReportDatum label="Workouts" value={`${workoutProgress}/${workoutTarget}`} />
            <View style={styles.reportDataDivider} />
            <ReportDatum label="Meals" value={`${mealProgress}/${mealTarget}`} />
            <View style={styles.reportDataDivider} />
            <ReportDatum label="Next report" value={nextReviewDayLabel} />
          </View>

          {reviewReady ? (
            <>
              {review?.wins?.length ? (
                <View style={styles.reportHighlights}>
                  <Text style={styles.reportSectionKicker}>Highlights</Text>
                  {review.wins.slice(0, 3).map((win) => (
                    <View key={win} style={styles.winRow}><Feather name="check" size={15} color={colors.gold} /><Text style={styles.winText}>{win}</Text></View>
                  ))}
                </View>
              ) : null}
              <View style={styles.reportSectionHead}>
                <Text style={styles.reportSectionKicker}>Coaching notes</Text>
                <Text style={styles.reportSectionTitle}>What the week shows</Text>
              </View>
              <View style={styles.insightStack}>
                <InsightPanel icon="activity" eyebrow="Training" title="Workout pattern" insight={review?.workoutInsight || ''} recommendation={review?.workoutRecommendation || ''} />
                <InsightPanel icon="coffee" eyebrow="Nutrition" title="Meal pattern" insight={review?.nutritionInsight || ''} recommendation={review?.nutritionRecommendation || ''} />
              </View>
              <Card style={styles.nextFocusCard}>
                <View style={styles.nextFocusTop}>
                  <View style={styles.nextFocusIcon}><Feather name="arrow-up-right" size={20} color={colors.onPrimary} /></View>
                  <View style={styles.nextFocusCopy}><Text style={styles.nextFocusEyebrow}>Recommended next step</Text><Text style={styles.nextFocusTitle}>{review?.nextFocusTitle}</Text></View>
                </View>
                <Text style={styles.nextFocusReason}>{review?.nextFocusReason}</Text>
                <PrimaryButton title={nextFocusCta} icon="arrow-right" onPress={openNextFocus} variant="inverted" style={styles.nextFocusButton} />
              </Card>
            </>
          ) : (
            <Card style={styles.activationStatusCard}>
              <View style={styles.activationHeading}>
                <View style={styles.activationHeadingCopy}>
                  <Text style={styles.activationStatusEyebrow}>Report requirements</Text>
                  <Text style={styles.activationStatusTitle}>{showReportCountdown ? 'Everything is logged' : 'Complete both inputs'}</Text>
                  <Text style={styles.activationStatusLabel}>{activationGoalsComplete} of 2 complete</Text>
                </View>
                <View style={styles.activationCount}>
                  <Text style={styles.activationCountText}>{activationGoalsComplete}/2</Text>
                </View>
              </View>
              <View style={styles.activationGoals}>
                <ActivationGoalRow icon="activity" label="Workout goal" noun="workout" current={workoutProgress} target={workoutTarget} complete={workoutGoalMet} onPress={openWorkoutTask} />
                <View style={styles.activationGoalDivider} />
                <ActivationGoalRow icon="coffee" label="Nutrition goal" noun="meal" current={mealProgress} target={mealTarget} complete={mealGoalMet} onPress={openMealTask} />
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
                <Text style={styles.eyebrow}>Log progress</Text>
                <Text style={styles.logTitle}>Update your coach</Text>
              </View>
            </View>

            <Card style={styles.formCard}>
              <View style={styles.formIntro}>
                <View style={styles.formIcon}>
                  <Feather name="trending-up" size={22} color={colors.white} />
                </View>
                <View style={styles.formIntroText}>
                  <Text style={styles.cardTitle}>Body measurements</Text>
                  <Text style={styles.cardSub}>
                    {lastLogged ? `Last logged ${formatDate(lastLogged)}. Update only when something changed.` : 'Add your first body measurement.'}
                  </Text>
                </View>
              </View>
              <View style={styles.inputGrid}>
                <FormInput icon="trending-up" value={weight} onChangeText={setWeight} placeholder="Weight (kg)" keyboardType="numeric" />
                <FormInput icon="maximize-2" value={chest} onChangeText={setChest} placeholder="Chest (cm)" keyboardType="numeric" />
                <FormInput icon="minimize-2" value={waist} onChangeText={setWaist} placeholder="Waist (cm)" keyboardType="numeric" />
                <FormInput icon="activity" value={biceps} onChangeText={setBiceps} placeholder="Biceps (cm)" keyboardType="numeric" />
              </View>
              <PrimaryButton title="Save body log" icon="plus" onPress={onLogBody} loading={savingBody} />
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
            <ScreenTitle>Progress</ScreenTitle>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${nextReviewDayLabel} until next report. ${activationGoalsComplete} of 2 goals complete`}>
            <View style={styles.reportCountdown}>
              <View style={styles.reportCountdownCopy}>
                <Text style={styles.reportCountdownValue}>{nextReviewDayLabel}</Text>
                <Text style={styles.reportCountdownLabel}>Next report</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.gold} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.trophySection}>
          <View style={styles.trophyMain}>
            <TrophyRing value={trophyBandProgress} />
            <View style={styles.trophyCopy}>
              <Text style={styles.trophyLabel}>Trophies</Text>
              <View style={styles.trophyValueRow}>
                <Text style={styles.trophyValue}>{trophies.score}</Text>
                {trophies.change !== 0 ? <Text style={[styles.trophyChange, trophies.change < 0 && styles.trophyChangeDown]}>{trophies.change > 0 ? '+' : ''}{trophies.change}</Text> : null}
              </View>
              <Text style={styles.trophyRemaining} numberOfLines={1} adjustsFontSizeToFit>{trophies.pointsToNext} trophies to safe zone</Text>
            </View>
          </View>
          <View style={styles.weeklyOverview}>
            <View style={styles.overviewHead}>
              <View>
                <Text style={styles.overviewKicker}>This week</Text>
                <Text style={styles.overviewTitle}>{reviewStats.workoutsCompleted} of {reviewStats.workoutsPlanned || 0} workouts</Text>
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

          <TouchableOpacity style={styles.rankingsCta} onPress={() => navigation.navigate('TrophyDetails')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Open leaderboard">
            <View style={styles.rankingsIcon}><MaterialCommunityIcon name="podium-gold" size={20} color={colors.gold} /></View>
            <View style={styles.rankingsCopy}>
              <Text style={styles.rankingsTitle}>View rankings</Text>
              <Text style={styles.rankingsSubtitle}>Open leaderboard</Text>
            </View>
            <Feather name="arrow-right" size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ProgressReport')} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`Open progress report. ${nextReviewDayLabel} until next report. ${activationGoalsComplete} of 2 goals complete`}>
          <View style={styles.reportCard}>
            <View style={styles.reportTop}>
              <View style={styles.reportIcon}><Feather name="file-text" size={20} color={colors.gold} /></View>
              <Text style={styles.reportLabel}>Weekly progress report</Text>
              {reviewReady ? <View style={styles.reportReady}><View style={styles.reportReadyDot} /><Text style={styles.reportReadyText}>Latest ready</Text></View> : null}
              <Feather name="chevron-right" size={21} color={colors.inkSubtle} />
            </View>
            <Text style={styles.reportTitle}>{nextReviewDayLabel} until next report</Text>
            <View style={styles.reportTrack}><View style={[styles.reportTrackFill, { width: `${(showReportCountdown ? reportCycleProgress : activationProgress) * 100}%` }]} /></View>
            <View style={styles.reportFoot}>
              <Text style={styles.reportFootText}>{reviewReady ? 'Your latest insights are ready' : `${activationGoalsComplete}/2 goals · ${workoutProgress}/${workoutTarget} workouts · ${mealProgress}/${mealTarget} meals`}</Text>
              <View style={styles.reportAction}><Text style={styles.reportActionText}>Open report</Text><Feather name="arrow-right" size={15} color={colors.gold} /></View>
            </View>
          </View>
        </TouchableOpacity>

        <SectionTitle>Body measurements</SectionTitle>

        {measuredMetrics.length ? (
          activeMetric ? (
            <Card style={styles.trendCard}>
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
                      >
                        <Text style={[styles.metricChipText, on && styles.metricChipTextOn]}>{metric.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.singleMetricTitle}>{activeMetric.label}</Text>
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
                        <Feather name={deltaIcon(activeDelta.dir)} size={16} color={colors.inkMuted} />
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
                  <TrendLineChart points={activeSeries} forecast={activeForecast} minimumValue={activeMetric.key === 'weight' ? 20 : undefined} />
                  {activeForecast.length ? (
                    <View style={styles.forecastNote}>
                      <View style={styles.forecastNoteCopy}>
                        <Text style={styles.forecastNoteTitle}>Projection updates with your next weekly report</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.forecastEmpty}>The weekly forecast will appear after the next model refresh.</Text>
                  )}
                </>
              ) : (
                <View style={styles.trendFirstLog}><Feather name="trending-up" size={20} color={colors.inkMuted} /><Text style={styles.trendFirstLogText}>Add one more {activeMetric.label.toLowerCase()} log to start the trend.</Text></View>
              )}
              <View style={styles.trendLogAction}>
                <PrimaryButton title="Log body measurement" icon="plus" onPress={() => setLogMode('body')} />
              </View>
            </Card>
          ) : null
        ) : (
          <Card style={styles.emptyMeasure}>
            <View style={styles.emptyIcon}>
              <Feather name="activity" size={22} color={colors.accentDark} />
            </View>
            <Text style={styles.emptyTitle}>No measurements yet</Text>
            <Text style={styles.emptyText}>Add your weight or key measurements to start tracking your body trend over time.</Text>
            <PrimaryButton title="Log measurements" icon="plus" onPress={() => setLogMode('body')} style={styles.emptyButton} />
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
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

function ReportDatum({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reportDatum}>
      <Text style={styles.reportDatumValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.reportDatumLabel}>{label}</Text>
    </View>
  );
}

function InsightPanel({
  icon,
  eyebrow,
  title,
  insight,
  recommendation,
}: {
  icon: string;
  eyebrow: string;
  title: string;
  insight: string;
  recommendation: string;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightHead}>
        <View style={styles.insightIcon}><Feather name={icon} size={19} color={colors.gold} /></View>
        <View style={styles.insightHeadCopy}>
          <Text style={styles.insightEyebrow}>{eyebrow}</Text>
          <Text style={styles.insightTitle}>{title}</Text>
        </View>
      </View>
      <Text style={styles.insightText}>{insight}</Text>
      <View style={styles.recommendationRow}>
        <Text style={styles.recommendationLabel}>NEXT</Text>
        <Text style={styles.recommendationText}>{recommendation}</Text>
      </View>
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
            ? <MaterialCommunityIcon name={icon} size={19} color={colors.gold} />
            : <Feather name={icon} size={19} color={colors.gold} />}
        </View>
        <Text style={styles.trophyMetricValue}>{value}</Text>
      </View>
      <Text style={styles.trophyMetricLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
  );
}

function TrophyRing({ value }: { value: number }) {
  const size = 106;
  const stroke = 8;
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
        <MaterialCommunityIcon name="trophy" size={37} color={colors.gold} />
      </View>
    </View>
  );
}

function TrendLineChart({ points, forecast = [], minimumValue }: { points: SeriesPoint[]; forecast?: SeriesPoint[]; minimumValue?: number }) {
  const [width, setWidth] = useState(0);
  const height = 250;
  const padTop = 24;
  const padBottom = 30;
  const padLeft = 36;
  const padRight = 12;
  const data = points.slice(-8);
  const projected = forecast.slice(0, 4);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width <= 0 || data.length < 2) return null;
    const values = [...data, ...projected].map((point) => point.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const visualPadding = Math.max((max - min) * 0.16, 0.5);
    const chartMax = max + visualPadding;
    const chartMin = minimumValue === undefined ? Math.max(0, min - visualPadding) : Math.min(min - visualPadding, minimumValue);
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
  }, [width, data, projected, minimumValue]);

  return (
    <View style={{ height }} onLayout={onLayout}>
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
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 20 },
  reportBackButton: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  reportHeaderText: { flex: 1, minWidth: 0 },
  reportHeaderEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase', marginBottom: 1 },
  reportHeaderTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.35, color: colors.ink },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  headerCopy: { flex: 1 },
  reportCountdown: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.xs },
  reportCountdownCopy: { alignItems: 'flex-end', justifyContent: 'center' },
  reportCountdownValue: { fontSize: 15, lineHeight: 19, color: colors.ink, fontWeight: '900' },
  reportCountdownLabel: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
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
  formCard: { gap: spacing.sm },
  formIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formIntroText: { flex: 1 },
  inputGrid: { gap: spacing.xs },

  trophySection: { paddingTop: spacing.sm, paddingBottom: spacing.xl, marginBottom: spacing.sm },
  trophyMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trophyRing: { alignItems: 'center', justifyContent: 'center' },
  trophyRingCenter: { position: 'absolute', width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  trophyCopy: { flex: 1, minWidth: 0 },
  trophyLabel: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 1 },
  trophyValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trophyValue: { fontSize: 44, lineHeight: 49, fontWeight: '900', letterSpacing: -1.1, color: colors.ink },
  trophyChange: { ...typography.caption, color: colors.gold, fontWeight: '900', backgroundColor: colors.panelWarm, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  trophyChangeDown: { color: colors.error, backgroundColor: colors.errorLight },
  trophyRemaining: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.inkMuted, marginTop: 2 },
  weeklyOverview: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg, marginTop: spacing.lg },
  trophyMetricGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  trophyMetricCard: { flex: 1, minWidth: 0, minHeight: 88, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  trophyMetricValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  trophyMetricIcon: { width: 22, alignItems: 'flex-start', justifyContent: 'center' },
  trophyMetricValue: { fontSize: 22, lineHeight: 26, fontWeight: '900', color: colors.ink, letterSpacing: -0.25 },
  trophyMetricLabel: { fontSize: 11, lineHeight: 15, color: colors.inkMuted, fontWeight: '700', marginTop: 2 },
  rankingsCta: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gold, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.lg },
  rankingsIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDarker },
  rankingsCopy: { flex: 1, minWidth: 0 },
  rankingsTitle: { ...typography.bodyBold, color: colors.onPrimary },
  rankingsSubtitle: { ...typography.caption, color: colors.accentDarker, marginTop: 1 },

  reportCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel, padding: spacing.lg, marginBottom: spacing.xl },
  reportTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  reportLabel: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reportReady: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.panelWarm, paddingHorizontal: 8, paddingVertical: 5 },
  reportReadyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  reportReadyText: { fontSize: 10, lineHeight: 12, color: colors.gold, fontWeight: '800' },
  reportTitle: { fontSize: 23, lineHeight: 29, fontWeight: '900', color: colors.ink, letterSpacing: -0.25, marginTop: spacing.lg },
  reportTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden', marginTop: spacing.md },
  reportTrackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  reportFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  reportFootText: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  reportAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reportActionText: { ...typography.caption, color: colors.gold, fontWeight: '800' },

  overviewHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg },
  overviewKicker: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase' },
  overviewTitle: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  overviewValue: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5, color: colors.ink },
  overviewBar: { marginTop: spacing.md },

  reportLead: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  reportLeadMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  reportLeadKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  reportLeadStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportLeadStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.gold },
  reportLeadStatusText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  reportLeadTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7, color: colors.ink, marginTop: spacing.lg },
  reportLeadSummary: { ...typography.body, color: colors.inkMuted, lineHeight: 24, marginTop: spacing.sm, maxWidth: 520 },
  reportDataRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  reportDatum: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: spacing.xs },
  reportDatumValue: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  reportDatumLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: 3, textAlign: 'center' },
  reportDataDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: colors.borderStrong },
  reportHighlights: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
  reportSectionHead: { marginBottom: spacing.md },
  reportSectionKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  reportSectionTitle: { ...typography.title, color: colors.ink, marginTop: spacing.xs },
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

  trendCard: { gap: spacing.md, padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metricChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricChipOn: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  metricChipText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  metricChipTextOn: { color: colors.white },
  singleMetricTitle: { ...typography.subtitle, color: colors.ink },
  singleMetricStats: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
  },
  singleMetricStat: { flex: 1, minWidth: 0, justifyContent: 'center' },
  singleMetricStatRight: { alignItems: 'flex-end', paddingRight: spacing.xs },
  singleMetricStatLabel: {
    ...typography.overline,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  singleMetricChangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  singleMetricChange: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: colors.ink, letterSpacing: -0.35 },
  singleMetricChangeUnit: { ...typography.label, color: colors.inkMuted },
  trendSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  trendValue: { fontSize: 32, lineHeight: 37, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 },
  trendUnit: { ...typography.body, color: colors.inkMuted },
  trendDate: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  trendDelta: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.panelMuted, paddingHorizontal: 10, paddingVertical: 6 },
  trendDeltaText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  trendLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: -spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendActual: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.ink },
  legendForecast: { width: 18, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.gold },
  legendText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  forecastNote: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  forecastNoteCopy: { flex: 1 },
  forecastNoteTitle: { ...typography.caption, color: colors.inkSubtle, fontWeight: '600', textAlign: 'center' },
  forecastEmpty: { ...typography.caption, color: colors.inkSubtle, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, lineHeight: 18 },
  trendFirstLog: { minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  trendFirstLogText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  trendLogAction: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },

  emptyMeasure: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.subtitle, color: colors.ink },
  emptyText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: spacing.md },
  emptyButton: { alignSelf: 'stretch', marginTop: spacing.sm },

  cardTitle: { ...typography.subtitle, color: colors.ink },
  cardSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
