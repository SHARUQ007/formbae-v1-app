import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { WorkoutHistoryArtwork } from '../../components/WorkoutHistoryArtwork';
import { WorkoutHistoryCalendar } from '../../components/WorkoutHistoryCalendar';
import { ScreenContainer } from '../../components/Card';
import { fetchProgress, fetchTrophyLeaderboard } from '../../services/progressService';
import type { ProgressSummary, TrophyLeaderboard, WorkoutHistoryEntry } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { workoutHistoryStats, historyWorkoutTitle, historyWorkoutSummary, historyExercisePreview, historyMuscleGroups, historySessionKey } from '../../utils/workoutHistory';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const parseDate = (date: string) => new Date(`${date}T12:00:00`);

type WorkoutGroupProps = { date: string; workouts: WorkoutHistoryEntry[]; onOpen: (session: WorkoutHistoryEntry) => void };
function WorkoutGroup({ date, workouts, onOpen }: WorkoutGroupProps) {
  const day = parseDate(date);
  return <View style={styles.workoutGroup}>
    <View style={styles.dateColumn}>
      <Text style={styles.dateNumber}>{day.getDate()}</Text>
      <Text style={styles.dateMonth}>{day.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</Text>
      <Text style={styles.dateYear}>{day.getFullYear()}</Text>
    </View>
    <View style={styles.entries}>
      {workouts.map((workout, index) => <TouchableOpacity
        key={historySessionKey(workout)}
        style={[styles.entry, index > 0 && styles.entryDivider]}
        onPress={() => onOpen(workout)}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityLabel={`View ${historyWorkoutTitle(workout)}, ${date}`}
      >
        <View style={styles.entryTop}>
          <Text style={styles.weekday}>{day.toLocaleDateString('en-GB', { weekday: 'long' })}</Text>
          {workout.workoutMode === 'quick' ? <Text style={styles.quickLabel}>QUICK</Text> : null}
        </View>
        <Text style={styles.workoutTitle}>{historyWorkoutTitle(workout)}</Text>
        {historyMuscleGroups(workout).length ? <Text style={styles.muscles} numberOfLines={2}>{historyMuscleGroups(workout).join(' / ')}</Text> : null}
        {historyExercisePreview(workout) ? <Text style={styles.preview} numberOfLines={2}>{historyExercisePreview(workout)}</Text> : null}
        <View style={styles.entryBottom}>
          <Text style={styles.summary}>{historyWorkoutSummary(workout)}</Text>
          <Text style={styles.detailLink}>Details</Text>
        </View>
      </TouchableOpacity>)}
    </View>
  </View>;
}

export function WorkoutHistoryScreen({ navigation }: NativeStackScreenProps<WorkoutStackParamList, 'WorkoutHistory'>) {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [community, setCommunity] = useState<TrophyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestVersion = useRef(0);
  const tabHeight = useBottomTabBarHeight();
  const load = useCallback(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    Promise.allSettled([fetchProgress(), fetchTrophyLeaderboard()]).then(([workouts, people]) => {
      if (version !== requestVersion.current) return;
      setError(workouts.status === 'rejected');
      if (workouts.status === 'fulfilled') setProgress(workouts.value);
      setCommunity(people.status === 'fulfilled' ? people.value : null);
      setLoading(false);
    });
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    return () => { requestVersion.current++; };
  }, [load]));
  const history = useMemo(() => progress?.completionHistory ?? [], [progress]);
  const stats = useMemo(() => workoutHistoryStats(history), [history]);
  const previousWorkouts = useMemo(() => {
    const groups = new Map<string, WorkoutHistoryEntry[]>();
    for (const workout of history) {
      const group = groups.get(workout.date) ?? [];
      group.push(workout);
      groups.set(workout.date, group);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [history]);
  const openSession = useCallback((session: WorkoutHistoryEntry) => navigation.navigate('WorkoutHistoryDetail', { session }), [navigation]);

  return <ScreenContainer>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to workouts"><Text style={styles.backText}>Back</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>Workout history</Text>
    </View>
    <FlatList
      data={progress ? previousWorkouts : []}
      keyExtractor={item => item[0]}
      initialNumToRender={10}
      showsVerticalScrollIndicator={false}
      renderItem={({ item: [date, workouts] }) => <WorkoutGroup date={date} workouts={workouts} onOpen={openSession} />}
      contentContainerStyle={{ paddingBottom: tabHeight + 24 }}
      refreshControl={<RefreshControl refreshing={loading && !!progress} onRefresh={load} tintColor={colors.gold} />}
      ListHeaderComponent={<View>
        {loading && !progress ? <View style={styles.loading}><ActivityIndicator color={colors.gold} /><Text style={styles.caption}>Loading your training log…</Text></View> : null}
        {error ? <View style={styles.error}><Text style={styles.caption}>{progress ? 'Couldn’t refresh your history.' : 'Couldn’t load your workout history.'}</Text><TouchableOpacity onPress={load} style={styles.textButton} accessibilityRole="button"><Text style={styles.detailLink}>Try again</Text></TouchableOpacity></View> : null}
        {progress ? <>
          <View style={styles.overview}>
            <View style={styles.overviewTop}>
              <View style={styles.total}>
                <Text style={styles.eyebrow}>THE TRAINING LOG</Text>
                <Text style={styles.totalNumber}>{history.length}</Text>
                <Text style={styles.totalLabel}>{history.length === 1 ? 'session completed' : 'sessions completed'}</Text>
                {stats.first ? <Text style={styles.since}>Since {parseDate(stats.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text> : null}
              </View>
              <View style={styles.artwork}><WorkoutHistoryArtwork width={132} height={152} /></View>
            </View>
            <View style={styles.stats}>
              {([[progress.currentStreak, 'Current streak'], [progress.bestStreak, 'Best streak'], [stats.days, 'Training days']] as const).map(([value, label], index) => <View key={label} style={[styles.stat, index > 0 ? styles.statBorder : styles.firstStat]}>
                <Text style={styles.statValue}>{value}<Text style={styles.statUnit}> {value === 1 ? 'day' : 'days'}</Text></Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>)}
            </View>
          </View>
          <WorkoutHistoryCalendar history={history} onOpenSession={openSession} />
          <View style={styles.listHeading}><Text style={styles.sectionTitle}>Previous workouts</Text><Text style={styles.caption}>Latest first</Text></View>
          {!previousWorkouts.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your log starts here.</Text><Text style={styles.caption}>Completed workouts will appear here with the exercises and muscle groups you trained.</Text></View> : null}
        </> : null}
      </View>}
      ListFooterComponent={progress && history.length ? <View style={styles.footer}>
        <Text style={styles.eyebrow}>FROM YOUR LOG</Text>
        <View style={styles.insightRow}><Text style={styles.caption}>Most active day</Text><Text style={styles.insightValue}>{stats.favouriteDay}</Text></View>
        <View style={styles.insightRow}><Text style={styles.caption}>Quick sessions</Text><Text style={styles.insightValue}>{stats.quick}</Text></View>
        {community && community.participantCount > 1 ? <View style={styles.community}>
          <Text style={styles.caption}>{community.participantCount} people on your leaderboard</Text>
          {community.currentUser ? <Text style={styles.insightValue}>Your rank #{community.currentUser.rank} · {community.currentUser.score} trophies</Text> : null}
        </View> : null}
        <Text style={styles.footnote}>Streaks count consecutive workout days.</Text>
      </View> : null}
    />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 16 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, backText: { ...typography.caption, color: colors.inkMuted }, headerTitle: { ...typography.title, fontSize: 20, color: colors.ink, flex: 1 },
  overview: { marginBottom: 24 }, overviewTop: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 }, total: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.overline, fontSize: 9, letterSpacing: 1.8, color: colors.goldMuted },
  totalNumber: { fontSize: 64, lineHeight: 76, fontWeight: '500', letterSpacing: -3, fontVariant: ['tabular-nums'], color: colors.ink, marginTop: 5 },
  totalLabel: { ...typography.bodyBold, fontSize: 13, color: colors.ink }, since: { ...typography.caption, fontSize: 10, color: colors.inkSubtle, marginTop: 7 }, artwork: { width: 132, overflow: 'hidden' },
  stats: { flexDirection: 'row', paddingTop: 22 }, stat: { flex: 1, minWidth: 0, paddingLeft: 12, gap: 4 }, statBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, firstStat: { paddingLeft: 0 },
  statValue: { fontSize: 21, lineHeight: 28, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] }, statUnit: { ...typography.caption, fontSize: 10, color: colors.inkMuted, fontWeight: '400' }, statLabel: { ...typography.caption, fontSize: 10, color: colors.inkSubtle },
  listHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 26, paddingBottom: 22 }, sectionTitle: { ...typography.title, fontSize: 18, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted },
  workoutGroup: { flexDirection: 'row', paddingBottom: 24 }, dateColumn: { width: 52, paddingTop: 1 }, dateNumber: { fontSize: 28, lineHeight: 32, fontWeight: '500', fontVariant: ['tabular-nums'], color: colors.inkMuted }, dateMonth: { ...typography.overline, fontSize: 9, letterSpacing: 1, color: colors.inkMuted, marginTop: 3 }, dateYear: { ...typography.caption, fontSize: 9, color: colors.inkSubtle },
  entries: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderColor: colors.border, paddingLeft: 16 },
  entry: { gap: 6, minHeight: 76 }, entryDivider: { marginTop: 18, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, weekday: { ...typography.caption, fontSize: 10, color: colors.inkSubtle }, quickLabel: { ...typography.overline, fontSize: 8, color: colors.goldMuted, letterSpacing: 1.2 },
  workoutTitle: { ...typography.bodyBold, fontSize: 17, lineHeight: 24, color: colors.ink }, muscles: { ...typography.caption, fontSize: 11, lineHeight: 17, color: colors.gold }, preview: { ...typography.caption, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  entryBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 5 }, summary: { ...typography.caption, fontSize: 10, lineHeight: 16, color: colors.inkSubtle, flex: 1 }, detailLink: { ...typography.caption, fontSize: 11, color: colors.gold },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 20, marginTop: 4, gap: 14 }, insightRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, insightValue: { ...typography.bodyBold, fontSize: 13, color: colors.ink }, footnote: { ...typography.caption, fontSize: 10, color: colors.inkSubtle }, community: { gap: 6, paddingTop: 6 },
  empty: { borderLeftWidth: 2, borderColor: colors.goldMuted, paddingLeft: 16, paddingVertical: 10, gap: 8 }, emptyTitle: { ...typography.subtitle, color: colors.ink },
  error: { paddingVertical: 16, gap: 8 }, textButton: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }, loading: { paddingVertical: 60, alignItems: 'center', gap: 12 },
});
