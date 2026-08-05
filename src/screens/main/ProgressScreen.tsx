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
type LogMode = 'checkin' | 'body';

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
  const [logMode, setLogMode] = useState<LogMode | null>(null);
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
      setLogMode(null);
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
      setLogMode(null);
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
  const weightDelta = latest?.weight && first?.weight ? latest.weight - first.weight : 0;
  const waistDelta = latest?.waist && first?.waist ? latest.waist - first.waist : 0;
  const completionRate = progress.planned ? progress.completed / progress.planned : 0;
  const reward = rewardMessage(progress);
  const progressPoints = progress.completed * 25 + progress.currentStreak * 10;
  const bestBodyStat = latest?.weight ? `${latest.weight} kg` : latest?.waist ? `${latest.waist} cm waist` : 'No body log yet';

  if (logMode) {
    return (
      <KeyboardScreen>
        <ScreenContainer>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.logHeader}>
              <TouchableOpacity
                onPress={() => setLogMode(null)}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Back to progress"
              >
                <Feather name="chevron-left" size={24} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.logHeaderText}>
                <Text style={styles.eyebrow}>Log progress</Text>
                <Text style={styles.logTitle}>Update your coach</Text>
              </View>
            </View>

            <View style={styles.logTabs}>
              <LogTab label="Check-in" icon="send" active={logMode === 'checkin'} onPress={() => setLogMode('checkin')} />
              <LogTab label="Body" icon="edit-3" active={logMode === 'body'} onPress={() => setLogMode('body')} />
            </View>

            {logMode === 'checkin' ? (
              <Card style={styles.formCard}>
                <View style={styles.formIntro}>
                  <View style={styles.formIcon}>
                    <Feather name="message-circle" size={22} color={colors.white} />
                  </View>
                  <View style={styles.formIntroText}>
                    <Text style={styles.cardTitle}>Weekly check-in</Text>
                    <Text style={styles.cardSub}>Use quick taps first. Add a note only if there is useful context.</Text>
                  </View>
                </View>
                <OptionGroup label="Energy" value={energy} options={ENERGY_OPTIONS} onSelect={setEnergy} suffix="/10" />
                <FormInput value={energy} onChangeText={setEnergy} placeholder="Energy (1-10)" keyboardType="numeric" maxLength={2} />
                <OptionGroup label="Difficulty" value={difficulty} options={DIFFICULTY_OPTIONS} onSelect={setDifficulty} suffix="/10" />
                <FormInput value={difficulty} onChangeText={setDifficulty} placeholder="Difficulty (1-10)" keyboardType="numeric" maxLength={2} />
                <OptionGroup label="Workouts completed" value={completion} options={COMPLETION_OPTIONS} onSelect={setCompletion} />
                <FormInput value={completion} onChangeText={setCompletion} placeholder="e.g. 4 of 5" />
                <FormInput value={notes} onChangeText={setNotes} placeholder="Anything your trainer should know?" multiline autoCapitalize="sentences" />
                <PrimaryButton title="Send check-in" icon="send" onPress={onCheckIn} loading={savingCheckIn} />
              </Card>
            ) : (
              <Card style={styles.formCard}>
                <View style={styles.formIntro}>
                  <View style={styles.formIcon}>
                    <Feather name="trending-up" size={22} color={colors.white} />
                  </View>
                  <View style={styles.formIntroText}>
                    <Text style={styles.cardTitle}>Body measurements</Text>
                    <Text style={styles.cardSub}>
                      {latest ? `Last logged ${formatDate(latest.date)}. Update only when something changed.` : 'Add your first body measurement.'}
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
            )}
          </ScrollView>
        </ScreenContainer>
      </KeyboardScreen>
    );
  }

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
              <ScreenTitle>Momentum</ScreenTitle>
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
              <HeroMetric icon="zap" label="Streak" value={`${progress.currentStreak}d`} />
              <HeroMetric icon="check-circle" label="Workouts" value={`${progress.completed}/${progress.planned}`} />
              <HeroMetric icon="award" label="Points" value={`${progressPoints}`} />
            </View>
          </Card>

          <View style={styles.actionGrid}>
            <ProgressAction
              icon="send"
              title={dueThisWeek ? 'Check-in due' : 'Weekly check-in'}
              text="Energy, difficulty, and trainer notes"
              tone={dueThisWeek ? 'dark' : 'light'}
              onPress={() => setLogMode('checkin')}
            />
            <ProgressAction
              icon="edit-3"
              title="Body log"
              text={bestBodyStat}
              tone="light"
              onPress={() => setLogMode('body')}
            />
          </View>

          <SectionTitle>Workout rhythm</SectionTitle>
          <Card style={styles.rhythmCard}>
            <View style={styles.rhythmTop}>
              <View>
                <Text style={styles.cardTitle}>{Math.round(completionRate * 100)}% complete</Text>
                <Text style={styles.cardSub}>{progress.completed} of {progress.planned || 0} workouts logged</Text>
              </View>
              <Badge label={`Best ${progress.bestStreak}d`} tone="accent" icon="award" />
            </View>
            <WorkoutCompletionGraph completed={progress.completed} planned={progress.planned} />
            <Text style={styles.funFact}>{progress.currentStreak > 0 ? 'Consistency compounds. One more session keeps the chain alive.' : 'Start with one logged session. The app will build the story from there.'}</Text>
          </Card>

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

