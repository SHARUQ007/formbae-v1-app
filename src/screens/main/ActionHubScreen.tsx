import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { LoadingState } from '../../components/States';
import { resolveContextualSnapshot, workoutTitle, type ContextualSnapshot } from '../../utils/contextualAction';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = BottomTabScreenProps<MainTabParamList, 'Action'>;

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
          <Text style={styles.kicker}>Now</Text>
          <Text style={styles.title}>Most relevant</Text>
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={openTarget} style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>{snapshot.target.detail}</Text>
            <Text style={styles.heroTitle}>
              {targetTitle(snapshot)}
            </Text>
            <Text style={styles.heroMeta}>{targetMeta(snapshot)}</Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>{targetCta(snapshot)}</Text>
              <Feather name="arrow-right" size={18} color={colors.white} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonTitle}>Why this</Text>
          <Text style={styles.reasonText}>{targetReason(snapshot)}</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function targetTitle(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return workoutTitle(target.day);
  if (target.kind === 'diet') return `Log ${target.mealType}`;
  if (target.kind === 'refresh') return 'Build your next plan';
  return 'Review progress';
}

function targetMeta(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return `Day ${target.day?.dayNumber || '-'} · ${target.day?.exercises?.length || 0} moves`;
  if (target.kind === 'diet') return 'Food memory is ready when you are';
  if (target.kind === 'refresh') return 'Ava has a two-week update ready';
  return 'Check trends, streaks and body logs';
}

function targetReason(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return 'Your next incomplete workout is the clearest action to move the plan forward.';
  if (target.kind === 'diet') return `It is ${target.mealType.toLowerCase()} time and this meal is not logged yet.`;
  if (target.kind === 'refresh') return 'Your current block is ready for a fresh plan based on the latest check-in.';
  return 'No urgent action is due, so the best next step is to review your progress.';
}

function targetCta(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return 'Open workout';
  if (target.kind === 'diet') return 'Start food memory';
  if (target.kind === 'refresh') return 'Answer check-in';
  return 'Open progress';
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  header: { marginTop: spacing.sm },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  title: { ...typography.hero, color: colors.ink, marginTop: spacing.xs },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.black,
    padding: spacing.lg,
    ...shadows.accent,
  },
  heroCopy: { flex: 1 },
  heroLabel: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  heroTitle: { ...typography.title, color: colors.white, marginTop: spacing.xs },
  heroMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: spacing.xs },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  heroCtaText: { ...typography.button, color: colors.white },
  reasonCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 24,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  reasonTitle: { ...typography.bodyBold, color: colors.ink },
  reasonText: { ...typography.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 18 },
});
