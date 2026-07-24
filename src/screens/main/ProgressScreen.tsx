import { useState } from 'react';
import { ScrollView, Text, StyleSheet, View, RefreshControl, Alert } from 'react-native';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { StatTile } from '../../components/StatTile';
import { Badge } from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { logProgress } from '../../services/progressService';
import { submitCheckIn } from '../../services/checkInService';
import { loadProgressBundleCached } from '../../services/preloadService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { formatDate } from '../../utils/format';
import type { CheckIn, ProgressSummary } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Loaded = { progress: ProgressSummary; checkIns: CheckIn[]; dueThisWeek: boolean };

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
        <LoadingState message="Loading your progress…" />
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
  const latestWeight = trend[trend.length - 1]?.weight;
  const latest = trend[trend.length - 1];
  const first = trend[0];
  const recentCheckIns = checkIns.slice(0, 6);
  const avgEnergy = averageMetric(checkIns, 'energyLevel');
  const avgDifficulty = averageMetric(checkIns, 'difficultyLevel');
  const latestCompletion = checkIns.find((entry) => entry.workoutCompletion)?.workoutCompletion || '';
  const weightDelta = latest?.weight && first?.weight ? latest.weight - first.weight : 0;
  const waistDelta = latest?.waist && first?.waist ? latest.waist - first.waist : 0;

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <ScreenTitle>Progress</ScreenTitle>

          {dueThisWeek ? (
            <Card variant="accent" style={styles.due}>
              <View style={styles.dueRow}>
                <Badge label="Due" tone="warn" icon="clock" />
                <Text style={styles.dueText}>Your weekly check-in is due. Fill it in below to keep your trainer updated.</Text>
              </View>
            </Card>
          ) : null}

          <Card style={styles.hero}>
            <Text style={styles.label}>Progress report</Text>
            <Text style={styles.value}>{latestWeight ? `${latestWeight} kg` : 'No body log yet'}</Text>
            <Text style={styles.heroSub}>
              {trend.length ? `${trend.length} body log${trend.length === 1 ? '' : 's'} recorded` : 'Add your first weight, chest, waist or biceps log.'}
            </Text>
            <View style={styles.statsRow}>
              <StatTile icon="target" value={`${progress.adherencePct}%`} label="Adherence" />
              <StatTile icon="zap" value={`${progress.currentStreak}d`} label="Streak" />
            </View>
            <View style={styles.statsRow}>
              <StatTile icon="award" value={`${progress.bestStreak}d`} label="Best streak" />
              <StatTile icon="check-circle" value={`${progress.completed}/${progress.planned}`} label="Workouts" />
            </View>
          </Card>

          <SectionTitle>Weekly report</SectionTitle>
          <View style={styles.reportGrid}>
            <ReportTile label="Energy avg" value={avgEnergy ? `${avgEnergy}/10` : '-'} tone="accent" />
            <ReportTile label="Difficulty avg" value={avgDifficulty ? `${avgDifficulty}/10` : '-'} tone="warn" />
            <ReportTile label="Latest completion" value={latestCompletion || '-'} tone="neutral" />
            <ReportTile label="Weight change" value={formatDelta(weightDelta, 'kg')} tone={weightDelta <= 0 ? 'accent' : 'neutral'} />
          </View>

          {trend.length > 1 ? (
            <>
              <SectionTitle>Body trends</SectionTitle>
              <Card>
                <MetricTrend title="Weight" unit="kg" values={trend.map((point) => ({ date: point.date, value: point.weight }))} color={colors.accent} />
                <MetricTrend title="Waist" unit="cm" values={trend.map((point) => ({ date: point.date, value: point.waist || 0 }))} color={colors.warn} />
                <MetricTrend title="Chest" unit="cm" values={trend.map((point) => ({ date: point.date, value: point.chest || 0 }))} color={colors.info} />
                <MetricTrend title="Biceps" unit="cm" values={trend.map((point) => ({ date: point.date, value: point.biceps || 0 }))} color={colors.ink} />
                <Text style={styles.deltaNote}>
                  Waist {formatDelta(waistDelta, 'cm')} across this log range.
                </Text>
              </Card>
            </>
          ) : null}

          <SectionTitle>Log body measurements</SectionTitle>
          <Card>
            <View style={styles.inputGrid}>
              <FormInput icon="trending-up" value={weight} onChangeText={setWeight} placeholder="Weight (kg)" keyboardType="numeric" />
              <FormInput icon="maximize-2" value={chest} onChangeText={setChest} placeholder="Chest (cm)" keyboardType="numeric" />
              <FormInput icon="minimize-2" value={waist} onChangeText={setWaist} placeholder="Waist (cm)" keyboardType="numeric" />
              <FormInput icon="activity" value={biceps} onChangeText={setBiceps} placeholder="Biceps (cm)" keyboardType="numeric" />
            </View>
            <PrimaryButton title="Save body log" icon="plus" onPress={onLogBody} loading={savingBody} />
          </Card>

          <SectionTitle>Weekly check-in</SectionTitle>
          <Card>
            <FormInput label="Energy (1-10)" value={energy} onChangeText={setEnergy} placeholder="e.g. 7" keyboardType="numeric" maxLength={2} />
            <FormInput label="Difficulty (1-10)" value={difficulty} onChangeText={setDifficulty} placeholder="e.g. 6" keyboardType="numeric" maxLength={2} />
            <FormInput label="Workouts completed this week" value={completion} onChangeText={setCompletion} placeholder="e.g. 4 of 5" />
            <FormInput label="Notes for your trainer" value={notes} onChangeText={setNotes} placeholder="How did the week feel?" multiline autoCapitalize="sentences" />
            <PrimaryButton title="Submit check-in" icon="send" onPress={onCheckIn} loading={savingCheckIn} />
          </Card>

          {checkIns.length > 0 ? <SectionTitle>Recent check-ins</SectionTitle> : null}
          <View style={styles.history}>
            {recentCheckIns.map((c) => (
              <Card key={c.checkInId} variant="flat" style={styles.historyCard}>
                <View style={styles.historyHead}>
                  <Text style={styles.historyDate}>{formatDate(c.date)}</Text>
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

function ReportTile({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'warn' | 'neutral' }) {
  return (
    <View style={[styles.reportTile, tone === 'accent' && styles.reportAccent, tone === 'warn' && styles.reportWarn]}>
      <Text style={styles.reportLabel}>{label}</Text>
      <Text style={styles.reportValue}>{value}</Text>
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
  const usable = values.filter((point) => Number.isFinite(point.value) && point.value > 0).slice(-8);
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
          const heightPct = 22 + ((point.value - min) / range) * 70;
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
  due: { marginBottom: spacing.md },
  dueRow: { gap: spacing.sm },
  dueText: { ...typography.body, color: colors.accentDarker },
  hero: { backgroundColor: colors.panel },
  label: { ...typography.caption, color: colors.inkMuted },
  value: { ...typography.display, color: colors.ink, marginTop: 2 },
  heroSub: { ...typography.body, color: colors.inkMuted, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reportTile: { width: '48%', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  reportAccent: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  reportWarn: { backgroundColor: colors.warnLight, borderColor: '#f7d8bf' },
  reportLabel: { ...typography.caption, color: colors.inkMuted },
  reportValue: { ...typography.subtitle, color: colors.ink, marginTop: 4 },
  metricTrend: { marginBottom: spacing.lg },
  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  metricTitle: { ...typography.bodyBold, color: colors.ink },
  metricLatest: { ...typography.caption, color: colors.inkMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 104, gap: 8 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', borderRadius: radius.sm, minHeight: 6 },
  barLabel: { ...typography.caption, fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  deltaNote: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', marginTop: -spacing.sm },
  inputGrid: { gap: spacing.xs },
  history: { gap: spacing.sm },
  historyCard: { padding: spacing.md },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  historyDate: { ...typography.bodyBold, color: colors.ink },
  historyMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  historyChip: { ...typography.caption, color: colors.accentDark, backgroundColor: colors.accentLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  historyText: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 17 },
});