function LogTab({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress} style={[styles.logTab, active && styles.logTabActive]}>
      <Feather name={icon} size={17} color={active ? colors.white : colors.ink} />
      <Text style={[styles.logTabText, active && styles.logTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProgressAction({
  icon,
  title,
  text,
  tone,
  onPress,
}: {
  icon: string;
  title: string;
  text: string;
  tone: 'dark' | 'light';
  onPress: () => void;
}) {
  const dark = tone === 'dark';
  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress} style={[styles.progressAction, dark && styles.progressActionDark]}>
      <View style={[styles.progressActionIcon, dark && styles.progressActionIconDark]}>
        <Feather name={icon} size={20} color={dark ? colors.black : colors.white} />
      </View>
      <Text style={[styles.progressActionTitle, dark && styles.progressActionTitleDark]}>{title}</Text>
      <Text style={[styles.progressActionText, dark && styles.progressActionTextDark]} numberOfLines={2}>{text}</Text>
      <View style={styles.progressActionFooter}>
        <Text style={[styles.progressActionLink, dark && styles.progressActionLinkDark]}>Open</Text>
        <Feather name="arrow-right" size={17} color={dark ? colors.white : colors.black} />
      </View>
    </TouchableOpacity>
  );
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

function TrendDelta({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <View style={[styles.trendDelta, positive ? styles.trendDeltaGood : styles.trendDeltaNeutral]}>
      <Text style={styles.trendDeltaLabel}>{label}</Text>
      <Text style={styles.trendDeltaValue}>{value}</Text>
    </View>
  );
}

function WorkoutCompletionGraph({ completed, planned }: { completed: number; planned: number }) {
  const total = Math.max(planned || 0, completed, 1);
  const bars = Array.from({ length: Math.min(Math.max(total, 4), 10) }, (_, index) => index < completed);
  return (
    <View style={styles.workoutGraph}>
      {bars.map((done, index) => {
        const heightStyle = index % 3 === 0 ? styles.workoutGraphBarLow : index % 3 === 1 ? styles.workoutGraphBarMid : styles.workoutGraphBarHigh;
        return (
          <View key={`workout-${index}`} style={styles.workoutGraphColumn}>
            <View style={[styles.workoutGraphBar, done && styles.workoutGraphBarDone, done ? heightStyle : styles.workoutGraphBarEmpty]} />
          </View>
        );
      })}
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
  logTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  logTab: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  logTabActive: { backgroundColor: colors.black },
  logTabText: { ...typography.bodyBold, color: colors.ink },
  logTabTextActive: { color: colors.white },
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
  actionGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  progressAction: {
    flex: 1,
    minHeight: 166,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  progressActionDark: { backgroundColor: colors.black, borderColor: colors.black },
  progressActionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  progressActionIconDark: { backgroundColor: colors.white },
  progressActionTitle: { ...typography.bodyBold, color: colors.ink },
  progressActionTitleDark: { color: colors.white },
  progressActionText: { ...typography.caption, color: colors.inkMuted, marginTop: 4, minHeight: 34 },
  progressActionTextDark: { color: colors.onAccentMuted },
  progressActionFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  progressActionLink: { ...typography.caption, color: colors.black, fontWeight: '900' },
  progressActionLinkDark: { color: colors.white },
  rhythmCard: { gap: spacing.md },
  rhythmTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  workoutGraph: {
    height: 126,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    borderRadius: radius.xl,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  workoutGraphColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  workoutGraphBar: {
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    minHeight: 12,
  },
  workoutGraphBarDone: { backgroundColor: colors.black },
  workoutGraphBarEmpty: { height: '28%' },
  workoutGraphBarLow: { height: '62%' },
  workoutGraphBarMid: { height: '74%' },
  workoutGraphBarHigh: { height: '86%' },
  funFact: {
    ...typography.body,
    color: colors.ink,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    padding: spacing.md,
  },
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
