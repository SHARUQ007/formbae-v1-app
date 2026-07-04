import { useState } from 'react';
import { ScrollView, Text, StyleSheet, View, RefreshControl, Alert } from 'react-native';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchProgress, logProgress } from '../../services/progressService';
import { fetchCheckIns, submitCheckIn } from '../../services/checkInService';
import { formatDate } from '../../utils/format';
import type { CheckIn, ProgressSummary } from '../../types/api';
import { colors } from '../../theme/colors';

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
      await submitCheckIn({
        weight,
        energyLevel: energy,
        difficultyLevel: difficulty,
        workoutCompletion: completion,
        notes,
      });
      setNotes('');
      setEnergy('');
      setDifficulty('');
      setCompletion('');
      await reload();
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
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ScreenTitle>Progress</ScreenTitle>

          {dueThisWeek ? (
            <Card style={styles.due}>
              <Text style={styles.dueText}>Your weekly check-in is due. Fill it in below to keep your trainer updated.</Text>
            </Card>
          ) : null}

          <Card>
            <Text style={styles.label}>Latest weight</Text>
            <Text style={styles.value}>{latestWeight ? `${latestWeight} kg` : 'Not logged yet'}</Text>
            <View style={styles.statsRow}>
              <Stat label="Adherence" value={`${progress.adherencePct}%`} />
              <Stat label="Streak" value={`${progress.currentStreak}d`} />
              <Stat label="Best" value={`${progress.bestStreak}d`} />
              <Stat label="Workouts" value={`${progress.completed}/${progress.planned}`} />
            </View>
          </Card>

          {trend.length > 1 ? (
            <Card style={styles.formCard}>
              <Text style={styles.section}>Weight trend</Text>
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
          ) : null}

          <Card style={styles.formCard}>
            <Text style={styles.section}>Log weight</Text>
            <FormInput value={weight} onChangeText={setWeight} placeholder="Weight in kg" keyboardType="numeric" />
            <PrimaryButton title="Save weight" onPress={onLogWeight} loading={savingWeight} />
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.section}>Weekly check-in</Text>
            <FormInput label="Energy (1-10)" value={energy} onChangeText={setEnergy} placeholder="e.g. 7" keyboardType="numeric" maxLength={2} />
            <FormInput label="Difficulty (1-10)" value={difficulty} onChangeText={setDifficulty} placeholder="e.g. 6" keyboardType="numeric" maxLength={2} />
            <FormInput label="Workouts completed this week" value={completion} onChangeText={setCompletion} placeholder="e.g. 4 of 5" />
            <FormInput label="Notes for your trainer" value={notes} onChangeText={setNotes} placeholder="How did the week feel?" multiline autoCapitalize="sentences" />
            <PrimaryButton title="Submit check-in" onPress={onCheckIn} loading={savingCheckIn} />
          </Card>

          {checkIns.length > 0 ? <Text style={styles.historyHeader}>Recent check-ins</Text> : null}
          {checkIns.slice(0, 6).map((c) => (
            <Card key={c.checkInId} style={styles.history}>
              <Text style={styles.historyDate}>{formatDate(c.date)}</Text>
              <Text style={styles.historyText}>
                {[c.weight ? `${c.weight} kg` : '', c.energyLevel ? `Energy ${c.energyLevel}` : '', c.notes]
                  .filter(Boolean)
                  .join(' · ') || 'Check-in submitted'}
              </Text>
            </Card>
          ))}
        </ScrollView>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  due: { backgroundColor: colors.accentLight, marginBottom: 12 },
  dueText: { color: colors.ink, lineHeight: 21 },
  label: { color: colors.inkMuted },
  value: { fontSize: 28, fontWeight: '700', color: colors.ink },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.accent },
  statLabel: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  formCard: { marginTop: 12 },
  section: { fontWeight: '700', fontSize: 16, marginBottom: 8, color: colors.ink },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 8 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', backgroundColor: colors.accent, borderRadius: 6, minHeight: 6 },
  barLabel: { fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  historyHeader: { fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 20, marginBottom: 8 },
  history: { marginTop: 8 },
  historyDate: { fontWeight: '700', color: colors.ink },
  historyText: { color: colors.inkMuted, marginTop: 4 },
});
