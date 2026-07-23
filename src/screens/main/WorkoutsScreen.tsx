import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, StyleSheet, RefreshControl, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
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

            <View style={styles.sessionStack}>
              <TouchableSessionCard
                label={todayDay?.completed ? 'Ready to review' : "Today's workout"}
                title={todayDay?.focus || 'Main session'}
                description="Full plan with video guidance, set tracking, rest timer, and feedback."
                icon="activity"
                tone="dark"
                meta={`Day ${todayDay?.dayNumber || '-'} · ${todayCount} exercise${todayCount === 1 ? '' : 's'}${trainer?.name ? ` · Coach ${trainer.name}` : ''}`}
                cta={todayDay?.completed ? 'Review session' : 'Start main workout'}
                onPress={() =>
                  todayDay
                    ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'standard' })
                    : undefined
                }
              />
              <TouchableSessionCard
                label="Short on time"
                title="Minimum effective dose"
                description="A compressed version for busy days. Keep the streak alive without losing the plan."
                icon="clock"
                tone="light"
                meta="Fewer movements · Same day focus · Faster pacing"
                cta="Start quick workout"
                onPress={() =>
                  todayDay
                    ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'quick' })
                    : undefined
                }
              />
            </View>

            {trainer ? (
              <Card variant="outline" style={styles.trainerCard}>
                <View style={styles.trainerPhotoWrap}>
                  {trainer.trainerPhotoUrl ? (
                    <Image source={{ uri: trainer.trainerPhotoUrl }} style={styles.trainerPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.trainerFallback}>
                      <Text style={styles.trainerInitial}>{(trainer.name || 'T').slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName} numberOfLines={1}>{trainer.name || 'FormBae Trainer'}</Text>
                  <Text style={styles.trainerDescription} numberOfLines={2}>
                    {trainer.trainerDescription || 'Guiding your workout plan, check-ins and weekly progress.'}
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="shield" size={16} color={colors.accent} />
                </View>
              </Card>
            ) : null}

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

function TouchableSessionCard({
  label,
  title,
  description,
  meta,
  cta,
  icon,
  tone,
  onPress,
}: {
  label: string;
  title: string;
  description: string;
  meta: string;
  cta: string;
  icon: string;
  tone: 'dark' | 'light';
  onPress: () => void;
}) {
  const dark = tone === 'dark';
  return (
    <Card onPress={onPress} style={StyleSheet.flatten([styles.sessionCard, dark ? styles.sessionCardDark : styles.sessionCardLight])}>
      <View style={styles.sessionCardTop}>
        <View style={[styles.sessionIcon, dark ? styles.sessionIconDark : styles.sessionIconLight]}>
          <Feather name={icon} size={20} color={dark ? colors.inkStrong : colors.accentDark} />
        </View>
        <Text style={[styles.sessionLabel, dark && styles.sessionLabelDark]}>{label}</Text>
      </View>
      <Text style={[styles.sessionTitle, dark && styles.sessionTitleDark]}>{title}</Text>
      <Text style={[styles.sessionDescription, dark && styles.sessionDescriptionDark]}>{description}</Text>
      <Text style={[styles.sessionMeta, dark && styles.sessionMetaDark]}>{meta}</Text>
      <View style={styles.sessionCta}>
        <Text style={[styles.sessionCtaText, dark && styles.sessionCtaTextDark]}>{cta}</Text>
        <Feather name="arrow-right" size={17} color={dark ? colors.white : colors.accentDark} />
      </View>
    </Card>
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
  sessionStack: { gap: spacing.sm },
  sessionCard: { overflow: 'hidden' },
  sessionCardDark: { backgroundColor: colors.inkStrong, borderColor: colors.ink },
  sessionCardLight: { backgroundColor: colors.white, borderColor: colors.accentSurface },
  sessionCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  sessionIcon: { width: 42, height: 42, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  sessionIconDark: { backgroundColor: colors.white },
  sessionIconLight: { backgroundColor: colors.accentLight },
  sessionLabel: { ...typography.overline, color: colors.accentDark, textTransform: 'uppercase', flex: 1, textAlign: 'right' },
  sessionLabelDark: { color: colors.onAccentMuted },
  sessionTitle: { ...typography.title, color: colors.ink },
  sessionTitleDark: { color: colors.white },
  sessionDescription: { ...typography.body, color: colors.inkMuted, marginTop: 4 },
  sessionDescriptionDark: { color: colors.onAccentMuted },
  sessionMeta: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.md },
  sessionMetaDark: { color: colors.onAccentMuted },
  sessionCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  sessionCtaText: { ...typography.bodyBold, color: colors.accentDark },
  sessionCtaTextDark: { color: colors.white },
  trainerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md },
  trainerPhotoWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  trainerPhoto: { width: '100%', height: '100%' },
  trainerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  trainerInitial: { ...typography.title, color: colors.accentDark },
  trainerInfo: { flex: 1 },
  trainerLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase', marginBottom: 2 },
  trainerName: { ...typography.subtitle, color: colors.ink },
  trainerDescription: { ...typography.caption, color: colors.inkMuted, marginTop: 2, lineHeight: 17 },
  trainerBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
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
