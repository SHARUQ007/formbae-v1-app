import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { HistoryArrow, HistoryMotif, WorkoutHistoryArtwork } from '../../components/WorkoutHistoryArtwork';
import { WorkoutHistoryHeader, WorkoutHistorySessionCard } from '../../components/WorkoutHistorySessionCard';
import { WorkoutSessionArtwork } from '../../components/WorkoutSessionArtwork';
import { WorkoutHistoryCalendar } from '../../components/WorkoutHistoryCalendar';
import { ScreenContainer } from '../../components/Card';
import { CoachingFeature } from '../../components/CoachingFeature';
import { loadProgressBundleCached, loadTrophyLeaderboardCached, peekProgressBundleCached, peekTrophyLeaderboardCached } from '../../services/preloadService';
import { getActiveCacheSessionId } from '../../services/appCache';
import type { ProgressSummary, TrophyLeaderboard, WorkoutHistoryEntry } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { workoutHistoryStats, historySessionKey } from '../../utils/workoutHistory';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

const parseDate = (date: string) => new Date(`${date}T12:00:00`);
const RECENT_WORKOUT_LIMIT = 5;

type WorkoutGroupProps = { date: string; workouts: WorkoutHistoryEntry[]; onOpen: (session: WorkoutHistoryEntry) => void };
const WorkoutGroup = memo(function WorkoutGroupRow({ date, workouts, onOpen }: WorkoutGroupProps) {
  return <View style={styles.workoutGroup}>
    <View style={styles.dateHeading}>
      <Text style={styles.groupDate}>{parseDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
      <View style={styles.dateLine} />
      {workouts.length > 1 ? <Text style={styles.groupCount}>{workouts.length} sessions</Text> : null}
    </View>
    {workouts.map(workout => <WorkoutHistorySessionCard key={historySessionKey(workout)} session={workout} onOpen={onOpen} />)}
  </View>;
});

export function WorkoutHistoryScreen({ navigation }: NativeStackScreenProps<WorkoutStackParamList, 'WorkoutHistory'>) {
  const [progress, setProgress] = useState<ProgressSummary | null>(() => peekProgressBundleCached()?.progress ?? null);
  const [community, setCommunity] = useState<TrophyLeaderboard | null>(() => peekTrophyLeaderboardCached() ?? null);
  const [loading, setLoading] = useState(!progress);
  const [error, setError] = useState(false);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const requestVersion = useRef(0);
  const tabHeight = useBottomTabBarHeight();
  const { width, fontScale } = useWindowDimensions();
  const artworkSize = width < 360 || fontScale >= 1.3 ? 88 : 108;
  const load = useCallback((force = false) => {
    const version = ++requestVersion.current;
    const session = getActiveCacheSessionId();
    const current = () => version === requestVersion.current && session === getActiveCacheSessionId();
    setLoading(force || !peekProgressBundleCached());
    // History is useful on its own; optional rankings must not hold it back.
    loadProgressBundleCached({ force }).then(bundle => {
      if (!current()) return;
      setProgress(bundle.progress);
      setError(false);
    }).catch(() => { if (current()) setError(true); })
      .finally(() => { if (current()) setLoading(false); });
    loadTrophyLeaderboardCached({ force }).then(people => {
      if (current()) setCommunity(people);
    }).catch(() => { if (current()) setCommunity(null); });
  }, []);
  const refresh = useCallback(() => load(true), [load]);
  useFocusEffect(useCallback(() => {
    load();
    return () => { requestVersion.current++; };
  }, [load]));
  const history = useMemo(() => progress?.completionHistory ?? [], [progress]);
  const stats = useMemo(() => workoutHistoryStats(history), [history]);
  const orderedHistory = useMemo(() => [...history].sort((a, b) => b.date.localeCompare(a.date)), [history]);
  const hasMoreWorkouts = history.length > RECENT_WORKOUT_LIMIT && !showAllWorkouts;
  const previousWorkouts = useMemo(() => {
    const groups = new Map<string, WorkoutHistoryEntry[]>();
    // Limit sessions before grouping: two workouts on one date still count as two.
    const visible = showAllWorkouts ? orderedHistory : orderedHistory.slice(0, RECENT_WORKOUT_LIMIT);
    for (const workout of visible) {
      const group = groups.get(workout.date) ?? [];
      group.push(workout);
      groups.set(workout.date, group);
    }
    return [...groups.entries()];
  }, [orderedHistory, showAllWorkouts]);
  const openSession = useCallback((session: WorkoutHistoryEntry) => navigation.navigate('WorkoutHistoryDetail', { session }), [navigation]);
  const renderWorkoutGroup = useCallback(({ item: [date, workouts] }: { item: [string, WorkoutHistoryEntry[]] }) => <WorkoutGroup date={date} workouts={workouts} onOpen={openSession} />, [openSession]);

  return <ScreenContainer>
    <WorkoutHistoryHeader title="Workout history" subtitle="Every session counts." onBack={() => navigation.goBack()} backLabel="Back to workouts" />
    <FlatList
      data={progress ? previousWorkouts : []}
      keyExtractor={item => item[0]}
      initialNumToRender={10}
      showsVerticalScrollIndicator={false}
      renderItem={renderWorkoutGroup}
      contentContainerStyle={{ paddingBottom: tabHeight + 24 }}
      refreshControl={<RefreshControl refreshing={loading && !!progress} onRefresh={refresh} tintColor={colors.gold} />}
      ListHeaderComponent={<View>
        {loading && !progress ? <View style={styles.loading}><ActivityIndicator color={colors.gold} /><Text style={styles.caption}>Loading your training log…</Text></View> : null}
        {error ? <View style={styles.error}><Text style={styles.caption}>{progress ? 'Couldn’t refresh your history.' : 'Couldn’t load your workout history.'}</Text><TouchableOpacity onPress={refresh} style={styles.textButton} accessibilityRole="button"><Text style={styles.detailLink}>Try again</Text></TouchableOpacity></View> : null}
        {progress ? <>
          <View style={styles.overview}>
            <View style={styles.overviewTop}>
              <View style={styles.total}>
                <Text style={styles.eyebrow}>YOUR TRAINING LOG</Text>
                <Text style={styles.totalNumber}>{history.length}</Text>
                <Text style={styles.totalLabel}>{history.length === 1 ? 'workout completed' : 'workouts completed'}</Text>
                {stats.first ? <Text style={styles.since}>Since {parseDate(stats.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text> : null}
              </View>
              <WorkoutHistoryArtwork width={artworkSize} height={artworkSize} />
            </View>
            <View style={styles.stats}>
              {([[progress.currentStreak, 'Day streak', 'streak'], [progress.bestStreak, 'Best streak', 'record'], [stats.days, 'Training days', 'calendar']] as const).map(([value, label, kind], index) => <View key={label} style={[styles.stat, index > 0 && styles.statBorder]}>
                <View style={styles.statTop}><HistoryMotif kind={kind} size={28} /><Text style={styles.statValue}>{value}</Text></View>
                <Text style={styles.statLabel}>{label}</Text>
              </View>)}
            </View>
          </View>
          <WorkoutHistoryCalendar history={history} onOpenSession={openSession} />
          <View style={styles.listHeading}><Text style={styles.sectionTitle}>Previous workouts</Text><Text style={styles.caption}>{hasMoreWorkouts ? 'Latest 5' : 'Latest first'}</Text></View>
          {!previousWorkouts.length ? <View style={styles.empty}><WorkoutSessionArtwork kind="begin" size={68} /><Text style={styles.emptyTitle}>Your log starts here.</Text><Text style={styles.caption}>Completed workouts will appear here with the exercises and muscle groups you trained.</Text></View> : null}
        </> : null}
      </View>}
      ListFooterComponent={<View>
        {progress && hasMoreWorkouts ? <TouchableOpacity style={styles.viewAll} onPress={() => setShowAllWorkouts(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`View all ${history.length} workouts`} accessibilityHint="Shows your full workout history, latest first">
          <Text style={styles.viewAllText}>View all {history.length} workouts</Text><HistoryArrow size={18} color={colors.gold} />
        </TouchableOpacity> : null}
        {progress && history.length ? <View style={styles.footer}>
          <View style={styles.insightHeading}><WorkoutSessionArtwork kind="logged" size={42} /><View><Text style={styles.eyebrow}>FROM YOUR LOG</Text><Text style={styles.insightTitle}>Your training rhythm</Text></View></View>
          <View style={styles.insightRow}><Text style={styles.caption}>Most active day</Text><Text style={styles.insightValue}>{stats.favouriteDay}</Text></View>
          <View style={styles.insightRow}><Text style={styles.caption}>Quick sessions</Text><Text style={styles.insightValue}>{stats.quick}</Text></View>
          {community && community.participantCount > 1 ? <View style={styles.community}>
            <Text style={styles.caption}>{community.participantCount} people on your leaderboard</Text>
            {community.currentUser ? <Text style={styles.insightValue}>Your rank #{community.currentUser.rank} · {community.currentUser.score} trophies</Text> : null}
          </View> : null}
          <Text style={styles.footnote}>Streaks count consecutive workout days.</Text>
        </View> : null}
        <CoachingFeature showHeader={false} onPress={() => navigation.navigate('Coach', { initialView: 'browse' })} />
      </View>}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  overview: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, marginBottom: 16, overflow: 'hidden' },
  overviewTop: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 4 }, total: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.overline, fontSize: 9, letterSpacing: 1.5, color: colors.goldMuted },
  totalNumber: { fontSize: 48, lineHeight: 56, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], color: colors.ink, marginTop: 6 },
  totalLabel: { ...typography.label, color: colors.ink }, since: { ...typography.caption, fontSize: 10, color: colors.inkMuted, marginTop: 5 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, paddingVertical: 14 },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 10, gap: 6, alignItems: 'center' }, statBorder: { borderLeftWidth: 1, borderColor: colors.border },
  statTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }, statLabel: { ...typography.caption, fontSize: 10, textAlign: 'center', color: colors.inkMuted },
  listHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 26, paddingBottom: 18 }, sectionTitle: { ...typography.title, fontSize: 19, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted },
  workoutGroup: { gap: 10, paddingBottom: 22 }, dateHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }, groupDate: { ...typography.caption, color: colors.inkMuted }, dateLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, groupCount: { ...typography.caption, fontSize: 10, color: colors.inkSubtle },
  detailLink: { ...typography.caption, color: colors.gold },
  viewAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.panel },
  viewAllText: { ...typography.label, color: colors.gold, flexShrink: 1 },
  footer: { backgroundColor: colors.panel, borderWidth: 1, borderRadius: radius.xl, borderColor: colors.border, padding: 18, marginTop: 4, gap: 14 },
  insightHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, insightTitle: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  insightRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, insightValue: { ...typography.bodyBold, fontSize: 13, color: colors.ink }, footnote: { ...typography.caption, fontSize: 10, color: colors.inkSubtle }, community: { gap: 6, paddingTop: 6 },
  empty: { backgroundColor: colors.panel, borderRadius: radius.xl, padding: 20, alignItems: 'center', gap: 8 }, emptyTitle: { ...typography.subtitle, color: colors.ink },
  error: { paddingVertical: 16, gap: 8 }, textButton: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }, loading: { paddingVertical: 60, alignItems: 'center', gap: 12 },
});
