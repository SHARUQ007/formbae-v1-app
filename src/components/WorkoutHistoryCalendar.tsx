import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WorkoutHistoryEntry } from '../types/api';
import { historySessionKey, historyWorkoutTitle, workoutDateKey, workoutMonthDays } from '../utils/workoutHistory';
import { HistoryArrow, HistoryMotif } from './WorkoutHistoryArtwork';
import { radius } from '../theme/radius';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = { history: WorkoutHistoryEntry[]; onOpenSession: (session: WorkoutHistoryEntry) => void };

export function WorkoutHistoryCalendar({ history, onOpenSession }: Props) {
  const today = workoutDateKey(new Date());
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of history) counts.set(session.date, (counts.get(session.date) ?? 0) + 1);
    return counts;
  }, [history]);
  const dates = useMemo(() => [...sessionCounts.keys()].sort(), [sessionCounts]);
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(() => dates[dates.length - 1] || today);
  const [month, setMonth] = useState(() => new Date(`${selected.slice(0, 7)}-01T12:00:00`));
  const monthKey = workoutDateKey(month).slice(0, 7);
  const days = useMemo(() => workoutMonthDays(month), [month]);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const monthSessions = useMemo(() => history.filter(session => session.date.startsWith(monthKey)), [history, monthKey]);
  const selectedSessions = useMemo(() => history.filter(session => session.date === selected), [history, selected]);
  const canGoBack = monthKey > (dates[0] || today).slice(0, 7);
  const canGoForward = monthKey < today.slice(0, 7);
  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const prefix = workoutDateKey(next).slice(0, 7);
    setMonth(next);
    setSelected(dates.filter(date => date.startsWith(prefix)).pop() || (prefix === today.slice(0, 7) ? today : workoutDateKey(next)));
  };

  return <View style={styles.section}>
    <TouchableOpacity style={styles.heading} onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityLabel={expanded ? 'Hide calendar' : 'Show calendar'} accessibilityState={{ expanded }} activeOpacity={0.8}>
      <HistoryMotif kind="calendar" size={30} />
      <View style={styles.flex}><Text style={styles.title}>Calendar</Text>{!expanded ? <Text style={styles.collapsedCaption}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · {monthSessions.length} {monthSessions.length === 1 ? 'workout' : 'workouts'}</Text> : null}</View>
      <Text style={styles.toggleText}>{expanded ? 'Hide' : 'Show'}</Text>
      <HistoryArrow direction={expanded ? 'up' : 'down'} color={colors.gold} size={16} />
    </TouchableOpacity>
    {expanded ? <View>
      <View style={styles.monthHeader}>
        <TouchableOpacity style={[styles.monthButton, !canGoBack && styles.disabled]} disabled={!canGoBack} onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canGoBack }}><HistoryArrow direction="left" color={colors.ink} size={20} /></TouchableOpacity>
        <View style={styles.monthCopy}><Text style={styles.month}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text><Text style={styles.caption}>{monthSessions.length} {monthSessions.length === 1 ? 'workout' : 'workouts'}</Text></View>
        <TouchableOpacity style={[styles.monthButton, !canGoForward && styles.disabled]} disabled={!canGoForward} onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canGoForward }}><HistoryArrow color={colors.ink} size={20} /></TouchableOpacity>
      </View>
      <View style={styles.weekdays}>{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day, index) => <Text key={index} style={styles.weekday}>{day}</Text>)}</View>
      <View>{weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.week} testID="history-calendar-week">
        {week.map((date, index) => <View key={date || index} style={styles.cell}>
          {date ? <TouchableOpacity style={styles.dayTarget} onPress={() => setSelected(date)} disabled={date > today} accessibilityHint={(sessionCounts.get(date) ?? 0) > 1 ? `${sessionCounts.get(date)} workouts on this date` : undefined} accessibilityRole="button" accessibilityState={{ selected: date === selected, disabled: date > today }} accessibilityLabel={`${date}${sessionCounts.has(date) ? ', workout completed' : ', no workout recorded'}${date === today ? ', today' : ''}`}>
            <View style={[styles.dayFace, date === selected && styles.selected, sessionCounts.has(date) && styles.completedDay, date === today && styles.today, date === selected && sessionCounts.has(date) && styles.selectedCompleted]}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.dayText, date === selected && styles.selectedText, sessionCounts.has(date) && styles.completedText, date > today && styles.disabled]}>{Number(date.slice(-2))}</Text>
              {sessionCounts.has(date) ? <View style={styles.sessionMarks}>{Array.from({ length: Math.min(sessionCounts.get(date) ?? 0, 3) }, (_, dot) => <View key={dot} style={styles.sessionMark} />)}</View> : null}
            </View>
          </TouchableOpacity> : null}
        </View>)}
      </View>)}</View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendMark} /><Text style={styles.caption}>Completed</Text></View>
        <View style={styles.legendItem}><View style={styles.legendToday} /><Text style={styles.caption}>Today</Text></View>
      </View>
      <View style={styles.selection}>
        <View style={styles.selectionHeading}><Text style={styles.selectionDate}>{selected === today ? 'Today · ' : ''}{new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>{selectedSessions.length > 1 ? <Text style={styles.caption}>{selectedSessions.length} workouts</Text> : null}</View>
        {selectedSessions.length ? selectedSessions.map(session => <TouchableOpacity key={historySessionKey(session)} style={styles.session} onPress={() => onOpenSession(session)} accessibilityRole="button" accessibilityLabel={`View ${historyWorkoutTitle(session)}`}><Text style={styles.sessionName}>{historyWorkoutTitle(session)}</Text><HistoryArrow size={18} color={colors.gold} /></TouchableOpacity>) : <Text style={styles.caption}>No session recorded</Text>}
      </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.panel, borderWidth: 1, borderRadius: radius.xl, borderColor: colors.border, padding: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  title: { ...typography.subtitle, color: colors.ink }, toggleText: { ...typography.caption, fontSize: 11, color: colors.gold },
  collapsedCaption: { ...typography.caption, fontSize: 11, color: colors.inkMuted, marginTop: 3 },
  flex: { flex: 1, minWidth: 0 }, monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 14 },
  monthButton: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  monthCopy: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  month: { ...typography.subtitle, textAlign: 'center', color: colors.ink }, caption: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  weekdays: { flexDirection: 'row', paddingBottom: 8, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, weekday: { flex: 1, textAlign: 'center', ...typography.caption, fontSize: 10, color: colors.inkSubtle },
  week: { flexDirection: 'row' }, cell: { flex: 1, minWidth: 0, paddingHorizontal: 1 }, dayTarget: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayFace: { width: 36, maxWidth: '100%', minHeight: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayText: { ...typography.caption, fontSize: 12, color: colors.inkMuted, fontVariant: ['tabular-nums'] }, completedDay: { backgroundColor: colors.gold, borderColor: colors.gold }, selectedCompleted: { borderColor: colors.borderStrong, borderWidth: 2 }, completedText: { color: colors.onPrimary, fontWeight: '700' },
  today: { borderColor: colors.inkMuted }, selected: { backgroundColor: colors.panelRaised, borderColor: colors.ink }, selectedText: { color: colors.ink, fontWeight: '700' },
  sessionMarks: { position: 'absolute', bottom: 3, flexDirection: 'row', gap: 2 }, sessionMark: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.onPrimary },
  disabled: { opacity: 0.35 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 12, paddingBottom: 18 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendMark: { height: 10, width: 10, borderRadius: 3, backgroundColor: colors.gold }, legendToday: { height: 10, width: 10, borderRadius: 3, borderWidth: 1, borderColor: colors.inkMuted },
  selection: { backgroundColor: colors.panelMuted, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 4 }, selectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, selectionDate: { ...typography.caption, fontSize: 11, color: colors.goldMuted },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, sessionName: { ...typography.bodyBold, fontSize: 13, color: colors.ink, flex: 1 },
});
