import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchWorkoutPlan } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import type { PlanDay } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

export function WorkoutsScreen({ navigation }: Props) {
  const [days, setDays] = useState<PlanDay[]>([]);
  const [title, setTitle] = useState('My plan');
  const [mode, setMode] = useState<'standard' | 'quick'>('standard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      await flushWorkoutQueue();
      const data = await fetchWorkoutPlan();
      const plan = (data.plan || data.today?.plan) as { days?: PlanDay[]; title?: string; selectedWorkoutMode?: string } | undefined;
      setDays(plan?.days || []);
      setTitle(plan?.title || 'My workout plan');
      setMode(plan?.selectedWorkoutMode === 'quick' ? 'quick' : 'standard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Loading plan…</ScreenTitle>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ScreenTitle>{title}</ScreenTitle>
        {error ? (
          <Card>
            <Text style={styles.error}>{error}</Text>
            <PrimaryButton title="Retry" onPress={load} style={{ marginTop: 12 }} />
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <Text style={styles.empty}>Your workout plan will appear here once your trainer publishes it.</Text>
          </Card>
        ) : (
          days.map((day) => {
            const count = day.exercises?.length ?? 0;
            return (
              <TouchableOpacity
                key={day.planDayId}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('WorkoutDetail', { planDayId: day.planDayId, title: day.focus, mode })}
              >
                <Card style={day.completed ? styles.doneCard : styles.dayCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.dayLabel}>Day {day.dayNumber}</Text>
                    {day.completed ? <Text style={styles.doneTag}>✓ Completed</Text> : null}
                  </View>
                  <Text style={styles.dayTitle}>{day.focus || 'Workout'}</Text>
                  <Text style={styles.meta}>
                    {count} exercise{count === 1 ? '' : 's'} · {mode === 'quick' ? 'Quick' : 'Standard'} mode
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.inkMuted, lineHeight: 21 },
  error: { color: colors.error },
  dayCard: { marginBottom: 10 },
  doneCard: { marginBottom: 10, backgroundColor: colors.accentLight },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { color: colors.accent, fontWeight: '700' },
  doneTag: { color: colors.accent, fontWeight: '700' },
  dayTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginVertical: 4 },
  meta: { color: colors.inkMuted },
});
