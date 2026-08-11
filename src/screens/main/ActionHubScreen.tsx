import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { LoadingState } from '../../components/States';
import { fetchAccountability, updateAccountability } from '../../services/accountabilityService';
import { cancelAccountabilityReminder, scheduleAccountabilityReminder } from '../../services/notificationService';
import type { AccountabilitySummary } from '../../types/api';
import {
  currentMealType,
  isToday,
  nextPlanDay,
  resolveContextualSnapshot,
  workoutTitle,
  type ContextualSnapshot,
} from '../../utils/contextualAction';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = BottomTabScreenProps<MainTabParamList, 'Action'>;

export function ActionHubScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [snapshot, setSnapshot] = useState<ContextualSnapshot | null>(null);
  const [accountability, setAccountability] = useState<AccountabilitySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCommitment, setSavingCommitment] = useState(false);
  const autoCompletedDate = useRef('');

  const load = useCallback(async () => {
    const [nextSnapshot, nextAccountability] = await Promise.all([
      resolveContextualSnapshot(),
      fetchAccountability().catch(() => null),
    ]);
    setSnapshot(nextSnapshot);
    setAccountability(nextAccountability);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    const commitment = accountability?.today;
    if (!snapshot || !commitment || commitment.status !== 'active' || savingCommitment || autoCompletedDate.current === commitment.date || !commitmentMet(commitment.targetKind, commitment.targetId, snapshot)) return;
    autoCompletedDate.current = commitment.date;
    setSavingCommitment(true);
    updateAccountability({ action: 'complete' })
      .then((next) => {
        setAccountability(next);
        cancelAccountabilityReminder().catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => setSavingCommitment(false));
  }, [accountability?.today, savingCommitment, snapshot]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openTarget = () => {
    if (!snapshot) return;
    const target = snapshot.target;
    if (target.kind === 'diet') {
      navigation.navigate('Diet', { mealType: target.mealType });
      return;
    }
    if (target.kind === 'workout') {
      if (target.day?.planDayId) {
        navigation.navigate('Workouts', {
          screen: 'WorkoutSummary',
          params: { planDayId: target.day.planDayId, title: workoutTitle(target.day), mode: 'standard' },
        });
        return;
      }
      navigation.navigate('Workouts', { screen: 'WorkoutList' });
      return;
    }
    if (target.kind === 'refresh') {
      navigation.navigate('Workouts', { screen: 'PlanRefresh' });
      return;
    }
    navigation.navigate('Progress');
  };

  const openWorkout = () => {
    if (!snapshot) return;
    const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
    const day = nextPlanDay(plan);
    if (day?.planDayId) {
      navigation.navigate('Workouts', {
        screen: 'WorkoutSummary',
        params: { planDayId: day.planDayId, title: workoutTitle(day), mode: 'standard' },
      });
      return;
    }
    navigation.navigate('Workouts', { screen: 'WorkoutList' });
  };

  const openFoodMemory = () => {
    navigation.navigate('Diet', { mealType: currentMealType() });
  };

  const openCommitment = () => {
    const commitment = accountability?.today;
    if (!commitment || !snapshot) return openTarget();
    if (commitment.targetKind === 'diet') {
      navigation.navigate('Diet', { mealType: commitment.targetId as ReturnType<typeof currentMealType> });
      return;
    }
    if (commitment.targetKind === 'workout') {
      const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
      const day = plan?.days?.find((item) => item.planDayId === commitment.targetId);
      if (day) {
        navigation.navigate('Workouts', { screen: 'WorkoutSummary', params: { planDayId: day.planDayId, title: workoutTitle(day), mode: 'standard' } });
        return;
      }
    }
    openTarget();
  };

  const commitForToday = async () => {
    if (!snapshot || savingCommitment) return;
    setSavingCommitment(true);
    try {
      const target = snapshot.target;
      const targetId = target.kind === 'workout' ? target.day?.planDayId || '' : target.kind === 'diet' ? target.mealType : target.kind;
      const title = targetTitle(snapshot);
      const next = await updateAccountability({ action: 'commit', targetKind: target.kind, targetId, title });
      setAccountability(next);
      scheduleAccountabilityReminder(title).catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not save commitment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingCommitment(false);
    }
  };

  const completeCommitment = async () => {
    if (savingCommitment) return;
    setSavingCommitment(true);
    try {
      const next = await updateAccountability({ action: 'complete' });
      setAccountability(next);
      cancelAccountabilityReminder().catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not update commitment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingCommitment(false);
    }
  };

  if (!snapshot) {
    return (
      <ScreenContainer>
        <LoadingState message="Preparing today..." />
      </ScreenContainer>
    );
  }

  const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
  const planDays = plan?.days || [];
  const completedDays = planDays.filter((day) => day.completed).length;
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const quickActions = [
    {
      kind: 'workout',
      icon: 'activity',
      title: 'Workout plan',
      body: nextPlanDay(plan) ? 'Open your next planned session' : 'Review your training schedule',
      onPress: openWorkout,
    },
    {
      kind: 'diet',
      icon: 'edit-3',
      title: 'Food memory',
      body: `Add ${currentMealType().toLowerCase()} while it is fresh`,
      onPress: openFoodMemory,
    },
    {
      kind: 'progress',
      icon: 'bar-chart-2',
      title: 'Progress',
      body: 'View consistency, streaks, and trends',
      onPress: () => navigation.navigate('Progress'),
    },
  ].filter((action) => action.kind !== snapshot.target.kind);
  const commitment = accountability?.today;
  const commitmentComplete = commitment?.status === 'completed';

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>{dateLabel}</Text>
          <Text style={styles.title}>Accountability</Text>
          <Text style={styles.subtitle}>One clear promise. Follow through today.</Text>
        </View>

        <View style={[styles.hero, commitmentComplete && styles.heroComplete]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Feather name={commitmentComplete ? 'check' : commitment ? 'shield' : snapshot.target.icon} size={22} color={commitmentComplete ? colors.onPrimary : colors.inkStrong} />
            </View>
            <View style={styles.recommendedPill}>
              <View style={[styles.recommendedDot, commitmentComplete && styles.recommendedDotComplete]} />
              <Text style={styles.recommendedText}>{commitmentComplete ? 'Promise kept' : commitment ? 'Committed' : 'Recommended'}</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>Today's commitment</Text>
          <Text style={styles.heroTitle}>{commitment?.title || targetTitle(snapshot)}</Text>
          <Text style={styles.heroMeta}>{commitmentComplete ? 'You followed through. That is how consistency gets built.' : commitment ? 'Your reminder is set. Do it now or mark it complete when you finish.' : targetMeta(snapshot)}</Text>
          {commitmentComplete ? (
            <View style={styles.keptRow}><Feather name="zap" size={18} color={colors.gold} /><Text style={styles.keptText}>{accountability?.streak || 1} day accountability streak</Text></View>
          ) : commitment ? (
            <View style={styles.commitmentActions}>
              <TouchableOpacity onPress={openCommitment} style={styles.heroCta} accessibilityRole="button"><Text style={styles.heroCtaText}>Do it now</Text><Feather name="arrow-right" size={19} color={colors.onPrimary} /></TouchableOpacity>
              <TouchableOpacity onPress={completeCommitment} style={styles.markDoneButton} accessibilityRole="button" disabled={savingCommitment}>
                {savingCommitment ? <ActivityIndicator size="small" color={colors.gold} /> : <><Feather name="check" size={17} color={colors.gold} /><Text style={styles.markDoneText}>Mark as done</Text></>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={commitForToday} style={styles.heroCta} accessibilityRole="button" disabled={savingCommitment}>
              {savingCommitment ? <ActivityIndicator color={colors.onPrimary} /> : <><Text style={styles.heroCtaText}>Commit for today</Text><Feather name="shield" size={19} color={colors.onPrimary} /></>}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.reasonCard}>
          <View style={styles.reasonIcon}>
            <Feather name="zap" size={17} color={colors.goldMuted} />
          </View>
          <View style={styles.reasonCopy}>
            <Text style={styles.reasonTitle}>{commitment ? 'Your accountability rule' : 'Why this commitment'}</Text>
            <Text style={styles.reasonText}>{commitment ? 'Keep the promise small and specific. Completing it today extends your accountability streak.' : targetReason(snapshot)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.snapshotGrid}>
            <SnapshotStat icon="shield" label="Promises kept" value={`${accountability?.keptCount || 0} total`} />
            <SnapshotStat icon="zap" label="Accountability" value={`${accountability?.streak || 0} day streak`} />
            <SnapshotStat
              icon="check-circle"
              label="Plan progress"
              value={planDays.length ? `${completedDays} of ${planDays.length} days` : 'Plan loading'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          <View style={styles.quickList}>
            {quickActions.map((action) => (
              <QuickAction key={action.kind} icon={action.icon} title={action.title} body={action.body} onPress={action.onPress} />
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function commitmentMet(kind: string, targetId: string, snapshot: ContextualSnapshot) {
  if (kind === 'diet') {
    return snapshot.dietEntries.some((entry) => isToday(entry.createdAt) && entry.mealType === targetId);
  }
  if (kind === 'workout') {
    const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
    return Boolean(plan?.days?.find((day) => day.planDayId === targetId)?.completed);
  }
  return false;
}

function SnapshotStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.snapshotCard}>
      <Feather name={icon} size={18} color={colors.inkMuted} />
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      style={styles.quickAction}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={styles.quickIcon}>
        <Feather name={icon} size={19} color={colors.ink} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={styles.quickBody}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
    </TouchableOpacity>
  );
}

function targetTitle(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return workoutTitle(target.day);
  if (target.kind === 'diet') return `Log ${target.mealType.toLowerCase()}`;
  if (target.kind === 'refresh') return 'Build your next plan';
  return 'Review progress';
}

function targetMeta(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return `Day ${target.day?.dayNumber || '-'} · ${target.day?.exercises?.length || 0} exercises`;
  if (target.kind === 'diet') return 'Capture what you ate while the details are still fresh.';
  if (target.kind === 'refresh') return 'Use your latest check-in to shape the next two weeks.';
  return 'See your consistency, streaks, and body trends in one place.';
}

function targetReason(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return 'This is the next incomplete session in your plan.';
  if (target.kind === 'diet') return `${target.mealType} is the current meal and has not been logged.`;
  if (target.kind === 'refresh') return 'Your current training block is ready for its next check-in.';
  return 'Nothing is overdue. Review your current training trend.';
}

const styles = StyleSheet.create({
  scroll: {},
  header: { marginTop: spacing.sm },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  title: { ...typography.hero, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs, maxWidth: 320 },
  hero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  heroComplete: { borderColor: colors.accentSurface, backgroundColor: colors.panelWarm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedPill: {
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendedDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  recommendedDotComplete: { backgroundColor: colors.success },
  recommendedText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  heroLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase', marginTop: spacing.lg },
  heroTitle: { ...typography.hero, color: colors.inkStrong, marginTop: spacing.xs },
  heroMeta: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 22 },
  heroCta: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    borderWidth: 1,
    borderColor: colors.primaryAction,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  heroCtaText: { ...typography.button, color: colors.onPrimary },
  commitmentActions: { gap: spacing.sm },
  markDoneButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  markDoneText: { ...typography.bodyBold, color: colors.gold },
  keptRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.accentSurface, marginTop: spacing.lg },
  keptText: { ...typography.bodyBold, color: colors.ink },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.goldMuted,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  reasonIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonCopy: { flex: 1 },
  reasonTitle: { ...typography.bodyBold, color: colors.ink },
  reasonText: { ...typography.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 18 },
  section: { marginTop: spacing.xl },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, marginBottom: spacing.sm },
  snapshotGrid: { flexDirection: 'row', gap: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  snapshotCard: {
    flex: 1,
    minHeight: 112,
    padding: spacing.md,
  },
  snapshotLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
  snapshotValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  quickList: {},
  quickAction: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quickIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCopy: { flex: 1 },
  quickTitle: { ...typography.bodyBold, color: colors.ink },
  quickBody: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
