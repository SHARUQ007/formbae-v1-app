import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet, RefreshControl, ActivityIndicator, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchToday } from '../../services/workoutService';
import { fetchCheckIns } from '../../services/checkInService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import { useAuthStore } from '../../store/authStore';
import type { TodayPayload } from '../../types/api';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = BottomTabScreenProps<MainTabParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { status } = useAuthStore();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [checkInDue, setCheckInDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      await flushWorkoutQueue();
      const [today, checkIns] = await Promise.all([fetchToday(), fetchCheckIns().catch(() => ({ dueThisWeek: false }))]);
      setData(today);
      setCheckInDue(checkIns.dueThisWeek);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your dashboard');
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

  const todayDay = data?.plan?.days?.[0];
  const progress = data?.progress;
  const firstName = (status?.name || 'there').split(' ')[0];

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Loading…</ScreenTitle>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ScreenTitle>{`Hi ${firstName}`}</ScreenTitle>
        {error ? (
          <Card>
            <Text style={styles.error}>{error}</Text>
            <PrimaryButton title="Retry" onPress={load} style={{ marginTop: 12 }} />
          </Card>
        ) : null}
        {checkInDue ? (
          <Card style={styles.reminder}>
            <Text style={styles.reminderText}>Weekly check-in due — share how your week went with your trainer.</Text>
            <PrimaryButton title="Weekly check-in" onPress={() => navigation.navigate('Progress')} />
          </Card>
        ) : null}
        <Card>
          <Text style={styles.cardLabel}>Today&apos;s workout</Text>
          <Text style={styles.cardTitle}>{todayDay?.focus || data?.plan?.title || 'Your plan is being prepared'}</Text>
          <Text style={styles.cardMeta}>{todayDay?.exercises?.length || 0} exercises</Text>
          <PrimaryButton
            title={todayDay ? 'Start workout' : 'View plan'}
            onPress={() =>
              todayDay
                ? navigation.navigate('Workouts', { screen: 'WorkoutDetail', params: { planDayId: todayDay.planDayId, title: todayDay.focus } } as never)
                : navigation.navigate('Workouts')
            }
            style={{ marginTop: 12 }}
          />
        </Card>
        {data?.assignedTrainer ? (
          <Card style={styles.trainerCard}>
            <Text style={styles.cardLabel}>Your trainer</Text>
            <Text style={styles.cardTitle}>{data.assignedTrainer.name}</Text>
            <Text style={styles.cardMeta}>{data.assignedTrainer.trainerDescription || 'Human online personal trainer'}</Text>
            <PrimaryButton title="Message trainer" variant="secondary" onPress={() => navigation.navigate('Trainer')} style={{ marginTop: 12 }} />
          </Card>
        ) : (
          <Card style={styles.trainerCard}>
            <Text style={styles.cardLabel}>Your trainer</Text>
            <Text style={styles.cardMeta}>We are matching you with the right coach. You will see them here soon.</Text>
          </Card>
        )}
        {progress ? (
          <Card>
            <Text style={styles.cardLabel}>Weekly progress</Text>
            <Text style={styles.cardTitle}>{progress.adherencePct}% adherence</Text>
            <Text style={styles.cardMeta}>
              {progress.completed}/{progress.planned} workouts · {progress.currentStreak} day streak
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress.adherencePct)}%` }]} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error },
  reminder: { marginBottom: 12, backgroundColor: colors.accentLight },
  reminderText: { color: colors.ink, marginBottom: 12 },
  cardLabel: { color: colors.inkMuted, marginBottom: 4 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  cardMeta: { color: colors.inkMuted, marginTop: 4 },
  trainerCard: { marginTop: 12 },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 99, marginTop: 10 },
  progressFill: { height: 6, backgroundColor: colors.accent, borderRadius: 99 },
});
