import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, StyleSheet, RefreshControl, View, TouchableOpacity } from 'react-native';
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
  const [selectedMode, setSelectedMode] = useState<'standard' | 'quick'>('standard');
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
      setSelectedMode(plan?.selectedWorkoutMode === 'quick' ? 'quick' : 'standard');
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
  const modeLabel = selectedMode === 'quick' ? 'Short on time' : 'Full workout';

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
                  {doneCount} of {days.length} days complete · {modeLabel}
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

              <View style={styles.modeSwitch}>
                <ModeButton
                  label="Full workout"
                  detail="Complete plan"
                  icon="activity"
                  selected={selectedMode === 'standard'}
                  onPress={() => setSelectedMode('standard')}
                />
                <ModeButton
                  label="Short on time"
                  detail="Quick version"
                  icon="clock"
                  selected={selectedMode === 'quick'}
                  onPress={() => setSelectedMode('quick')}
                />
              </View>

              <PrimaryButton
                title={todayDay?.completed ? 'Review today workout' : selectedMode === 'quick' ? 'Start short workout' : 'Start full workout'}
                icon="play"
                onPress={() =>
                  todayDay
                    ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: selectedMode })
                    : undefined
                }
                style={styles.startButton}
              />
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

            {todayDay?.exercises?.length ? (
              <>
                <SectionTitle>Today’s exercises</SectionTitle>
                <View style={styles.exercisePreview}>
                  {todayDay.exercises.slice(0, 5).map((exercise, index) => (
                    <View key={`${exercise.exerciseId}_${index}`} style={styles.exerciseRow}>
                      <View style={styles.exerciseIndex}>
                        <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.exerciseText}>
                        <Text style={styles.exerciseName} numberOfLines={1}>
                          {exercise.exerciseName}
                        </Text>
                        <Text style={styles.exerciseMeta} numberOfLines={1}>
                          {[exercise.sets ? `${exercise.sets} sets` : '', exercise.reps ? `${exercise.reps} reps` : '', exercise.restSec ? `${exercise.restSec}s rest` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {todayDay.exercises.length > 5 ? <Text style={styles.moreText}>+{todayDay.exercises.length - 5} more inside workout</Text> : null}
                </View>
              </>
            ) : null}

            <SectionTitle>Full workout plan</SectionTitle>
            <View style={styles.days}>
              {days.map((day) => {
                const count = day.exercises?.length ?? 0;
                const isToday = day.planDayId === todayDay?.planDayId;
                return (
                  <Card
                    key={day.planDayId}
                    onPress={() => navigation.navigate('WorkoutDetail', { planDayId: day.planDayId, title: day.focus, mode: selectedMode })}
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

function ModeButton({
  label,
  detail,
  icon,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.modeButton, selected && styles.modeButtonSelected]}>
      <Feather name={icon} size={18} color={selected ? colors.white : colors.accent} />
      <View style={styles.modeText}>
        <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</Text>
        <Text style={[styles.modeDetail, selected && styles.modeDetailSelected]}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );
}

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
  modeSwitch: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modeButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  modeButtonSelected: { backgroundColor: colors.accentDark, borderColor: colors.white },
  modeText: { gap: 2 },
  modeLabel: { ...typography.bodyBold, color: colors.ink },
  modeLabelSelected: { color: colors.white },
  modeDetail: { ...typography.caption, color: colors.inkMuted },
  modeDetailSelected: { color: colors.onAccentMuted },
  startButton: { marginTop: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  weekProgress: { marginTop: spacing.md },
  weekProgressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekProgressTitle: { ...typography.bodyBold, color: colors.ink },
  weekProgressMeta: { ...typography.caption, color: colors.inkMuted },
  exercisePreview: { gap: spacing.sm },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseIndex: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  exerciseIndexText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  exerciseText: { flex: 1 },
  exerciseName: { ...typography.bodyBold, color: colors.ink },
  exerciseMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  moreText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xs },
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
