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
import { fetchProgress, logProgress } from '../../services/progressService';
import { fetchCheckIns, submitCheckIn } from '../../services/checkInService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { formatDate } from '../../utils/format';
import type { CheckIn, ProgressSummary } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Loaded = { progress: ProgressSummary; checkIns: CheckIn[]; dueThisWeek: boolean };

export function ProgressScreen() {
  const { data, loading, error, reload, refresh, refreshing } = useAsync<Loaded>(async () => {
    const [p, c] = await Promise.all([fetchProgress(), fetchCheckIns()]);
    return { progress: p, checkIns: c.checkIns, dueThisWeek: c.dueThisWeek };
  });

  const [weight, setWeight] = useState('');
  const [energy, setEnergy] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [completion, setCompletion] = useState('');
  const [notes, setNotes] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [savingCheckIn, setSavingCheckIn] = useState(false);

  const onLogWeight = async () => {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter weight', 'Please enter a valid weight in kg.');
      return;
    }
    setSavingWeight(true);
    try {
      await logProgress({ weight });
      setWeight('');
      await reload();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingWeight(false);
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
  const maxWeight = Math.max(...trend.map((t) => t.weight), 1);
  const minWeight = Math.min(...trend.map((t) => t.weight), maxWeight);
  const range = Math.max(maxWeight - minWeight, 1);

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

          <Card>
            <Text style={styles.label}>Latest weight</Text>
            <Text style={styles.value}>{latestWeight ? `${latestWeight} kg` : 'Not logged yet'}</Text>
            <View style={styles.statsRow}>
              <StatTile icon="target" value={`${progress.adherencePct}%`} label="Adherence" />
              <StatTile icon="zap" value={`${progress.currentStreak}d`} label="Streak" />
            </View>
            <View style={styles.statsRow}>
              <StatTile icon="award" value={`${progress.bestStreak}d`} label="Best streak" />
              <StatTile icon="check-circle" value={`${progress.completed}/${progress.planned}`} label="Workouts" />
            </View>
          </Card>

          {trend.length > 1 ? (
            <>
              <SectionTitle>Weight trend</SectionTitle>
              <Card>
                <View style={styles.chart}>
                  {trend.slice(-8).map((point, idx) => {
                    const heightPct = 20 + ((point.weight - minWeight) / range) * 70;
                    return (
                      <View key={`${point.date}_${idx}`} style={styles.chartCol}>
                        <View style={[styles.bar, { height: `${heightPct}%` }]} />
                        <Text style={styles.barLabel}>{point.weight}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </>
          ) : null}

          <SectionTitle>Log weight</SectionTitle>
          <Card>
            <FormInput icon="trending-up" value={weight} onChangeText={setWeight} placeholder="Weight in kg" keyboardType="numeric" />
            <PrimaryButton title="Save weight" icon="plus" onPress={onLogWeight} loading={savingWeight} />
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
            {checkIns.slice(0, 6).map((c) => (
              <Card key={c.checkInId} variant="flat" style={styles.historyCard}>
                <Text style={styles.historyDate}>{formatDate(c.date)}</Text>
                <Text style={styles.historyText}>
                  {[c.weight ? `${c.weight} kg` : '', c.energyLevel ? `Energy ${c.energyLevel}` : '', c.notes]
                    .filter(Boolean)
                    .join(' · ') || 'Check-in submitted'}
                </Text>
              </Card>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  due: { marginBottom: spacing.md },
  dueRow: { gap: spacing.sm },
  dueText: { ...typography.body, color: colors.accentDarker },
  label: { ...typography.caption, color: colors.inkMuted },
  value: { ...typography.display, color: colors.ink, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 8 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 6 },
  barLabel: { ...typography.caption, fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  history: { gap: spacing.sm },
  historyCard: { padding: spacing.md },
  historyDate: { ...typography.bodyBold, color: colors.ink },
  historyText: { ...typography.caption, color: colors.inkMuted, marginTop: 4 },
});
