import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet, RefreshControl, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { fetchWorkoutPlan } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import type { PlanDay } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

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
        <ScreenTitle>My plan</ScreenTitle>
        <LoadingState message="Loading your plan…" />
      </ScreenContainer>
    );
  }

  const doneCount = days.filter((d) => d.completed).length;

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>{title}</ScreenTitle>
        {days.length > 0 ? (
          <Text style={styles.summary}>
            {doneCount} of {days.length} days completed · {mode === 'quick' ? 'Quick' : 'Standard'} mode
          </Text>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No plan yet"
            message="Your workout plan will appear here once your trainer publishes it."
          />
        ) : (
          <View style={styles.days}>
            {days.map((day) => {
              const count = day.exercises?.length ?? 0;
              return (
                <Card
                  key={day.planDayId}
                  onPress={() => navigation.navigate('WorkoutDetail', { planDayId: day.planDayId, title: day.focus, mode })}
                  style={styles.dayCard}
                >
                  <View style={[styles.dayBadge, day.completed && styles.dayBadgeDone]}>
                    {day.completed ? (
                      <Feather name="check" size={18} color={colors.white} />
                    ) : (
                      <Text style={styles.dayNum}>{day.dayNumber}</Text>
                    )}
                  </View>
                  <View style={styles.dayInfo}>
                    <Text style={styles.dayTitle} numberOfLines={1}>
                      {day.focus || 'Workout'}
                    </Text>
                    <Text style={styles.meta}>
                      {count} exercise{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {day.completed ? <Badge label="Done" tone="success" icon="check" /> : <Feather name="chevron-right" size={20} color={colors.inkSubtle} />}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  summary: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md, marginTop: -spacing.xs },
  days: { gap: spacing.sm },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeDone: { backgroundColor: colors.accent },
  dayNum: { ...typography.subtitle, color: colors.accentDark, fontWeight: '800' },
  dayInfo: { flex: 1 },
  dayTitle: { ...typography.bodyBold, color: colors.ink },
  meta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
