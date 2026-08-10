import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { LoadingState } from '../../components/States';
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
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setSnapshot(await resolveContextualSnapshot());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
  const foodLogsToday = snapshot.dietEntries.filter((entry) => isToday(entry.createdAt)).length;
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

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>{dateLabel}</Text>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>Your plan, food log, and next action.</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={openTarget}
          style={styles.hero}
          accessibilityRole="button"
          accessibilityLabel={`${targetCta(snapshot)}. ${targetMeta(snapshot)}`}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Feather name={snapshot.target.icon} size={22} color={colors.inkStrong} />
            </View>
            <View style={styles.recommendedPill}>
              <View style={styles.recommendedDot} />
              <Text style={styles.recommendedText}>Up next</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>{snapshot.target.detail}</Text>
          <Text style={styles.heroTitle}>{targetTitle(snapshot)}</Text>
          <Text style={styles.heroMeta}>{targetMeta(snapshot)}</Text>
          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>{targetCta(snapshot)}</Text>
            <Feather name="arrow-right" size={19} color={colors.onPrimary} />
          </View>
        </TouchableOpacity>

        <View style={styles.reasonCard}>
          <View style={styles.reasonIcon}>
            <Feather name="zap" size={17} color={colors.goldMuted} />
          </View>
          <View style={styles.reasonCopy}>
            <Text style={styles.reasonTitle}>Why this is next</Text>
            <Text style={styles.reasonText}>{targetReason(snapshot)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.snapshotGrid}>
            <SnapshotStat icon="edit-3" label="Food logs" value={`${foodLogsToday} today`} />
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

function targetCta(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return 'Open workout';
  if (target.kind === 'diet') return `Log ${target.mealType.toLowerCase()}`;
  if (target.kind === 'refresh') return 'Answer check-in';
  return 'Open progress';
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
