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
  const dates = useMemo(() => [...new Set(history.map(session => session.date))].sort(), [history]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(() => dates[dates.length - 1] || today);
  const [month, setMonth] = useState(() => new Date(`${selected.slice(0, 7)}-01T12:00:00`));
  const monthKey = workoutDateKey(month).slice(0, 7);
  const days = useMemo(() => workoutMonthDays(month), [month]);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const monthSessions = useMemo(() => history.filter(session => session.date.startsWith(monthKey)), [history, monthKey]);
  const selectedSessions = useMemo(() => history.filter(session => session.date === selected), [history, selected]);
  const completedDates = useMemo(() => new Set(dates), [dates]);
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
      <HistoryMotif kind="calendar" size={38} />
      <View style={styles.flex}><Text style={styles.title}>Calendar</Text><Text style={styles.collapsedCaption}>{expanded ? 'Your workouts, day by day' : `${month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · ${monthSessions.length} ${monthSessions.length === 1 ? 'session' : 'sessions'}`}</Text></View>
      <HistoryArrow direction={expanded ? 'up' : 'down'} color={colors.gold} size={20} />
    </TouchableOpacity>
    {expanded ? <View>
      <View style={styles.monthHeader}>
        <View style={styles.flex}><Text style={styles.month}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text><Text style={styles.caption}>{monthSessions.length} {monthSessions.length === 1 ? 'session' : 'sessions'}</Text></View>
        <TouchableOpacity style={[styles.textButton, !canGoBack && styles.disabled]} disabled={!canGoBack} onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canGoBack }}><HistoryArrow direction="left" color={canGoBack ? colors.ink : colors.inkSubtle} size={20} /></TouchableOpacity>
        <TouchableOpacity style={[styles.textButton, !canGoForward && styles.disabled]} disabled={!canGoForward} onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canGoForward }}><HistoryArrow color={canGoForward ? colors.ink : colors.inkSubtle} size={20} /></TouchableOpacity>
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
        {selectedSessions.length ? selectedSessions.map(session => <TouchableOpacity key={historySessionKey(session)} style={styles.session} onPress={() => onOpenSession(session)} accessibilityRole="button" accessibilityLabel={`View ${historyWorkoutTitle(session)}`}><Text style={styles.sessionName}>{historyWorkoutTitle(session)}</Text><HistoryArrow size={18} color={colors.gold} /></TouchableOpacity>) : <Text style={styles.caption}>No session recorded</Text>}
      </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.panel, borderWidth: 1, borderRadius: radius.xl, borderColor: colors.border, padding: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  title: { ...typography.subtitle, color: colors.ink },
  textButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.panelRaised, justifyContent: 'center', alignItems: 'center' },
  collapsedCaption: { ...typography.caption, fontSize: 11, color: colors.inkMuted, marginTop: 3 },
  flex: { flex: 1, minWidth: 0 }, monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, marginTop: 14, marginBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  month: { ...typography.bodyBold, fontSize: 14, color: colors.ink, marginBottom: 2 }, caption: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  weekdays: { flexDirection: 'row', marginBottom: 4 }, weekday: { flex: 1, textAlign: 'center', ...typography.caption, fontSize: 10, color: colors.inkSubtle, paddingVertical: 6 },
  week: { flexDirection: 'row' }, cell: { flex: 1, minWidth: 0 }, dayTarget: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayFace: { width: 32, minHeight: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayText: { ...typography.caption, fontSize: 12, color: colors.inkMuted, fontVariant: ['tabular-nums'] }, completedText: { color: colors.gold, fontWeight: '700' },
  today: { borderColor: colors.inkMuted }, selected: { backgroundColor: colors.gold, borderColor: colors.gold }, selectedText: { color: colors.onPrimary, fontWeight: '700' },
  sessionMark: { width: 8, height: 2, borderRadius: 1, backgroundColor: colors.gold, position: 'absolute', bottom: 3 }, selectedMark: { backgroundColor: colors.onPrimary },
  disabled: { color: colors.inkSubtle, opacity: 0.45 },
  legend: { flexDirection: 'row', gap: 18, paddingTop: 8, paddingBottom: 18 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendMark: { height: 2, width: 9, backgroundColor: colors.gold }, legendToday: { height: 8, width: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.inkMuted },
  selection: { backgroundColor: colors.panelMuted, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 4 }, selectionDate: { ...typography.caption, fontSize: 11, color: colors.goldMuted },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, sessionName: { ...typography.bodyBold, fontSize: 13, color: colors.ink, flex: 1 },
});
