import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet, RefreshControl, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GradientHero } from '../../components/GradientHero';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { ProgressBar } from '../../components/ProgressBar';
import { StatTile } from '../../components/StatTile';
import { LoadingState } from '../../components/States';
import { fetchToday } from '../../services/workoutService';
import { fetchCheckIns } from '../../services/checkInService';
import { flushWorkoutQueue } from '../../store/workoutStore';
import { useAuthStore } from '../../store/authStore';
import type { TodayPayload } from '../../types/api';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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
        <LoadingState message="Loading your dashboard…" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
          <Avatar name={status?.name} size={46} />
        </View>

        {error ? (
          <Card variant="outline" style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <PrimaryButton title="Retry" icon="refresh-cw" variant="secondary" onPress={load} style={styles.errorBtn} />
          </Card>
        ) : null}

        {checkInDue ? (
          <Card variant="accent" style={styles.reminder} onPress={() => navigation.navigate('Progress')}>
            <View style={styles.reminderRow}>
              <Feather name="edit-3" size={20} color={colors.accentDark} />
              <Text style={styles.reminderText}>Weekly check-in due — share how your week went.</Text>
              <Feather name="chevron-right" size={20} color={colors.accentDark} />
            </View>
          </Card>
        ) : null}

        <GradientHero eyebrow="Today's workout">
          <Text style={styles.heroTitle}>{todayDay?.focus || data?.plan?.title || 'Your plan is being prepared'}</Text>
          <Text style={styles.heroMeta}>{todayDay?.exercises?.length || 0} exercises</Text>
          <PrimaryButton
            title={todayDay ? 'Start workout' : 'View plan'}
            icon={todayDay ? 'play' : 'list'}
            variant="secondary"
            onPress={() =>
              todayDay
                ? navigation.navigate('Workouts', { screen: 'WorkoutDetail', params: { planDayId: todayDay.planDayId, title: todayDay.focus } } as never)
                : navigation.navigate('Workouts')
            }
            style={styles.heroBtn}
          />
        </GradientHero>

        <SectionTitle>Your trainer</SectionTitle>
        {data?.assignedTrainer ? (
          <Card onPress={() => navigation.navigate('Trainer')}>
            <View style={styles.trainerRow}>
              <Avatar name={data.assignedTrainer.name} size={52} />
              <View style={styles.trainerText}>
                <Text style={styles.trainerName}>{data.assignedTrainer.name}</Text>
                <Text style={styles.trainerDesc} numberOfLines={2}>
                  {data.assignedTrainer.trainerDescription || 'Human online personal trainer'}
                </Text>
              </View>
              <Feather name="message-circle" size={22} color={colors.accent} />
            </View>
          </Card>
        ) : (
          <Card variant="flat">
            <View style={styles.matchingRow}>
              <Feather name="search" size={20} color={colors.inkMuted} />
              <Text style={styles.matchingText}>We are matching you with the right coach. You&apos;ll see them here soon.</Text>
            </View>
          </Card>
        )}

        {progress ? (
          <>
            <SectionTitle>This week</SectionTitle>
            <Card>
              <View style={styles.progressHead}>
                <Text style={styles.progressPct}>{progress.adherencePct}%</Text>
                <Badge label="Adherence" tone="accent" />
              </View>
              <ProgressBar value={progress.adherencePct / 100} />
              <View style={styles.statsRow}>
                <StatTile icon="check-circle" value={`${progress.completed}/${progress.planned}`} label="Workouts" />
                <StatTile icon="zap" value={`${progress.currentStreak}`} label="Day streak" />
              </View>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  greeting: { ...typography.caption, color: colors.inkMuted },
  name: { ...typography.hero, color: colors.ink },
  errorCard: { marginBottom: spacing.md },
  errorText: { ...typography.body, color: colors.error },
  errorBtn: { marginTop: spacing.sm },
  reminder: { marginBottom: spacing.md },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reminderText: { ...typography.bodyBold, color: colors.accentDarker, flex: 1 },
  heroTitle: { ...typography.title, color: colors.white, marginTop: 4 },
  heroMeta: { ...typography.body, color: colors.onAccentMuted, marginTop: 4 },
  heroBtn: { marginTop: spacing.md },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trainerText: { flex: 1 },
  trainerName: { ...typography.subtitle, color: colors.ink },
  trainerDesc: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  matchingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  matchingText: { ...typography.body, color: colors.inkMuted, flex: 1 },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  progressPct: { ...typography.display, color: colors.ink },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
