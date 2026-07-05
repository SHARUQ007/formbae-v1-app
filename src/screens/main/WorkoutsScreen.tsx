import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, StyleSheet, RefreshControl, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { StatTile } from '../../components/StatTile';
import { fetchWorkoutPlan } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import type { PlanDay, ProgressSummary, TrainerInfo } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

function WorkoutDashboardScreen({ navigation }: Props) {
  const [days, setDays] = useState<PlanDay[]>([]);
  const [title, setTitle] = useState('My workout plan');
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [trainer, setTrainer] = useState<TrainerInfo | null>(null);
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
      setProgress(data.today?.progress || null);
      setTrainer(data.today?.assignedTrainer || null);
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

  const todayDay = useMemo(() => {
    if (!days.length) return null;
    return days.find((day) => !day.completed) || days[0];
  }, [days]);

  if (loading) {
    return (
      <ScreenContainer>
        <SkeletonBlock style={styles.skeletonTitle} />
        <SkeletonBlock style={styles.skeletonSummary} />
        <SkeletonBlock style={styles.skeletonHero} />
        <View style={styles.days}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.dayCard}>
              <SkeletonBlock style={styles.dayBadge} />
              <View style={styles.dayInfo}>
                <SkeletonBlock style={styles.skeletonDayTitle} />
                <SkeletonBlock style={styles.skeletonMeta} />
              </View>
            </View>
          ))}
        </View>
      </ScreenContainer>
    );
  }

  const doneCount = days.filter((d) => d.completed).length;
  const todayCount = todayDay?.exercises?.length ?? 0;
  const planProgress = days.length ? doneCount / days.length : 0;

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : days.length === 0 ? (
          <EmptyState icon="calendar" title="No plan yet" message="Your workout plan will appear here once your trainer publishes it." />
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>Workout</Text>
                <ScreenTitle>{title}</ScreenTitle>
                <Text style={styles.summary}>
                  {doneCount} of {days.length} days complete
                </Text>
              </View>
              <View style={styles.scorePill}>
                <Text style={styles.scoreValue}>{Math.round(planProgress * 100)}%</Text>
                <Text style={styles.scoreLabel}>week</Text>
              </View>
            </View>

            <Card style={styles.todayHero}>
              <View style={styles.todayTop}>
                <Badge label="Today" tone={todayDay?.completed ? 'success' : 'accent'} icon={todayDay?.completed ? 'check' : 'zap'} />
                <Text style={styles.todayDay}>Day {todayDay?.dayNumber || '-'}</Text>
              </View>
              <Text style={styles.todayTitle}>{todayDay?.focus || 'Workout'}</Text>
              <Text style={styles.todayMeta}>
                {todayCount} exercise{todayCount === 1 ? '' : 's'}
                {trainer?.name ? ` · Coach ${trainer.name}` : ''}
              </Text>

              <View style={styles.heroActions}>
                <PrimaryButton
                  title={todayDay?.completed ? 'Review today workout' : "Today's Workout"}
                  icon="activity"
                  onPress={() =>
                    todayDay
                      ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'standard' })
                      : undefined
                  }
                />
                <PrimaryButton
                  title="Short on time workout"
                  icon="clock"
                  variant="secondary"
                  onPress={() =>
                    todayDay
                      ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'quick' })
                      : undefined
                  }
                />
              </View>
            </Card>

            {progress ? (
              <View style={styles.statsRow}>
                <StatTile icon="target" value={`${progress.adherencePct}%`} label="Adherence" />
                <StatTile icon="zap" value={`${progress.currentStreak}d`} label="Streak" />
              </View>
            ) : null}

            <Card variant="flat" style={styles.weekProgress}>
              <View style={styles.weekProgressTop}>
                <Text style={styles.weekProgressTitle}>Full plan progress</Text>
                <Text style={styles.weekProgressMeta}>
                  {doneCount}/{days.length} days
                </Text>
              </View>
              <ProgressBar value={planProgress} />
            </Card>

            <SectionTitle>Full workout plan</SectionTitle>
            <View style={styles.days}>
              {days.map((day) => {
                const count = day.exercises?.length ?? 0;
                const isToday = day.planDayId === todayDay?.planDayId;
                return (
                  <Card
                    key={day.planDayId}
                    onPress={() => navigation.navigate('WorkoutDetail', { planDayId: day.planDayId, title: day.focus, mode: 'standard' })}
                    style={StyleSheet.flatten([styles.dayCard, isToday && styles.todayPlanCard])}
                  >
                    <View style={[styles.dayBadge, day.completed && styles.dayBadgeDone]}>
                      {day.completed ? <Feather name="check" size={18} color={colors.white} /> : <Text style={styles.dayNum}>{day.dayNumber}</Text>}
                    </View>
                    <View style={styles.dayInfo}>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayTitle} numberOfLines={1}>
                          {day.focus || 'Workout'}
                        </Text>
                        {isToday ? <Badge label="Today" tone="accent" /> : null}
                      </View>
                      <Text style={styles.meta}>
                        {count} exercise{count === 1 ? '' : 's'} · Day {day.dayNumber}
                      </Text>
                    </View>
                    {day.completed ? <Badge label="Done" tone="success" icon="check" /> : <Feather name="chevron-right" size={20} color={colors.inkSubtle} />}
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

export const WorkoutsScreen = WorkoutDashboardScreen;

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  headerText: { flex: 1 },
  eyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  summary: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.xs },
  scorePill: {
    width: 70,
    height: 70,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  scoreValue: { fontSize: 19, fontWeight: '800', color: colors.accentDark },
  scoreLabel: { ...typography.caption, color: colors.accentDarker, marginTop: -2 },
  todayHero: { backgroundColor: colors.accent, borderColor: colors.accentDark, overflow: 'hidden' },
  todayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayDay: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '700' },
  todayTitle: { ...typography.title, color: colors.white, marginTop: spacing.md },
  todayMeta: { ...typography.body, color: colors.onAccentMuted, marginTop: 4 },
  heroActions: { gap: spacing.sm, marginTop: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  weekProgress: { marginTop: spacing.md },
  weekProgressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekProgressTitle: { ...typography.bodyBold, color: colors.ink },
  weekProgressMeta: { ...typography.caption, color: colors.inkMuted },
  days: { gap: spacing.sm },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  todayPlanCard: { borderColor: colors.accent, backgroundColor: colors.accentLight },
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
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayTitle: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  meta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  skeletonTitle: { width: '62%', height: 30, marginBottom: spacing.sm },
  skeletonSummary: { width: '74%', height: 14, marginBottom: spacing.md },
  skeletonHero: { height: 260, borderRadius: radius.xl, marginBottom: spacing.md },
  skeletonDayTitle: { width: '72%', height: 16 },
  skeletonMeta: { width: '48%', height: 12, marginTop: spacing.sm },
});
