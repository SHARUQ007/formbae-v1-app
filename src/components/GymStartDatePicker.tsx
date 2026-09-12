import { useState } from 'react';
import { Keyboard, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { PrimaryButton } from './PrimaryButton';
import { formatMembershipDate, membershipDateKey, parseMembershipDate } from '../utils/gymMembership';
import { workoutMonthDays } from '../utils/workoutHistory';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; label?: string };
const MIN_YEAR = 1900;
const MAX_YEAR = 2199;

export function GymStartDatePicker({ value, onChange, disabled = false, label = 'Start date' }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [yearPage, setYearPage] = useState(0);
  const today = membershipDateKey(new Date());
  const days = workoutMonthDays(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const show = () => {
    if (disabled) return;
    Keyboard.dismiss();
    const selected = parseMembershipDate(value) || new Date();
    setDraft(membershipDateKey(selected));
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
    setView('days');
    setOpen(true);
  };
  const showYears = () => {
    setYearPage(MIN_YEAR + Math.floor((month.getFullYear() - MIN_YEAR) / 12) * 12);
    setView('years');
  };
  const changeMonth = (offset: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));

  return <>
    <TouchableOpacity style={[styles.field, disabled && styles.disabled]} disabled={disabled} onPress={show} accessibilityRole="button" accessibilityLabel="Gym membership start date" accessibilityValue={{ text: formatMembershipDate(value) || 'Not selected' }} accessibilityState={{ disabled, expanded: open }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
        <Rect x={3} y={5} width={18} height={16} rx={3} fill="none" stroke={colors.gold} strokeWidth={1.5} />
        <Path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 3h3" stroke={colors.gold} strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
      <Text style={[styles.fieldText, !value && styles.placeholder]}>{formatMembershipDate(value) || 'Select date'}</Text>
      <Text style={styles.action}>{value ? 'Edit' : 'Choose'}</Text>
    </TouchableOpacity>
    {open ? <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}><Text style={styles.title}>{label}</Text><TouchableOpacity style={styles.textButton} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Cancel date selection"><Text style={styles.muted}>Cancel</Text></TouchableOpacity></View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.monthHeader}>
              <TouchableOpacity style={styles.textButton} onPress={() => view === 'years' ? setYearPage(year => Math.max(MIN_YEAR, year - 12)) : changeMonth(-1)} disabled={view === 'years' ? yearPage <= MIN_YEAR : month.getFullYear() <= MIN_YEAR && month.getMonth() === 0} accessibilityRole="button" accessibilityLabel={view === 'years' ? 'Previous years' : 'Previous month'}><Text style={styles.action}>Prev</Text></TouchableOpacity>
              {view === 'years' ? <Text style={styles.monthTitle}>{yearPage}–{Math.min(MAX_YEAR, yearPage + 11)}</Text> : <View style={styles.period}>
                <TouchableOpacity style={styles.textButton} onPress={() => setView(view === 'months' ? 'days' : 'months')} accessibilityRole="button" accessibilityLabel="Choose month"><Text style={styles.monthTitle}>{month.toLocaleDateString('en-GB', { month: 'long' })}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.textButton} onPress={showYears} accessibilityRole="button" accessibilityLabel="Choose year"><Text style={styles.monthTitle}>{month.getFullYear()}</Text></TouchableOpacity>
              </View>}
              <TouchableOpacity style={styles.textButton} onPress={() => view === 'years' ? setYearPage(year => Math.min(MAX_YEAR - 11, year + 12)) : changeMonth(1)} disabled={view === 'years' ? yearPage + 11 >= MAX_YEAR : month.getFullYear() >= MAX_YEAR && month.getMonth() === 11} accessibilityRole="button" accessibilityLabel={view === 'years' ? 'Next years' : 'Next month'}><Text style={styles.action}>Next</Text></TouchableOpacity>
            </View>
            {view === 'days' ? <>
              <View style={styles.week}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <Text key={index} style={styles.weekday}>{day}</Text>)}</View>
              {weeks.map((week, index) => <View key={index} style={styles.week}>{week.map((date, column) => <View key={date || column} style={styles.cell}>
                {date ? <TouchableOpacity style={styles.day} onPress={() => setDraft(date)} accessibilityRole="button" accessibilityLabel={`Select ${formatMembershipDate(date)}`} accessibilityState={{ selected: draft === date }}>
                  <View style={[styles.dayFace, date === today && styles.today, draft === date && styles.selected]}><Text style={[styles.dayText, draft === date && styles.selectedText]}>{Number(date.slice(-2))}</Text></View>
                </TouchableOpacity> : null}
              </View>)}</View>)}
            </> : <View style={styles.grid}>{Array.from({ length: 12 }, (_, index) => {
              const year = yearPage + index;
              const title = view === 'years' ? String(year) : new Date(2026, index, 1).toLocaleDateString('en-GB', { month: 'short' });
              return <TouchableOpacity key={index} style={styles.gridCell} onPress={() => {
                setMonth(new Date(view === 'years' ? year : month.getFullYear(), view === 'months' ? index : month.getMonth(), 1, 12));
                setView(view === 'years' ? 'months' : 'days');
              }} accessibilityRole="button" accessibilityLabel={`Select ${title}`}><Text style={styles.dayText}>{title}</Text></TouchableOpacity>;
            })}</View>}
            <TouchableOpacity style={styles.textButton} onPress={() => { setDraft(today); setMonth(new Date()); setView('days'); }} accessibilityRole="button" accessibilityLabel="Use today"><Text style={styles.action}>Today</Text></TouchableOpacity>
          </ScrollView>
          <View style={styles.footer}><Text style={styles.selectionLabel}>{formatMembershipDate(draft)}</Text><PrimaryButton title="Confirm date" disabled={disabled} onPress={() => { onChange(draft); setOpen(false); }} /></View>
        </View>
      </View>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  field: { minHeight: 52, backgroundColor: colors.panelMuted, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldText: { ...typography.body, color: colors.ink, flex: 1 }, placeholder: { color: colors.inkSubtle }, action: { ...typography.caption, color: colors.gold }, disabled: { opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: 16 }, sheet: { width: '100%', maxWidth: 440, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8 }, title: { ...typography.subtitle, color: colors.ink }, muted: { ...typography.caption, color: colors.inkMuted }, scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 12 }, textButton: { minHeight: 44, minWidth: 40, alignItems: 'center', justifyContent: 'center' }, monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, period: { flexDirection: 'row', gap: 8, flexShrink: 1 }, monthTitle: { ...typography.bodyBold, fontSize: 14, color: colors.ink },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', ...typography.caption, color: colors.inkSubtle, paddingVertical: 12 }, cell: { flex: 1, minWidth: 0 }, day: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dayFace: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' }, today: { borderColor: colors.borderStrong }, selected: { backgroundColor: colors.gold, borderColor: colors.gold }, dayText: { ...typography.body, fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] }, selectedText: { color: colors.onPrimary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 8 }, gridCell: { width: '33.333333%', minHeight: 52, justifyContent: 'center', alignItems: 'center' }, footer: { padding: 16, gap: 10 }, selectionLabel: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
});
