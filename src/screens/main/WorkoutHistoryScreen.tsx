import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { WorkoutHistoryArtwork, WorkoutHistoryIcon } from '../../components/WorkoutHistoryArtwork';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchProgress, fetchTrophyLeaderboard } from '../../services/progressService';
import type { ProgressSummary, TrophyLeaderboard } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { workoutDateKey, workoutHistoryStats, workoutMonthDays } from '../../utils/workoutHistory';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

export function WorkoutHistoryScreen({ navigation }: NativeStackScreenProps<WorkoutStackParamList, 'WorkoutHistory'>) {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [community, setCommunity] = useState<TrophyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestVersion = useRef(0);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => workoutDateKey(new Date()));
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
  const dates = useMemo(() => new Set(history.map(entry => entry.date)), [history]);
  const calendarDays = useMemo(() => workoutMonthDays(month), [month]);
  const weeks = Array.from({ length: calendarDays.length / 7 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7));
  const sessions = history.filter(entry => entry.date === selected);
  const today = workoutDateKey(new Date());
  const monthKey = workoutDateKey(month).slice(0, 7);
  const monthCount = history.filter(entry => entry.date.startsWith(monthKey)).length;
  const earliestMonth = stats.first?.slice(0, 7) ?? today.slice(0, 7);
  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    const prefix = workoutDateKey(next).slice(0, 7);
    setSelected([...dates].filter(date => date.startsWith(prefix)).sort().pop() ?? (prefix === today.slice(0, 7) ? today : workoutDateKey(next)));
  };
  return <ScreenContainer>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconButton, styles.backButton]} accessibilityRole="button" accessibilityLabel="Back to workouts"><WorkoutHistoryIcon name="arrow-left" size={22} color={colors.ink} /></TouchableOpacity>
      <View style={styles.flex}><Text style={styles.title}>My workout history</Text><Text style={styles.caption}>Every session counts.</Text></View>
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabHeight + 20 }]} refreshControl={<RefreshControl refreshing={loading && !!progress} onRefresh={load} tintColor={colors.gold} />}>
      {loading && !progress ? <ActivityIndicator color={colors.gold} style={styles.loader} /> : null}
      {error ? <View style={styles.card}><Text style={styles.body}>{progress ? 'Couldn’t refresh your history.' : 'Couldn’t load your workout history.'}</Text><PrimaryButton title="Try again" onPress={load} variant="secondary" /></View> : null}
      {progress ? <>
        <View style={styles.hero}>
          <View style={styles.flex}><Text style={styles.eyebrow}>YOUR TRAINING JOURNEY</Text><Text style={styles.heroTitle}>Look how far{ '\n' }you’ve come.</Text><Text style={styles.caption}>One workout at a time.</Text></View>
          <WorkoutHistoryArtwork size={104} />
        </View>
        <View style={styles.stats}>
          {([['activity', history.length, 'Workouts'], ['zap', progress.currentStreak, 'Day streak'], ['award', progress.bestStreak, 'Best streak']] as const).map(([icon, value, label]) => <View key={label} style={styles.stat}><WorkoutHistoryIcon name={icon} size={20} color={colors.gold} /><Text style={styles.statValue}>{value}</Text><Text style={styles.caption}>{label}</Text></View>)}
        </View>
        <View style={styles.card}>
          <View style={styles.monthHeader}>
            <TouchableOpacity disabled={monthKey <= earliestMonth} onPress={() => moveMonth(-1)} style={[styles.iconButton, monthKey <= earliestMonth && styles.disabled]} accessibilityRole="button" accessibilityLabel="Previous month"><WorkoutHistoryIcon name="chevron-left" size={21} color={colors.ink} /></TouchableOpacity>
            <View style={styles.monthTitle}><Text style={styles.body}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text><Text style={styles.caption}>{monthCount} {monthCount === 1 ? 'workout' : 'workouts'}</Text></View>
            <TouchableOpacity disabled={monthKey >= today.slice(0, 7)} onPress={() => moveMonth(1)} style={[styles.iconButton, monthKey >= today.slice(0, 7) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Next month"><WorkoutHistoryIcon name="chevron-right" size={21} color={colors.ink} /></TouchableOpacity>
          </View>
          <View style={styles.grid}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <View key={i} style={styles.cell}><Text style={styles.caption}>{day}</Text></View>)}</View>
          <View>{weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.grid}>{week.map((date, i) => <View key={date ?? i} style={styles.cell}>{date ? <TouchableOpacity disabled={date > today} onPress={() => setSelected(date)} style={[styles.day, dates.has(date) && styles.completed, date === selected && styles.selected, date > today && styles.disabled]} accessibilityRole="button" accessibilityState={{ selected: date === selected, disabled: date > today }} accessibilityLabel={`${date}${dates.has(date) ? ', workout completed' : ', no workout recorded'}`}><Text style={[styles.dayText, dates.has(date) && styles.completedText]}>{Number(date.slice(-2))}</Text>{date === today ? <View style={[styles.todayDot, dates.has(date) && styles.darkDot]} /> : null}</TouchableOpacity> : null}</View>)}</View>)}</View>
          <View style={styles.legend}><View style={styles.legendItem}><View style={styles.legendCompleted} /><Text style={styles.legendText}>Completed</Text></View><View style={styles.legendItem}><View style={styles.legendToday} /><Text style={styles.legendText}>Today</Text></View></View>
          <View style={styles.dayDetail}><Text style={styles.body}>{new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>{sessions.length ? sessions.map((session, i) => <View key={`${session.planId}-${session.planDayId}-${session.workoutMode}-${i}`} style={styles.session}><WorkoutHistoryIcon name="check-circle" color={colors.gold} size={18} /><Text style={styles.body}>{session.workoutMode === 'quick' ? 'Quick workout' : 'Workout'} completed</Text></View>) : <Text style={styles.caption}>No workout recorded. Rest days count too.</Text>}</View>
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>Your training story</Text>{history.length ? <>
          <Text style={styles.body}>{stats.days} days you showed up</Text>
          <Text style={styles.caption}>Since {new Date(`${stats.first}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <View style={styles.divider} /><Text style={styles.body}>{stats.favouriteDay} is your most active day</Text>
          <Text style={styles.caption}>{stats.quick} quick {stats.quick === 1 ? 'workout' : 'workouts'} completed. Small sessions add up.</Text>
        </> : <Text style={styles.caption}>Finish your first workout to start your calendar and unlock your highlights.</Text>}<Text style={styles.note}>Streaks count consecutive workout days.</Text></View>
        {community ? <View style={styles.card}><View style={styles.session}><WorkoutHistoryIcon name="users" size={22} color={colors.gold} /><Text style={styles.sectionTitle}>Training alongside you</Text></View><Text style={styles.body}>{community.participantCount} on the leaderboard</Text>{community.currentUser ? <Text style={styles.caption}>Your rank: #{community.currentUser.rank} · {community.currentUser.score} trophies</Text> : null}</View> : null}
      </> : null}
    </ScrollView>
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 },
  eyebrow: { ...typography.overline, fontSize: 9, letterSpacing: 1.2, color: colors.goldMuted, marginBottom: 8 },
  heroTitle: { ...typography.title, fontSize: 25, lineHeight: 31, color: colors.ink, marginBottom: 6 },
  backButton: { borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  legendCompleted: { width: 9, height: 9, borderRadius: 3, backgroundColor: colors.gold },
  legendToday: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }, flex: { flex: 1 },
  title: { ...typography.title, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted },
  body: { ...typography.bodyBold, color: colors.ink }, sectionTitle: { ...typography.title, fontSize: 18, color: colors.ink },
  content: { gap: 16 }, card: { padding: 16, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 },
  stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 16, gap: 5 }, statValue: { ...typography.hero, fontSize: 28, lineHeight: 34, color: colors.ink },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center' }, monthTitle: { flex: 1, alignItems: 'center', gap: 3 },
  grid: { flexDirection: 'row' }, cell: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: '92%', minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayText: { ...typography.label, color: colors.ink }, completed: { backgroundColor: colors.gold }, completedText: { color: colors.onPrimary }, selected: { borderColor: colors.ink },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold, position: 'absolute', bottom: 4 }, darkDot: { backgroundColor: colors.onPrimary },
  disabled: { opacity: 0.3 }, dayDetail: { borderTopWidth: 1, borderColor: colors.border, marginTop: 8, paddingTop: 16, gap: 10 }, session: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 }, note: { ...typography.caption, color: colors.inkSubtle, marginTop: 8 }, loader: { marginTop: 40 },
});
