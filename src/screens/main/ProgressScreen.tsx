import { useMemo, useState } from 'react';
import { Alert, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
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

type Loaded = { progress: ProgressSummary };
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

export function ProgressScreen() {
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
  const reward = rewardMessage(progress);

  const measuredMetrics = METRICS.filter((metric) => series[metric.key].length > 0);
  const chartableMetrics = METRICS.filter((metric) => series[metric.key].length > 1);
  const lastLogged = trend[trend.length - 1]?.date;
  const activeMetric = chartableMetrics.find((metric) => metric.key === selectedMetric) || chartableMetrics[0];
  const activeSeries = activeMetric ? series[activeMetric.key] : [];
  const activeDelta = seriesDelta(activeSeries);

  if (logMode) {
    return (
      <KeyboardScreen>
        <ScreenContainer>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Progress</Text>
            <ScreenTitle>Momentum</ScreenTitle>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="award" size={20} color={colors.accentDark} />
          </View>
        </View>

        {/* Streak hero — the emotional anchor */}
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroFlame}>
              <MaterialCommunityIcon name="fire" size={30} color={GOLD} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>{reward.kicker}</Text>
              <View style={styles.heroStreakRow}>
                <Text style={styles.heroStreakValue}>{progress.currentStreak}</Text>
                <Text style={styles.heroStreakUnit}>day streak</Text>
              </View>
            </View>
            <View style={styles.heroBestPill}>
              <Feather name="award" size={13} color={GOLD} />
              <Text style={styles.heroBestText}>Best {progress.bestStreak}d</Text>
            </View>
          </View>
          <Text style={styles.heroSub}>{reward.subtitle}</Text>
        </Card>

        {/* Consistency — adherence ring is the headline viz */}
        <SectionTitle>Workout consistency</SectionTitle>
        <Card style={styles.consistencyCard}>
          <AdherenceRing pct={adherence} />
          <View style={styles.consistencyInfo}>
            <Text style={styles.consistencyValue}>
              {progress.completed}
              <Text style={styles.consistencyValueMuted}> / {progress.planned || 0}</Text>
            </Text>
            <Text style={styles.consistencyLabel}>workouts completed</Text>
            <View style={styles.consistencyBar}>
              <ProgressBar value={completionRate} />
            </View>
            <Text style={styles.consistencyFact}>
              {progress.currentStreak > 0
                ? 'Consistency compounds — one more session keeps the chain alive.'
                : 'Log one session to start building your streak.'}
            </Text>
          </View>
        </Card>

        {/* Body measurements snapshot */}
        <View style={styles.sectionRow}>
          <SectionTitle style={styles.sectionRowTitle}>Body measurements</SectionTitle>
          <TouchableOpacity onPress={() => setLogMode('body')} style={styles.logChip} accessibilityRole="button" accessibilityLabel="Log body measurements">
            <Feather name="plus" size={14} color={colors.white} />
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

function rewardMessage(progress: ProgressSummary) {
  if (progress.currentStreak >= 7) {
    return {
      kicker: 'Streak building',
      subtitle: 'You are building the consistency that changes outcomes. Keep the chain alive.',
    };
  }
  if (progress.completed > 0) {
    return {
      kicker: 'Momentum started',
      subtitle: 'Every completed session makes the next one easier to show up for.',
    };
  }
  return {
    kicker: 'Fresh start',
    subtitle: 'Complete a workout or add a body log to start tracking your progress.',
  };
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
  scroll: { paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  headerBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  hero: { backgroundColor: colors.accentDarker, borderColor: colors.accentDark },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroFlame: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: 'rgba(245,179,1,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,1,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroKicker: { ...typography.overline, color: GOLD, textTransform: 'uppercase' },
  heroStreakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  heroStreakValue: { ...typography.hero, color: colors.white },
  heroStreakUnit: { ...typography.body, color: colors.onAccentMuted },
  heroBestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBestText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  heroSub: { ...typography.caption, color: colors.onAccentMuted, marginTop: spacing.md, lineHeight: 19 },

  consistencyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  consistencyInfo: { flex: 1 },
  consistencyValue: { ...typography.hero, color: colors.ink },
  consistencyValueMuted: { ...typography.title, color: colors.inkSubtle },
  consistencyLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },
  consistencyBar: { marginTop: spacing.sm },
  consistencyFact: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 17 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPct: { ...typography.title, color: colors.ink, fontWeight: '900' },
  ringLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionRowTitle: { flex: 1 },
  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  logChipText: { ...typography.caption, color: colors.white, fontWeight: '800' },

  measureCard: { gap: spacing.sm },
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
  metricChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
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
