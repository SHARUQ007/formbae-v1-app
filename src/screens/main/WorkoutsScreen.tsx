import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, ScrollView, Text, StyleSheet, RefreshControl, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ErrorState, EmptyState } from '../../components/States';
import { SkeletonBlock } from '../../components/Skeleton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { ProgressBar } from '../../components/ProgressBar';
import { StatTile } from '../../components/StatTile';
import { fetchWorkoutPlan, requestAiPlanRefresh } from '../../services/workoutService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import { getSiteUrl } from '../../constants/config';
import type { AiPlanRefresh, PlanDay, ProgressSummary, TrainerInfo } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutList'>;

const TODAY_WORKOUT_KEY_PREFIX = 'formbae_today_workout:';

type RefreshAnswers = {
  progressUpdate: string;
  difficulty: string;
  availability: string;
  bodyAndRecovery: string;
  nextFocus: string;
};

const emptyRefreshAnswers: RefreshAnswers = {
  progressUpdate: '',
  difficulty: '',
  availability: '',
  bodyAndRecovery: '',
  nextFocus: '',
};

function resolveTrainerPhotoUrl(value?: string) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${getSiteUrl()}${url}`;
  return url;
}

function WorkoutDashboardScreen({ navigation }: Props) {
  const [days, setDays] = useState<PlanDay[]>([]);
  const [title, setTitle] = useState('My workout plan');
  const [planId, setPlanId] = useState('');
  const [selectedTodayPlanDayId, setSelectedTodayPlanDayId] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [trainerPhotoFailed, setTrainerPhotoFailed] = useState(false);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [trainer, setTrainer] = useState<TrainerInfo | null>(null);
  const [aiPlanRefresh, setAiPlanRefresh] = useState<AiPlanRefresh | null>(null);
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [refreshAnswers, setRefreshAnswers] = useState<RefreshAnswers>(emptyRefreshAnswers);
  const [refreshSaving, setRefreshSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      await flushWorkoutQueue();
      const data = await fetchWorkoutPlan();
      const plan = (data.plan || data.today?.plan) as { planId?: string; days?: PlanDay[]; title?: string; selectedWorkoutMode?: string } | undefined;
      const loadedDays = plan?.days || [];
      const loadedPlanId = plan?.planId || data.today?.plan?.planId || plan?.title || 'default';
      const savedTodayId = await AsyncStorage.getItem(`${TODAY_WORKOUT_KEY_PREFIX}${loadedPlanId}`).catch(() => null);
      setPlanId(loadedPlanId);
      setSelectedTodayPlanDayId(savedTodayId && loadedDays.some((day) => day.planDayId === savedTodayId) ? savedTodayId : '');
      setDays(loadedDays);
      setTitle(plan?.title || 'My workout plan');
      setProgress(data.today?.progress || null);
      setTrainer(data.today?.assignedTrainer || null);
      setAiPlanRefresh(data.aiPlanRefresh || null);
      setTrainerPhotoFailed(false);
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
    const selected = days.find((day) => day.planDayId === selectedTodayPlanDayId);
    if (selected) return selected;
    return days.find((day) => !day.completed) || days[0];
  }, [days, selectedTodayPlanDayId]);

  const onSwitchTodayWorkout = async (day: PlanDay) => {
    setSelectedTodayPlanDayId(day.planDayId);
    setSwitcherOpen(false);
    await AsyncStorage.setItem(`${TODAY_WORKOUT_KEY_PREFIX}${planId || title || 'default'}`, day.planDayId).catch(() => undefined);
  };

  const submitBiweeklyRefresh = async () => {
    const compactAnswers = Object.fromEntries(
      Object.entries(refreshAnswers).map(([key, value]) => [key, value.trim()]),
    ) as Record<keyof RefreshAnswers, string>;
    if (!compactAnswers.progressUpdate || !compactAnswers.difficulty || !compactAnswers.availability || !compactAnswers.bodyAndRecovery || !compactAnswers.nextFocus) {
      Alert.alert('Complete the check-in', 'Answer all 5 questions so Ava can rebuild the next two-week plan properly.');
      return;
    }
    if (!aiPlanRefresh?.planId) {
      Alert.alert('Plan not ready', 'Refresh your workout screen and try again.');
      return;
    }

    setRefreshSaving(true);
    try {
      await requestAiPlanRefresh({
        planId: aiPlanRefresh.planId,
        aiTrainerAnswers: {
          currentActivity: compactAnswers.progressUpdate,
          intensity: compactAnswers.difficulty,
          trainingDays: compactAnswers.availability,
          recovery: compactAnswers.bodyAndRecovery,
          limitations: compactAnswers.bodyAndRecovery,
          focusAreas: compactAnswers.nextFocus,
          preferredExercises: compactAnswers.nextFocus,
          dislikedExercises: compactAnswers.difficulty,
          coachingStyle: `Biweekly plan refresh requested for the next 2 weeks. Keep coaching practical and adapt from the user's latest answers.`,
        },
      });
      setRefreshModalOpen(false);
      setRefreshAnswers(emptyRefreshAnswers);
      await load();
      Alert.alert('New plan built', `${aiPlanRefresh.trainerName || 'Your AI trainer'} rebuilt your workout plan for the next two weeks.`);
    } catch (e) {
      Alert.alert('Could not build plan', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRefreshSaving(false);
    }
  };

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
  const trainerPhoto = resolveTrainerPhotoUrl(trainer?.trainerPhotoUrl);

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
                <View style={styles.todayTopRight}>
                  <Text style={styles.todayDay}>Day {todayDay?.dayNumber || '-'}</Text>
                  <TouchableOpacity onPress={() => setSwitcherOpen(true)} style={styles.switchButton} accessibilityRole="button" accessibilityLabel="Switch today's workout">
                    <Feather name="repeat" size={14} color={colors.white} />
                    <Text style={styles.switchText}>Switch</Text>
                  </TouchableOpacity>
                </View>
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
                  variant="inverted"
                  onPress={() =>
                    todayDay
                      ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'standard' })
                      : undefined
                  }
                />
                <PrimaryButton
                  title="Short on time workout"
                  icon="clock"
                  variant="heroSecondary"
                  onPress={() =>
                    todayDay
                      ? navigation.navigate('WorkoutDetail', { planDayId: todayDay.planDayId, title: todayDay.focus, mode: 'quick' })
                      : undefined
                  }
                />
              </View>
            </Card>

            {aiPlanRefresh?.due ? (
              <Card variant="accent" style={styles.aiRefreshCard}>
                <View style={styles.aiRefreshHead}>
                  <View style={styles.aiRefreshIcon}>
                    <Feather name="refresh-cw" size={20} color={colors.accentDark} />
                  </View>
                  <View style={styles.aiRefreshCopy}>
                    <Text style={styles.aiRefreshKicker}>2-week AI update</Text>
                    <Text style={styles.aiRefreshTitle}>{aiPlanRefresh.trainerName || 'Ava'} can build your next plan</Text>
                    <Text style={styles.aiRefreshText}>
                      Answer 5 quick questions so your next workout block reflects your schedule, recovery, progress and preferences.
                    </Text>
                  </View>
                </View>
                <View style={styles.aiRefreshMetaRow}>
                  <Badge label={`${aiPlanRefresh.planAgeDays}d old`} tone="accent" icon="calendar" />
                  <Badge label={`${aiPlanRefresh.allowance.remaining}/${aiPlanRefresh.allowance.limit} redesigns left`} tone="neutral" icon="zap" />
                </View>
                <PrimaryButton
                  title="Answer and rebuild plan"
                  icon="edit-3"
                  onPress={() => setRefreshModalOpen(true)}
                  disabled={!aiPlanRefresh.allowance.allowed}
                  style={styles.aiRefreshButton}
                />
              </Card>
            ) : null}

            <SectionTitle>Your coach</SectionTitle>
            {trainer ? (
              <Card variant="outline" style={styles.trainerCard} onPress={() => navigation.navigate('Coach')}>
                <View style={styles.trainerPhotoWrap}>
                  {trainerPhoto && !trainerPhotoFailed ? (
                    <Image source={{ uri: trainerPhoto }} style={styles.trainerPhoto} resizeMode="cover" onError={() => setTrainerPhotoFailed(true)} />
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
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            ) : (
              <Card variant="outline" style={styles.trainerCard} onPress={() => navigation.navigate('Coach')}>
                <View style={styles.trainerPhotoWrap}>
                  <View style={styles.trainerFallback}>
                    <Feather name="user-plus" size={22} color={colors.accentDark} />
                  </View>
                </View>
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerLabel}>Your coach</Text>
                  <Text style={styles.trainerName}>Coach not assigned yet</Text>
                  <Text style={styles.trainerDescription} numberOfLines={2}>
                    Open coach details to see assignment status and available options.
                  </Text>
                </View>
                <View style={styles.trainerBadge}>
                  <Feather name="chevron-right" size={20} color={colors.accent} />
                </View>
              </Card>
            )}

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
      <WorkoutSwitchModal
        visible={switcherOpen}
        days={days}
        selectedPlanDayId={todayDay?.planDayId || ''}
        onSelect={onSwitchTodayWorkout}
        onClose={() => setSwitcherOpen(false)}
      />
      <AiPlanRefreshModal
        visible={refreshModalOpen}
        trainerName={aiPlanRefresh?.trainerName || 'Ava'}
        answers={refreshAnswers}
        saving={refreshSaving}
        onChange={(key, value) => setRefreshAnswers((current) => ({ ...current, [key]: value }))}
        onSubmit={submitBiweeklyRefresh}
        onClose={() => {
          if (!refreshSaving) setRefreshModalOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

export const WorkoutsScreen = WorkoutDashboardScreen;

function WorkoutSwitchModal({
  visible,
  days,
  selectedPlanDayId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  days: PlanDay[];
  selectedPlanDayId: string;
  onSelect: (day: PlanDay) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.switchSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetKicker}>Switch today</Text>
              <Text style={styles.sheetTitle}>Choose a workout</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.switchList}>
            {days.map((day) => {
              const selected = day.planDayId === selectedPlanDayId;
              const count = day.exercises?.length ?? 0;
              return (
                <TouchableOpacity key={day.planDayId} onPress={() => onSelect(day)} style={[styles.switchRow, selected && styles.switchRowSelected]}>
                  <View style={[styles.switchDayBadge, selected && styles.switchDayBadgeSelected]}>
                    {selected ? <Feather name="check" size={16} color={colors.white} /> : <Text style={styles.switchDayText}>{day.dayNumber}</Text>}
                  </View>
                  <View style={styles.switchRowText}>
                    <Text style={styles.switchRowTitle} numberOfLines={1}>{day.focus || 'Workout'}</Text>
                    <Text style={styles.switchRowMeta}>
                      Day {day.dayNumber} · {count} exercise{count === 1 ? '' : 's'}{day.completed ? ' · completed' : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={selected ? colors.accent : colors.inkSubtle} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AiPlanRefreshModal({
  visible,
  trainerName,
  answers,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  trainerName: string;
  answers: RefreshAnswers;
  saving: boolean;
  onChange: (key: keyof RefreshAnswers, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.refreshSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.refreshSheetTitleWrap}>
              <Text style={styles.sheetKicker}>New two-week plan</Text>
              <Text style={styles.sheetTitle}>{trainerName} check-in</Text>
              <Text style={styles.refreshIntro}>Your answers are used as input for the next AI-generated workout block.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close" disabled={saving}>
              <Feather name="x" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.refreshForm}>
            <FormInput
              label="What changed in the last two weeks?"
              value={answers.progressUpdate}
              onChangeText={(value) => onChange('progressUpdate', value)}
              placeholder="Progress, missed sessions, energy, strength, weight, confidence..."
              multiline
              autoCapitalize="sentences"
            />
            <FormInput
              label="How hard did the current plan feel?"
              value={answers.difficulty}
              onChangeText={(value) => onChange('difficulty', value)}
              placeholder="Too easy, just right, too hard, which exercises you liked or disliked..."
              multiline
              autoCapitalize="sentences"
            />
            <FormInput
              label="What schedule can you follow now?"
              value={answers.availability}
              onChangeText={(value) => onChange('availability', value)}
              placeholder="Days per week, workout duration, home/gym access, travel..."
              multiline
              autoCapitalize="sentences"
            />
            <FormInput
              label="Any pain, injury, fatigue or recovery notes?"
              value={answers.bodyAndRecovery}
              onChangeText={(value) => onChange('bodyAndRecovery', value)}
              placeholder="Soreness, knee/back/shoulder pain, sleep, stress, recovery..."
              multiline
              autoCapitalize="sentences"
            />
            <FormInput
              label="What should the next two weeks focus on?"
              value={answers.nextFocus}
              onChangeText={(value) => onChange('nextFocus', value)}
              placeholder="Fat loss, strength, stamina, glutes, posture, consistency..."
              multiline
              autoCapitalize="sentences"
            />
            <PrimaryButton title="Build my next plan" icon="refresh-cw" onPress={onSubmit} loading={saving} />
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  todayTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todayDay: { ...typography.caption, color: colors.onAccentMuted, fontWeight: '700' },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  switchText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  todayTitle: { ...typography.title, color: colors.white, marginTop: spacing.md },
  todayMeta: { ...typography.body, color: colors.onAccentMuted, marginTop: 4 },
  heroActions: { gap: spacing.sm, marginTop: spacing.lg },
  aiRefreshCard: { marginTop: spacing.md },
  aiRefreshHead: { flexDirection: 'row', gap: spacing.md },
  aiRefreshIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  aiRefreshCopy: { flex: 1 },
  aiRefreshKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  aiRefreshTitle: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  aiRefreshText: { ...typography.caption, color: colors.inkMuted, marginTop: 4, lineHeight: 18 },
  aiRefreshMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  aiRefreshButton: { marginTop: spacing.md },
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  switchSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  refreshSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  refreshSheetTitleWrap: { flex: 1 },
  sheetKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  sheetTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  refreshIntro: { ...typography.caption, color: colors.inkMuted, marginTop: 4, lineHeight: 18 },
  refreshForm: { paddingBottom: spacing.lg },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  switchList: { gap: spacing.sm, paddingBottom: spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  switchRowSelected: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  switchDayBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelMuted,
  },
  switchDayBadgeSelected: { backgroundColor: colors.accent },
  switchDayText: { ...typography.bodyBold, color: colors.accentDark },
  switchRowText: { flex: 1 },
  switchRowTitle: { ...typography.bodyBold, color: colors.ink },
  switchRowMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
