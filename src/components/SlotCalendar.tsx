/**
 * Picking a session time, laid out the way the web booking calendar lays it out.
 *
 * A row of days across the top, then the times available on the day you tapped. Only days
 * that actually have a slot appear, which is what the web does too - an empty day is not
 * worth a tap to discover.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { dayKey, formatSlotRange, formatSlotTime, type CoachSlot } from '../services/coachSessionService';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

type Props = {
  slots: CoachSlot[];
  selectedBookingId: string;
  onSelect: (bookingId: string) => void;
  emptyMessage?: string;
};

function dayLabels(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return {
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: date.toLocaleDateString('en-IN', { day: 'numeric' }),
  };
}

function monthLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function SlotCalendar({ slots, selectedBookingId, onSelect, emptyMessage = 'No open slots yet.' }: Props) {
  const sorted = useMemo(
    () => [...slots].sort((left, right) => left.slotStart.localeCompare(right.slotStart)),
    [slots],
  );
  const days = useMemo(() => {
    const seen: string[] = [];
    sorted.forEach((slot) => {
      const key = dayKey(slot.slotStart);
      if (key && !seen.includes(key)) seen.push(key);
    });
    return seen;
  }, [sorted]);

  const selectedSlot = sorted.find((slot) => slot.bookingId === selectedBookingId);
  const [selectedDay, setSelectedDay] = useState(() => (selectedSlot ? dayKey(selectedSlot.slotStart) : days[0] || ''));

  useEffect(() => {
    // Follow the selection when it moves, and fall back to the first day with anything on
    // it - otherwise cancelling the last slot on a day leaves an empty list showing.
    setSelectedDay(selectedSlot ? dayKey(selectedSlot.slotStart) : days[0] || '');
  }, [days, selectedSlot]);

  if (!sorted.length) {
    return (
      <View style={styles.empty} accessibilityRole="text">
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const slotsForDay = sorted.filter((slot) => dayKey(slot.slotStart) === selectedDay);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.month}>{monthLabel(selectedDay)}</Text>
        <View style={styles.openPill}>
          <Text style={styles.openPillText}>{sorted.length} open</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
        accessibilityRole="tablist"
      >
        {days.map((key) => {
          const { weekday, day } = dayLabels(key);
          const selected = key === selectedDay;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSelectedDay(key)}
              activeOpacity={0.85}
              style={[styles.day, selected && styles.daySelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${weekday} ${day}`}
            >
              <Text style={[styles.dayWeekday, selected && styles.dayTextSelected]}>{weekday.toUpperCase()}</Text>
              <Text style={[styles.dayNumber, selected && styles.dayTextSelected]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.times} accessibilityRole="radiogroup">
        {slotsForDay.map((slot) => {
          const selected = slot.bookingId === selectedBookingId;
          return (
            <TouchableOpacity
              key={slot.bookingId}
              onPress={() => onSelect(slot.bookingId)}
              activeOpacity={0.85}
              style={[styles.slot, selected && styles.slotSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={formatSlotRange(slot.slotStart, slot.slotEnd)}
            >
              <Text style={[styles.slotTime, selected && styles.slotTextSelected]}>{formatSlotTime(slot.slotStart)}</Text>
              <Text style={[styles.slotRange, selected && styles.slotRangeSelected]}>
                {formatSlotRange(slot.slotStart, slot.slotEnd)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!slotsForDay.length ? <Text style={styles.noneToday}>No slots on this date.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { ...typography.bodyBold, color: colors.ink },
  openPill: { backgroundColor: colors.accentSurface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  openPillText: { ...typography.caption, color: colors.primaryAction, fontWeight: '700' },
  dayStrip: { gap: spacing.xs, paddingRight: spacing.sm },
  day: {
    width: 52, height: 60, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.panel,
  },
  daySelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  dayWeekday: { ...typography.caption, fontSize: 10, color: colors.inkSubtle, fontWeight: '700' },
  dayNumber: { ...typography.bodyBold, color: colors.ink },
  dayTextSelected: { color: colors.onPrimary },
  times: { gap: spacing.xs },
  slot: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.panel,
  },
  slotSelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  slotTime: { ...typography.bodyBold, color: colors.ink },
  slotRange: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  slotTextSelected: { color: colors.onPrimary },
  slotRangeSelected: { color: colors.onPrimary, opacity: 0.85 },
  noneToday: { ...typography.body, color: colors.inkSubtle, paddingVertical: spacing.sm },
  empty: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    padding: spacing.md, backgroundColor: colors.panel,
  },
  emptyText: { ...typography.body, color: colors.inkSubtle },
});
