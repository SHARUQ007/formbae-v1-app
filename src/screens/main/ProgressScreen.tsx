import { useEffect, useMemo, useState } from 'react';
import { Alert, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line as SvgLine, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Card, ScreenContainer, ScreenTitle, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { loadProgressBundleCached } from '../../services/preloadService';
import { logProgress } from '../../services/progressService';
import type { ProgressSummary } from '../../types/api';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { MainTabParamList } from '../../navigation/types';
import { deriveCurrentWeekStreak } from '../../utils/weeklyMuscles';

type Loaded = {
  progress: ProgressSummary;
};
type LogMode = 'body';

const GOLD = '#f5b301';

type MetricKey = 'weight' | 'waist' | 'chest' | 'biceps';
const METRICS: Array<{ key: MetricKey; label: string; unit: string; icon: string }> = [
  { key: 'weight', label: 'Weight', unit: 'kg', icon: 'trending-up' },
  { key: 'waist', label: 'Waist', unit: 'cm', icon: 'minimize-2' },
  { key: 'chest', label: 'Chest', unit: 'cm', icon: 'maximize-2' },
  { key: 'biceps', label: 'Biceps', unit: 'cm', icon: 'activity' },
];

type SeriesPoint = { date: string; value: number };

type Props = BottomTabScreenProps<MainTabParamList, 'Progress'>;

export function ProgressScreen({ route, navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { data, loading, error, reload, refresh, refreshing } = useAsync<Loaded>((mode) =>
    loadProgressBundleCached({ force: mode === 'refresh' }),
  );

  const [weight, setWeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');

  useEffect(() => {
    const action = route.params?.action;
    if (!action) return;
    if (action === 'logBody') setLogMode('body');
    if (action === 'overview') refresh().catch(() => undefined);
    navigation.setParams({ action: undefined, requestId: undefined });
  }, [navigation, refresh, route.params?.action, route.params?.requestId]);

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
      await logProgress({ weight, chest, waist, biceps });
      setWeight('');
      setChest('');
      setWaist('');
      setBiceps('');
      await loadProgressBundleCached({ force: true });
      await reload();
      setLogMode(null);
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
  const coachingSignals = reviewStats.workoutFeedbackCount + reviewStats.checkInCount + reviewStats.bodyLogCount;
  const nextReviewDays = review?.nextInDays ?? 7;
  const nextFocusDomain = review?.nextFocusDomain ?? 'workout';
  const nextFocusCta = nextFocusDomain === 'diet'
    ? 'Log your next meal'
    : nextFocusDomain === 'body'
      ? 'Add a body update'
      : 'Open your workout plan';

  const measuredMetrics = METRICS.filter((metric) => series[metric.key].length > 0);
  const chartableMetrics = METRICS.filter((metric) => series[metric.key].length > 1);
  const lastLogged = trend[trend.length - 1]?.date;
  const activeMetric = chartableMetrics.find((metric) => metric.key === selectedMetric) || chartableMetrics[0];
  const activeSeries = activeMetric ? series[activeMetric.key] : [];
  const activeDelta = seriesDelta(activeSeries);

  const openNextFocus = () => {
    if (nextFocusDomain === 'diet') {
      navigation.navigate('Diet');
      return;
    }
    if (nextFocusDomain === 'body') {
      setLogMode('body');
      return;
    }
    navigation.navigate('Workouts', { screen: 'WorkoutList' });
  };

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
          <View>
            <Text style={styles.eyebrow}>Weekly coaching</Text>
            <ScreenTitle>Progress</ScreenTitle>
          </View>
          <View style={styles.reviewCountdown} accessibilityLabel={`Next AI feedback in ${nextReviewDays} days`}>
            <Feather name="clock" size={16} color={colors.gold} />
            <View>
              <Text style={styles.reviewCountdownValue}>{nextReviewDays}d</Text>
              <Text style={styles.reviewCountdownLabel}>next review</Text>
            </View>
          </View>
        </View>

        <Card style={styles.reviewHero}>
          <View style={styles.reviewHeroTop}>
            <View style={styles.aiMark}>
              <Feather name="zap" size={20} color={colors.gold} />
            </View>
            <View style={styles.reviewHeroLabelCopy}>
              <Text style={styles.reviewHeroKicker}>Ava AI · weekly review</Text>
              <Text style={styles.reviewHeroMeta}>
                {reviewReady && review?.generatedAt ? `Generated ${formatShortDate(review.generatedAt)}` : `Ready in ${nextReviewDays} day${nextReviewDays === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={[styles.reviewStatus, reviewReady && styles.reviewStatusReady]}>
              <View style={[styles.reviewStatusDot, reviewReady && styles.reviewStatusDotReady]} />
              <Text style={styles.reviewStatusText}>{reviewReady ? 'Ready' : 'Learning'}</Text>
            </View>
          </View>

          <Text style={styles.reviewHeadline}>
            {reviewReady ? review?.headline : 'Your weekly picture is taking shape.'}
          </Text>
          <Text style={styles.reviewSummary}>
            {reviewReady
              ? review?.summary
              : 'Keep completing workouts and logging meals. Ava will connect those signals into your first personal review.'}
          </Text>

          {reviewReady && review?.wins?.length ? (
            <View style={styles.winList}>
              {review.wins.slice(0, 3).map((win) => (
                <View key={win} style={styles.winRow}>
                  <View style={styles.winCheck}><Feather name="check" size={13} color={colors.onPrimary} /></View>
                  <Text style={styles.winText}>{win}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.reviewEvidence}>
            <Feather name="database" size={14} color={colors.inkMuted} />
            <Text style={styles.reviewEvidenceText}>
              Built from {reviewStats.workoutsCompleted} workout{reviewStats.workoutsCompleted === 1 ? '' : 's'}, {reviewStats.mealsLogged} food log{reviewStats.mealsLogged === 1 ? '' : 's'}, and {coachingSignals} coach signal{coachingSignals === 1 ? '' : 's'}.
            </Text>
          </View>
        </Card>

        <SectionTitle>This week</SectionTitle>
        <View style={styles.weeklyStatGrid}>
          <WeeklyStat icon="activity" value={`${reviewStats.workoutsCompleted}/${reviewStats.workoutsPlanned || 0}`} label="Workouts" />
          <WeeklyStat icon="book-open" value={`${reviewStats.mealsLogged}`} label="Food logs" />
          <WeeklyStat icon="zap" value={`${weeklyStreak}`} label="Week streak" />
          <WeeklyStat icon="message-circle" value={`${coachingSignals}`} label="Coach signals" />
        </View>

        <Card style={styles.consistencyCard}>
          <AdherenceRing pct={adherence} size={112} stroke={10} />
          <View style={styles.consistencyInfo}>
            <Text style={styles.consistencyEyebrow}>Follow-through</Text>
            <Text style={styles.consistencyTitle}>{adherence}% workout consistency</Text>
            <View style={styles.consistencyBar}><ProgressBar value={completionRate} /></View>
            <Text style={styles.consistencyFact}>
              {reviewStats.dietDaysLogged} nutrition day{reviewStats.dietDaysLogged === 1 ? '' : 's'} logged · Best workout streak {progress.bestStreak} days
            </Text>
          </View>
        </Card>

        {reviewReady ? (
          <>
            <SectionTitle>What Ava noticed</SectionTitle>
            <View style={styles.insightStack}>
              <InsightPanel
                icon="activity"
                eyebrow="Workout feedback"
                title="Training pattern"
                insight={review?.workoutInsight || ''}
                recommendation={review?.workoutRecommendation || ''}
              />
              <InsightPanel
                icon="coffee"
                eyebrow="Diet feedback"
                title="Nutrition pattern"
                insight={review?.nutritionInsight || ''}
                recommendation={review?.nutritionRecommendation || ''}
              />
            </View>

            <Card style={styles.nextFocusCard}>
              <View style={styles.nextFocusTop}>
                <View style={styles.nextFocusIcon}><Feather name="arrow-up-right" size={20} color={colors.onPrimary} /></View>
                <View style={styles.nextFocusCopy}>
                  <Text style={styles.nextFocusEyebrow}>Your next best move</Text>
                  <Text style={styles.nextFocusTitle}>{review?.nextFocusTitle}</Text>
                </View>
              </View>
              <Text style={styles.nextFocusReason}>{review?.nextFocusReason}</Text>
              <PrimaryButton title={nextFocusCta} icon="arrow-right" onPress={openNextFocus} variant="inverted" style={styles.nextFocusButton} />
              {nextFocusDomain !== 'body' ? (
                <TouchableOpacity onPress={() => setLogMode('body')} style={styles.bodyInvestment} accessibilityRole="button" accessibilityLabel="Add a body update">
                  <Feather name="plus" size={16} color={colors.gold} />
                  <Text style={styles.bodyInvestmentText}>Add a body update for a richer next review</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          </>
        ) : (
          <Card style={styles.unlockCard}>
            <Text style={styles.unlockEyebrow}>Building your first review</Text>
            <Text style={styles.unlockTitle}>Three signals make it more useful</Text>
            <View style={styles.unlockSignals}>
              <SignalRow icon="activity" label="Complete a workout" value={reviewStats.workoutsCompleted > 0 ? 'Added' : 'Waiting'} complete={reviewStats.workoutsCompleted > 0} />
              <SignalRow icon="book-open" label="Log meals honestly" value={`${reviewStats.mealsLogged} added`} complete={reviewStats.mealsLogged > 0} />
              <SignalRow icon="message-circle" label="Share workout feedback" value={reviewStats.workoutFeedbackCount > 0 ? 'Added' : 'Optional'} complete={reviewStats.workoutFeedbackCount > 0} />
            </View>
          </Card>
        )}

        <View style={styles.sectionRow}>
          <SectionTitle style={styles.sectionRowTitle}>Body measurements</SectionTitle>
          <TouchableOpacity onPress={() => setLogMode('body')} style={styles.logChip} accessibilityRole="button" accessibilityLabel="Log body measurements">
            <Feather name="plus" size={14} color={colors.onPrimary} />
            <Text style={styles.logChipText}>Log</Text>
          </TouchableOpacity>
        </View>

        {measuredMetrics.length ? (
          <>
            <Card style={styles.measureCard}>
              {lastLogged ? <Text style={styles.measureMeta}>Last logged {formatDate(lastLogged)}</Text> : null}
              <View style={styles.measureGrid}>
                {measuredMetrics.map((metric) => {
                  const points = series[metric.key];
                  const latest = points[points.length - 1];
                  const delta = seriesDelta(points);
                  return (
                    <MeasureTile
                      key={metric.key}
                      icon={metric.icon}
                      label={metric.label}
                      value={`${trimNumber(latest.value)}`}
                      unit={metric.unit}
                      delta={delta}
                    />
                  );
                })}
              </View>
            </Card>

            {activeMetric ? (
              <>
                <SectionTitle>Body trend</SectionTitle>
                <Card style={styles.trendCard}>
                  <View style={styles.metricChips}>
                    {chartableMetrics.map((metric) => {
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
                  <View style={styles.trendHead}>
                    <View>
                      <Text style={styles.trendMetricLabel}>{activeMetric.label}</Text>
                      <Text style={styles.trendMetricValue}>
                        {trimNumber(activeSeries[activeSeries.length - 1].value)}
                        <Text style={styles.trendMetricUnit}> {activeMetric.unit}</Text>
                      </Text>
                    </View>
                    {activeDelta ? (
                      <View style={styles.trendDeltaChip}>
                        <Feather name={deltaIcon(activeDelta.dir)} size={13} color={colors.inkMuted} />
                        <Text style={styles.trendDeltaText}>
                          {activeDelta.text} {activeMetric.unit} since {formatShortDate(activeSeries[0].date)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TrendLineChart points={activeSeries} />
                </Card>
              </>
            ) : null}
          </>
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
  if (dir === 'down') return 'arrow-down-right';
  if (dir === 'up') return 'arrow-up-right';
  return 'minus';
}

function WeeklyStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.weeklyStat}>
      <View style={styles.weeklyStatIcon}><Feather name={icon} size={16} color={colors.gold} /></View>
      <Text style={styles.weeklyStatValue}>{value}</Text>
      <Text style={styles.weeklyStatLabel}>{label}</Text>
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
    <Card style={styles.insightCard}>
      <View style={styles.insightHead}>
        <View style={styles.insightIcon}><Feather name={icon} size={19} color={colors.gold} /></View>
        <View style={styles.insightHeadCopy}>
          <Text style={styles.insightEyebrow}>{eyebrow}</Text>
          <Text style={styles.insightTitle}>{title}</Text>
        </View>
      </View>
      <Text style={styles.insightText}>{insight}</Text>
      <View style={styles.recommendationRow}>
        <Feather name="arrow-right" size={16} color={colors.gold} />
        <Text style={styles.recommendationText}>{recommendation}</Text>
      </View>
    </Card>
  );
}

function SignalRow({ icon, label, value, complete }: { icon: string; label: string; value: string; complete: boolean }) {
  return (
    <View style={styles.signalRow}>
      <View style={[styles.signalIcon, complete && styles.signalIconComplete]}>
        <Feather name={complete ? 'check' : icon} size={15} color={complete ? colors.onPrimary : colors.inkMuted} />
      </View>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={[styles.signalValue, complete && styles.signalValueComplete]}>{value}</Text>
    </View>
  );
}

function MeasureTile({ icon, label, value, unit, delta }: { icon: string; label: string; value: string; unit: string; delta: Delta | null }) {
  return (
    <View style={styles.measureTile}>
      <View style={styles.measureTileTop}>
        <Feather name={icon} size={15} color={colors.inkMuted} />
        {delta ? (
          <View style={styles.measureDelta}>
            <Feather name={deltaIcon(delta.dir)} size={11} color={colors.inkMuted} />
            <Text style={styles.measureDeltaText}>{delta.text}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.measureValue}>
        {value}
        <Text style={styles.measureUnit}> {unit}</Text>
      </Text>
      <Text style={styles.measureLabel}>{label}</Text>
    </View>
  );
}

function AdherenceRing({ pct, size = 128, stroke = 12 }: { pct: number; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;
  const center = size / 2;
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.ink}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{Math.round(clamped)}%</Text>
        <Text style={styles.ringLabel}>adherence</Text>
      </View>
    </View>
  );
}

function TrendLineChart({ points }: { points: SeriesPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 156;
  const padTop = 16;
  const padBottom = 26;
  const padX = 12;
  const data = points.slice(-8);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width <= 0 || data.length < 2) return null;
    const values = data.map((point) => point.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = Math.max(max - min, 1);
    const innerW = Math.max(width - padX * 2, 1);
    const innerH = height - padTop - padBottom;
    const xAt = (i: number) => padX + (i / (data.length - 1)) * innerW;
    const yAt = (v: number) => padTop + (1 - (v - min) / range) * innerH;
    const line = data.map((point, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ');
    const baseY = height - padBottom;
    const area = `${line} L ${xAt(data.length - 1).toFixed(1)} ${baseY} L ${xAt(0).toFixed(1)} ${baseY} Z`;
    const lastIndex = data.length - 1;
    return { xAt, yAt, line, area, baseY, lastIndex };
  }, [width, data]);

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
          <SvgLine x1={padX} y1={geometry.baseY} x2={width - padX} y2={geometry.baseY} stroke={colors.border} strokeWidth={1} />
          <Path d={geometry.area} fill="url(#trendArea)" />
          <Path d={geometry.line} stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={geometry.xAt(geometry.lastIndex)} cy={geometry.yAt(data[geometry.lastIndex].value)} r={6} fill={colors.white} />
          <Circle cx={geometry.xAt(geometry.lastIndex)} cy={geometry.yAt(data[geometry.lastIndex].value)} r={4} fill={GOLD} />
          <SvgText x={padX} y={height - 8} fontSize={11} fill={colors.inkSubtle} textAnchor="start">
            {formatShortDate(data[0].date)}
          </SvgText>
          <SvgText x={width - padX} y={height - 8} fontSize={11} fill={colors.inkSubtle} textAnchor="end">
            {formatShortDate(data[geometry.lastIndex].date)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  reviewCountdown: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderStrong,
    paddingLeft: spacing.md,
    marginBottom: spacing.xs,
  },
  reviewCountdownValue: { fontSize: 18, lineHeight: 20, fontWeight: '900', color: colors.ink },
  reviewCountdownLabel: { fontSize: 10, lineHeight: 12, color: colors.inkMuted, fontWeight: '700' },
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

  reviewHero: { backgroundColor: colors.panelWarm, borderColor: colors.accentSurface, gap: spacing.md },
  reviewHeroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiMark: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  reviewHeroLabelCopy: { flex: 1, minWidth: 0 },
  reviewHeroKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  reviewHeroMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  reviewStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  reviewStatusReady: { borderColor: colors.accentSurface, backgroundColor: colors.accentLight },
  reviewStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.inkSubtle },
  reviewStatusDotReady: { backgroundColor: colors.gold },
  reviewStatusText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: colors.inkMuted },
  reviewHeadline: { fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.4, color: colors.ink },
  reviewSummary: { ...typography.body, color: colors.inkMuted, lineHeight: 23 },
  winList: { gap: spacing.xs },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  winCheck: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  winText: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reviewEvidence: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.accentSurface, paddingTop: spacing.sm },
  reviewEvidenceText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, flex: 1 },

  weeklyStatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weeklyStat: { width: '47.5%', flexGrow: 1, minHeight: 112, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  weeklyStatIcon: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  weeklyStatValue: { fontSize: 27, lineHeight: 32, fontWeight: '900', color: colors.ink, marginTop: spacing.sm },
  weeklyStatLabel: { ...typography.caption, color: colors.inkMuted },

  consistencyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  consistencyInfo: { flex: 1 },
  consistencyEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  consistencyTitle: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  consistencyBar: { marginTop: spacing.sm },
  consistencyFact: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 17 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPct: { ...typography.title, color: colors.ink, fontWeight: '900' },
  ringLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },

  insightStack: { gap: spacing.sm },
  insightCard: { gap: spacing.sm, backgroundColor: colors.panel, borderColor: colors.borderStrong },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  insightIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  insightHeadCopy: { flex: 1, minWidth: 0 },
  insightEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  insightTitle: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  insightText: { ...typography.body, color: colors.inkMuted, lineHeight: 23 },
  recommendationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
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

  unlockCard: { gap: spacing.sm, backgroundColor: colors.panel, borderColor: colors.borderStrong },
  unlockEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  unlockTitle: { ...typography.title, color: colors.ink },
  unlockSignals: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs },
  signalRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  signalIcon: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center' },
  signalIconComplete: { backgroundColor: colors.goldMuted },
  signalLabel: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  signalValue: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  signalValueComplete: { color: colors.gold },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionRowTitle: { flex: 1 },
  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryAction,
  },
  logChipText: { ...typography.caption, color: colors.onPrimary, fontWeight: '800' },

  measureCard: { gap: spacing.sm, padding: 0, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  measureMeta: { ...typography.caption, color: colors.inkSubtle },
  measureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  measureTile: {
    width: '47.6%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  measureTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  measureDelta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  measureDeltaText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  measureValue: { ...typography.title, color: colors.ink, marginTop: spacing.sm },
  measureUnit: { ...typography.caption, color: colors.inkMuted },
  measureLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

  trendCard: { gap: spacing.md },
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
  trendHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  trendMetricLabel: { ...typography.caption, color: colors.inkMuted },
  trendMetricValue: { ...typography.title, color: colors.ink, marginTop: 2 },
  trendMetricUnit: { ...typography.caption, color: colors.inkMuted },
  trendDeltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trendDeltaText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },

  emptyMeasure: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
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
