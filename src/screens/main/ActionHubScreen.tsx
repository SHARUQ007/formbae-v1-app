import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer } from '../../components/Card';
import { LoadingState } from '../../components/States';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { resolveContextualSnapshot, workoutTitle, type ContextualSnapshot } from '../../utils/contextualAction';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = BottomTabScreenProps<MainTabParamList, 'Action'>;

function formatPercent(value?: number) {
  return `${Math.max(0, Math.min(100, Math.round(Number(value || 0))))}%`;
}

export function ActionHubScreen({ navigation }: Props) {
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

  const progress = snapshot?.workoutData?.today?.progress;
  const plan = snapshot?.workoutData?.plan || snapshot?.workoutData?.today?.plan;
  const day = snapshot?.target.kind === 'workout' ? snapshot.target.day : undefined;
  const completed = Number(progress?.completed || 0);
  const streak = Number(progress?.currentStreak || 0);
  const points = completed * 25 + streak * 10;
  const adherence = Number(progress?.adherencePct || 0);
  const todayMealCount = useMemo(
    () => (snapshot?.dietEntries || []).filter((entry) => new Date(entry.createdAt).toDateString() === new Date().toDateString()).length,
    [snapshot?.dietEntries],
  );

  const openTarget = () => {
    if (!snapshot) return;
    const target = snapshot.target;
    if (target.kind === 'diet') {
      navigation.navigate('Diet', { action: 'camera', requestId: Date.now(), mealType: target.mealType });
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

  if (!snapshot) {
    return (
      <ScreenContainer>
        <LoadingState message="Preparing today..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Today</Text>
          <Text style={styles.title}>Your next best move</Text>
          <Text style={styles.subtitle}>Workout, meals, progress and plan updates in one place.</Text>
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={openTarget} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name={snapshot.target.icon} size={30} color={colors.black} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>{snapshot.target.detail}</Text>
            <Text style={styles.heroTitle}>
              {snapshot.target.kind === 'workout' ? workoutTitle(day) : snapshot.target.label}
            </Text>
            <Text style={styles.heroMeta}>
              {snapshot.target.kind === 'workout'
                ? `Day ${day?.dayNumber || '-'} · ${day?.exercises?.length || 0} moves`
                : snapshot.target.kind === 'diet'
                  ? 'Add a photo or text meal log'
                  : snapshot.target.kind === 'refresh'
                    ? 'Build the next two-week plan'
                    : 'Review your progress'}
            </Text>
          </View>
          <Feather name="arrow-right" size={24} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.metricsGrid}>
          <Metric icon="zap" label="Points" value={`${points}`} />
          <Metric icon="award" label="Streak" value={`${streak}d`} />
          <Metric icon="target" label="Adherence" value={formatPercent(adherence)} />
          <Metric icon="coffee" label="Meals today" value={`${todayMealCount}`} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <MaterialCommunityIcon name="chart-timeline-variant" size={22} color={colors.accent} />
            <Text style={styles.cardTitle}>Session progress</Text>
          </View>
          <ProgressBar value={adherence / 100} height={10} />
          <Text style={styles.cardText}>
            {completed}/{progress?.planned || plan?.days?.length || 0} planned days complete.
          </Text>
        </View>

        <View style={styles.quickGrid}>
          <QuickAction icon="activity" label="Workout" onPress={() => navigation.navigate('Workouts', { screen: 'WorkoutList' })} />
          <QuickAction icon="camera" label="Log meal" onPress={() => navigation.navigate('Diet', { action: 'camera', requestId: Date.now() })} />
          <QuickAction icon="bar-chart-2" label="Progress" onPress={() => navigation.navigate('Progress')} />
          <QuickAction icon="user" label="Profile" onPress={() => navigation.navigate('Profile', { screen: 'ProfileMain' })} />
        </View>

        <PrimaryButton title="Open relevant action" icon="arrow-right" onPress={openTarget} size="lg" />
      </ScrollView>
    </ScreenContainer>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Feather name={icon} size={20} color={colors.accent} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.quickAction}>
      <Feather name={icon} size={20} color={colors.accent} />
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  header: { marginTop: spacing.sm },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  title: { ...typography.hero, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.black,
    padding: spacing.lg,
    ...shadows.accent,
  },
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroLabel: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  heroTitle: { ...typography.title, color: colors.white, marginTop: spacing.xs },
  heroMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: spacing.xs },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    width: '48%',
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  metricValue: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
  metricLabel: { ...typography.caption, color: colors.inkMuted },
  card: {
    borderRadius: 24,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.subtitle, color: colors.ink },
  cardText: { ...typography.caption, color: colors.inkMuted },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '48%',
    minHeight: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickLabel: { ...typography.button, color: colors.ink },
});
