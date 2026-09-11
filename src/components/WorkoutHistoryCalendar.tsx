import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WorkoutHistoryEntry } from '../types/api';
import { historySessionKey, historyWorkoutTitle, workoutDateKey, workoutMonthDays } from '../utils/workoutHistory';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = { history: WorkoutHistoryEntry[]; onOpenSession: (session: WorkoutHistoryEntry) => void };

export function WorkoutHistoryCalendar({ history, onOpenSession }: Props) {
  const today = workoutDateKey(new Date());
  const dates = useMemo(() => [...new Set(history.map(session => session.date))].sort(), [history]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(() => dates[dates.length - 1] || today);
  const [month, setMonth] = useState(() => new Date(`${selected.slice(0, 7)}-01T12:00:00`));
  const monthKey = workoutDateKey(month).slice(0, 7);
  const days = workoutMonthDays(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const monthSessions = history.filter(session => session.date.startsWith(monthKey));
  const selectedSessions = history.filter(session => session.date === selected);
  const completedDates = new Set(dates);
  const canGoBack = monthKey > (dates[0] || today).slice(0, 7);
  const canGoForward = monthKey < today.slice(0, 7);
  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const prefix = workoutDateKey(next).slice(0, 7);
    setMonth(next);
    setSelected(dates.filter(date => date.startsWith(prefix)).pop() || (prefix === today.slice(0, 7) ? today : workoutDateKey(next)));
  };

  return <View style={styles.section}>
    <View style={styles.heading}>
      <Text style={styles.title}>Calendar</Text>
      <TouchableOpacity style={styles.textButton} onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityLabel={expanded ? 'Hide calendar' : 'Show calendar'} accessibilityState={{ expanded }}>
        <Text style={styles.action}>{expanded ? 'Hide' : 'Show dates'}</Text>
      </TouchableOpacity>
    </View>
    {expanded ? <View>
      <View style={styles.monthHeader}>
        <View style={styles.flex}><Text style={styles.month}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text><Text style={styles.caption}>{monthSessions.length} {monthSessions.length === 1 ? 'session' : 'sessions'}</Text></View>
        <TouchableOpacity style={styles.textButton} disabled={!canGoBack} onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canGoBack }}><Text style={[styles.navText, !canGoBack && styles.disabled]}>Prev</Text></TouchableOpacity>
        <View style={styles.navDivider} />
        <TouchableOpacity style={styles.textButton} disabled={!canGoForward} onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canGoForward }}><Text style={[styles.navText, !canGoForward && styles.disabled]}>Next</Text></TouchableOpacity>
      </View>
      <View style={styles.weekdays}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <Text key={index} style={styles.weekday}>{day}</Text>)}</View>
      <View>{weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.week} testID="history-calendar-week">
        {week.map((date, index) => <View key={date || index} style={styles.cell}>
          {date ? <TouchableOpacity style={styles.dayTarget} onPress={() => setSelected(date)} disabled={date > today} accessibilityRole="button" accessibilityState={{ selected: date === selected, disabled: date > today }} accessibilityLabel={`${date}${completedDates.has(date) ? ', workout completed' : ', no workout recorded'}${date === today ? ', today' : ''}`}>
            <View style={[styles.dayFace, date === today && styles.today, date === selected && styles.selected]}>
              <Text style={[styles.dayText, completedDates.has(date) && styles.completedText, date > today && styles.disabled, date === selected && styles.selectedText]}>{Number(date.slice(-2))}</Text>
              {completedDates.has(date) ? <View style={[styles.sessionMark, date === selected && styles.selectedMark]} /> : null}
            </View>
          </TouchableOpacity> : null}
        </View>)}
      </View>)}</View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendMark} /><Text style={styles.caption}>Workout</Text></View>
        <View style={styles.legendItem}><View style={styles.legendToday} /><Text style={styles.caption}>Today</Text></View>
      </View>
      <View style={styles.selection}>
        <Text style={styles.selectionDate}>{new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
        {selectedSessions.length ? selectedSessions.map(session => <TouchableOpacity key={historySessionKey(session)} style={styles.session} onPress={() => onOpenSession(session)} accessibilityRole="button" accessibilityLabel={`View ${historyWorkoutTitle(session)}`}><Text style={styles.sessionName}>{historyWorkoutTitle(session)}</Text><Text style={styles.action}>View</Text></TouchableOpacity>) : <Text style={styles.caption}>No session recorded</Text>}
      </View>
    </View> : <Text style={styles.collapsedCaption}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · {monthSessions.length} {monthSessions.length === 1 ? 'session' : 'sessions'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8, paddingBottom: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { ...typography.subtitle, color: colors.ink }, action: { ...typography.caption, color: colors.gold },
  textButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  collapsedCaption: { ...typography.caption, color: colors.inkSubtle },
  flex: { flex: 1, minWidth: 0 }, monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  month: { ...typography.bodyBold, color: colors.ink, marginBottom: 2 }, caption: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  navText: { ...typography.caption, color: colors.ink }, navDivider: { height: 12, width: 1, backgroundColor: colors.border },
  weekdays: { flexDirection: 'row', marginBottom: 4 }, weekday: { flex: 1, textAlign: 'center', ...typography.caption, fontSize: 10, color: colors.inkSubtle, paddingVertical: 6 },
  week: { flexDirection: 'row' }, cell: { flex: 1, minWidth: 0 }, dayTarget: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayFace: { width: 32, minHeight: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayText: { ...typography.caption, fontSize: 12, color: colors.inkMuted, fontVariant: ['tabular-nums'] }, completedText: { color: colors.gold, fontWeight: '700' },
  today: { borderColor: colors.inkMuted }, selected: { backgroundColor: colors.gold, borderColor: colors.gold }, selectedText: { color: colors.onPrimary, fontWeight: '700' },
  sessionMark: { width: 8, height: 2, borderRadius: 1, backgroundColor: colors.gold, position: 'absolute', bottom: 3 }, selectedMark: { backgroundColor: colors.onPrimary },
  disabled: { color: colors.inkSubtle, opacity: 0.45 },
  legend: { flexDirection: 'row', gap: 18, paddingTop: 8, paddingBottom: 18 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendMark: { height: 2, width: 9, backgroundColor: colors.gold }, legendToday: { height: 8, width: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.inkMuted },
  selection: { borderLeftWidth: 2, borderColor: colors.goldMuted, paddingLeft: 12, gap: 3 }, selectionDate: { ...typography.caption, fontSize: 11, color: colors.inkSubtle },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, sessionName: { ...typography.bodyBold, fontSize: 13, color: colors.ink, flex: 1 },
});
