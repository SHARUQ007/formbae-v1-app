import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { Badge } from '../../components/Badge';
import { Card, ScreenContainer, ScreenTitle, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { submitCheckIn } from '../../services/checkInService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { loadProgressBundleCached } from '../../services/preloadService';
import { logProgress } from '../../services/progressService';
import type { CheckIn, ProgressSummary } from '../../types/api';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Loaded = { progress: ProgressSummary; checkIns: CheckIn[]; dueThisWeek: boolean };

const ENERGY_OPTIONS = ['4', '6', '8', '10'];
const DIFFICULTY_OPTIONS = ['3', '5', '7', '9'];
const COMPLETION_OPTIONS = ['1 of 5', '3 of 5', '4 of 5', '5 of 5'];

export function ProgressScreen() {
  const { data, loading, error, reload, refresh, refreshing } = useAsync<Loaded>((mode) =>
    loadProgressBundleCached({ force: mode === 'refresh' }),
  );

  const [weight, setWeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');
  const [energy, setEnergy] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [completion, setCompletion] = useState('');
  const [notes, setNotes] = useState('');
  const [savingBody, setSavingBody] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);

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
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingBody(false);
    }
  };

  const onCheckIn = async () => {
    if (!weight && !energy && !notes) {
      Alert.alert('Add some detail', 'Share at least your weight, energy, or a note for your trainer.');
      return;
    }
    setSavingCheckIn(true);
    try {
      await submitCheckIn({ weight, energyLevel: energy, difficultyLevel: difficulty, workoutCompletion: completion, notes });
      setNotes('');
      setEnergy('');
      setDifficulty('');
      setCompletion('');
      await loadProgressBundleCached({ force: true });
      await reload();
      displayBehavioralNotification('checkInSubmitted').catch(() => undefined);
      Alert.alert('Check-in sent', 'Your trainer will review your weekly check-in.');
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingCheckIn(false);
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

  const { progress, checkIns, dueThisWeek } = data;
  const trend = progress.bodyTrend ?? [];
  const latest = trend[trend.length - 1];
  const first = trend[0];
  const recentCheckIns = checkIns.slice(0, 4);
  const avgEnergy = averageMetric(checkIns, 'energyLevel');
  const avgDifficulty = averageMetric(checkIns, 'difficultyLevel');
  const latestCompletion = checkIns.find((entry) => entry.workoutCompletion)?.workoutCompletion || '';
  const weightDelta = latest?.weight && first?.weight ? latest.weight - first.weight : 0;
  const waistDelta = latest?.waist && first?.waist ? latest.waist - first.waist : 0;
  const completionRate = progress.planned ? progress.completed / progress.planned : 0;
  const reward = rewardMessage(progress);
  const progressPoints = progress.completed * 25 + progress.currentStreak * 10;

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Progress</Text>
              <ScreenTitle>Your wins</ScreenTitle>
            </View>
            <View style={styles.headerBadge}>
              <Feather name="award" size={20} color={colors.accentDark} />
            </View>
          </View>

          <Card style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Feather name={reward.icon} size={28} color={colors.white} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>{reward.kicker}</Text>
                <Text style={styles.heroTitle}>{reward.title}</Text>
                <Text style={styles.heroSub}>{reward.subtitle}</Text>
              </View>
            </View>
            <View style={styles.heroStats}>
              <HeroMetric icon="target" label="Adherence" value={`${progress.adherencePct}%`} />
              <HeroMetric icon="zap" label="Streak" value={`${progress.currentStreak}d`} />
              <HeroMetric icon="check-circle" label="Done" value={`${progress.completed}/${progress.planned}`} />
            </View>
          </Card>

          {dueThisWeek ? (
            <Card variant="accent" style={styles.nextAction}>
              <View style={styles.nextActionTop}>
                <Badge label="Due this week" tone="warn" icon="clock" />
                <Text style={styles.nextActionTitle}>Send a quick check-in</Text>
              </View>
              <Text style={styles.nextActionText}>A short update helps your trainer adjust pace, recovery and the next workout block.</Text>
            </Card>
          ) : (
            <Card variant="accent" style={styles.nextAction}>
              <View style={styles.nextActionTop}>
                <Badge label="On track" tone="success" icon="check" />
                <Text style={styles.nextActionTitle}>Keep the streak alive</Text>
              </View>
              <Text style={styles.nextActionText}>Log workouts and body changes when something meaningful changes.</Text>
            </Card>
          )}

          <SectionTitle>Snapshot</SectionTitle>
          <View style={styles.snapshotGrid}>
            <RewardTile icon="zap" label="Points" value={`${progressPoints}`} helper="Workout + streak score" />
            <RewardTile icon="award" label="Best streak" value={`${progress.bestStreak}d`} helper="Longest run" />
            <RewardTile icon="activity" label="Completion" value={`${Math.round(completionRate * 100)}%`} helper={`${progress.completed} workouts logged`} />
            <RewardTile icon="battery-charging" label="Energy avg" value={avgEnergy ? `${avgEnergy}/10` : '-'} helper="From check-ins" />
            <RewardTile icon="trending-up" label="Difficulty" value={avgDifficulty ? `${avgDifficulty}/10` : '-'} helper={latestCompletion || 'Latest weekly feel'} />
          </View>

          {trend.length > 1 ? (
            <>
              <SectionTitle>Body trend</SectionTitle>
              <Card style={styles.trendCard}>
                <View style={styles.trendSummary}>
                  <TrendDelta label="Weight" value={formatDelta(weightDelta, 'kg')} positive={weightDelta <= 0} />
                  <TrendDelta label="Waist" value={formatDelta(waistDelta, 'cm')} positive={waistDelta <= 0} />
                </View>
                <MetricTrend title="Weight" unit="kg" values={trend.map((point) => ({ date: point.date, value: point.weight }))} color={colors.accent} />
                <MetricTrend title="Waist" unit="cm" values={trend.map((point) => ({ date: point.date, value: point.waist || 0 }))} color={colors.warn} />
              </Card>
            </>
          ) : null}

          <SectionTitle>Weekly check-in</SectionTitle>
          <Card style={styles.checkInCard}>
            <Text style={styles.cardTitle}>How are you feeling?</Text>
            <Text style={styles.cardSub}>Tap quick values or type exact numbers.</Text>
            <OptionGroup label="Energy" value={energy} options={ENERGY_OPTIONS} onSelect={setEnergy} suffix="/10" />
            <FormInput value={energy} onChangeText={setEnergy} placeholder="Energy (1-10)" keyboardType="numeric" maxLength={2} />
            <OptionGroup label="Difficulty" value={difficulty} options={DIFFICULTY_OPTIONS} onSelect={setDifficulty} suffix="/10" />
            <FormInput value={difficulty} onChangeText={setDifficulty} placeholder="Difficulty (1-10)" keyboardType="numeric" maxLength={2} />
            <OptionGroup label="Workouts completed" value={completion} options={COMPLETION_OPTIONS} onSelect={setCompletion} />
            <FormInput value={completion} onChangeText={setCompletion} placeholder="e.g. 4 of 5" />
            <FormInput value={notes} onChangeText={setNotes} placeholder="What should your trainer know?" multiline autoCapitalize="sentences" />
            <PrimaryButton title="Send check-in" icon="send" onPress={onCheckIn} loading={savingCheckIn} />
          </Card>

          <SectionTitle>Body log</SectionTitle>
          <Card>
            <View style={styles.latestBodyRow}>
              <View>
                <Text style={styles.cardTitle}>{latest?.weight ? `${latest.weight} kg` : 'No body log yet'}</Text>
                <Text style={styles.cardSub}>
                  {latest ? `Last logged ${formatDate(latest.date)}` : 'Add your first body measurement.'}
                </Text>
              </View>
              <View style={styles.measureIcon}>
                <Feather name="edit-3" size={18} color={colors.accentDark} />
              </View>
            </View>
            <View style={styles.inputGrid}>
              <FormInput icon="trending-up" value={weight} onChangeText={setWeight} placeholder="Weight (kg)" keyboardType="numeric" />
              <FormInput icon="maximize-2" value={chest} onChangeText={setChest} placeholder="Chest (cm)" keyboardType="numeric" />
              <FormInput icon="minimize-2" value={waist} onChangeText={setWaist} placeholder="Waist (cm)" keyboardType="numeric" />
              <FormInput icon="activity" value={biceps} onChangeText={setBiceps} placeholder="Biceps (cm)" keyboardType="numeric" />
            </View>
            <PrimaryButton title="Save body log" icon="plus" onPress={onLogBody} loading={savingBody} variant="secondary" />
          </Card>

          {checkIns.length > 0 ? <SectionTitle>Recent updates</SectionTitle> : null}
          <View style={styles.history}>
            {recentCheckIns.map((c) => (
              <Card key={c.checkInId} variant="flat" style={styles.historyCard}>
                <View style={styles.historyHead}>
                  <View>
                    <Text style={styles.historyDate}>{formatDate(c.date)}</Text>
                    <Text style={styles.historyLabel}>Trainer check-in</Text>
                  </View>
                  {c.workoutCompletion ? <Badge label={c.workoutCompletion} tone="accent" /> : null}
                </View>
                <View style={styles.historyMetrics}>
                  {c.weight ? <Text style={styles.historyChip}>{c.weight} kg</Text> : null}
                  {c.energyLevel ? <Text style={styles.historyChip}>Energy {c.energyLevel}/10</Text> : null}
                  {c.difficultyLevel ? <Text style={styles.historyChip}>Difficulty {c.difficultyLevel}/10</Text> : null}
                </View>
                {c.notes ? <Text style={styles.historyText}>{c.notes}</Text> : null}
              </Card>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

function averageMetric(checkIns: CheckIn[], key: 'energyLevel' | 'difficultyLevel') {
  const values = checkIns.map((entry) => Number(entry[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function formatDelta(value: number, unit: string) {
  if (!Number.isFinite(value) || value === 0) return `0 ${unit}`;
  return `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10} ${unit}`;
}

function rewardMessage(progress: ProgressSummary) {
  if (progress.currentStreak >= 7) {
    return {
      icon: 'zap',
      kicker: 'Streak building',
      title: `${progress.currentStreak} days strong`,
      subtitle: 'You are building the consistency that changes outcomes.',
    };
  }
  if (progress.adherencePct >= 80) {
    return {
      icon: 'award',
      kicker: 'Excellent adherence',
      title: `${progress.adherencePct}% on plan`,
      subtitle: 'Your training rhythm is in a strong place.',
    };
  }
  if (progress.completed > 0) {
    return {
      icon: 'trending-up',
      kicker: 'Momentum started',
      title: `${progress.completed} workouts logged`,
      subtitle: 'Every completed session makes the next one easier to show up for.',
    };
  }
  return {
    icon: 'target',
    kicker: 'Fresh start',
    title: 'Your first win is waiting',
    subtitle: 'Complete a workout or send a check-in to start tracking progress.',
  };
}

function HeroMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.heroMetric}>
      <Feather name={icon} size={16} color={colors.accentDark} />
      <View>
        <Text style={styles.heroMetricLabel}>{label}</Text>
        <Text style={styles.heroMetricValue}>{value}</Text>
      </View>
    </View>
  );
}

function RewardTile({ icon, label, value, helper }: { icon: string; label: string; value: string; helper: string }) {
  return (
    <View style={styles.rewardTile}>
      <View style={styles.rewardIcon}>
        <Feather name={icon} size={17} color={colors.accentDark} />
      </View>
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
      <Text style={styles.rewardHelper}>{helper}</Text>
    </View>
  );
}

function TrendDelta({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <View style={[styles.trendDelta, positive ? styles.trendDeltaGood : styles.trendDeltaNeutral]}>
      <Text style={styles.trendDeltaLabel}>{label}</Text>
      <Text style={styles.trendDeltaValue}>{value}</Text>
    </View>
  );
}

function OptionGroup({
  label,
  value,
  options,
  suffix = '',
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  suffix?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity key={option} style={[styles.optionChip, selected && styles.optionChipSelected]} onPress={() => onSelect(option)}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}{suffix}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MetricTrend({
  title,
  unit,
  values,
  color,
}: {
  title: string;
  unit: string;
  values: Array<{ date: string; value: number }>;
  color: string;
}) {
  const usable = useMemo(() => values.filter((point) => Number.isFinite(point.value) && point.value > 0).slice(-8), [values]);
  if (usable.length < 2) return null;
  const max = Math.max(...usable.map((point) => point.value));
  const min = Math.min(...usable.map((point) => point.value));
  const range = Math.max(max - min, 1);
  const latest = usable[usable.length - 1];

  return (
    <View style={styles.metricTrend}>
      <View style={styles.metricHead}>
        <Text style={styles.metricTitle}>{title}</Text>
        <Text style={styles.metricLatest}>{latest.value} {unit}</Text>
      </View>
      <View style={styles.chart}>
        {usable.map((point, idx) => {
          const heightPct = 28 + ((point.value - min) / range) * 68;
          return (
            <View key={`${title}_${point.date}_${idx}`} style={styles.chartCol}>
              <View style={[styles.bar, { height: `${heightPct}%`, backgroundColor: color }]} />
              <Text style={styles.barLabel}>{point.value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
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
  hero: { backgroundColor: colors.accentDarker, borderColor: colors.accentDark },
  heroTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroKicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  heroTitle: { ...typography.title, color: colors.white, marginTop: 4 },
  heroSub: { ...typography.caption, color: colors.onAccentMuted, marginTop: 4 },
  heroStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  heroMetric: {
    flex: 1,
    minHeight: 74,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    padding: spacing.sm,
    justifyContent: 'center',
    gap: 6,
  },
  heroMetricLabel: { ...typography.caption, color: colors.inkMuted },
  heroMetricValue: { ...typography.subtitle, color: colors.ink },
  nextAction: { marginTop: spacing.md },
  nextActionTop: { gap: spacing.sm },
  nextActionTitle: { ...typography.subtitle, color: colors.ink, marginTop: spacing.xs },
  nextActionText: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  snapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rewardTile: {
    width: '48%',
    minHeight: 142,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  rewardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rewardValue: { ...typography.title, color: colors.ink },
  rewardLabel: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  rewardHelper: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  trendCard: { gap: spacing.md },
  trendSummary: { flexDirection: 'row', gap: spacing.sm },
  trendDelta: { flex: 1, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1 },
  trendDeltaGood: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  trendDeltaNeutral: { backgroundColor: colors.panelMuted, borderColor: colors.border },
  trendDeltaLabel: { ...typography.caption, color: colors.inkMuted },
  trendDeltaValue: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  metricTrend: { marginTop: spacing.xs },
  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  metricTitle: { ...typography.bodyBold, color: colors.ink },
  metricLatest: { ...typography.caption, color: colors.inkMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 8, borderRadius: radius.lg, backgroundColor: colors.panelMuted, padding: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '72%', borderRadius: radius.sm, minHeight: 8 },
  barLabel: { ...typography.caption, fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  checkInCard: { gap: spacing.xs },
  cardTitle: { ...typography.subtitle, color: colors.ink },
  cardSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2, marginBottom: spacing.sm },
  optionGroup: { marginTop: spacing.sm },
  optionLabel: { ...typography.label, color: colors.inkMuted, marginBottom: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  optionChipSelected: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  optionText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  optionTextSelected: { color: colors.white },
  latestBodyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  measureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGrid: { gap: spacing.xs },
  history: { gap: spacing.sm },
  historyCard: { padding: spacing.md },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  historyDate: { ...typography.bodyBold, color: colors.ink },
  historyLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  historyMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  historyChip: {
    ...typography.caption,
    color: colors.accentDark,
    backgroundColor: colors.accentLight,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyText: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 17 },
});
