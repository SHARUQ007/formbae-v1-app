/**
 * Live sessions with your coach: what is booked, and how to book more.
 *
 * The same two pieces the web shows, in the same order - the appointment you already have
 * at the top, then the calendar to take another time. They read and write the same
 * `trainer_bookings` rows the web trainer page creates, so a session booked here shows up
 * there and vice versa.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { SlotCalendar } from '../../components/SlotCalendar';
import {
  bookCoachSession,
  cancelCoachSession,
  canStillChange,
  fetchCoachSlots,
  fetchMySessions,
  formatSlotRange,
  type CoachSession,
  type CoachSlot,
} from '../../services/coachSessionService';
import { apiErrorCode } from '../../services/apiClient';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'CoachSessions'>;

export function CoachSessionsScreen({ route, navigation }: Props) {
  const { trainerId, trainerName } = route.params;
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [slots, setSlots] = useState<CoachSlot[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    const [mine, open] = await Promise.all([
      fetchMySessions().catch(() => [] as CoachSession[]),
      fetchCoachSlots(trainerId).catch(() => [] as CoachSlot[]),
    ]);
    setSessions(mine);
    setSlots(open);
    // A slot that has gone since the list was drawn must not stay selected, or the button
    // would offer to book something that is no longer there.
    setSelectedBookingId((current) => (open.some((slot) => slot.bookingId === current) ? current : ''));
  }, [trainerId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirm = async () => {
    if (!selectedBookingId || booking) return;
    setBooking(true);
    try {
      await bookCoachSession(selectedBookingId);
      setSelectedBookingId('');
      await load();
    } catch (error) {
      // Somebody else can take a slot between the list being drawn and this tap, which is
      // exactly what the server's conditional claim is there to catch. Reload so the list
      // stops offering it rather than leaving a button that will fail again.
      if (apiErrorCode(error) === 'SLOT_TAKEN') {
        Alert.alert('Just taken', 'Somebody booked that time first. Please pick another.');
        await load();
        return;
      }
      Alert.alert('Could not book', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const cancel = (session: CoachSession) => {
    Alert.alert('Cancel this session?', formatSlotRange(session.slotStart, session.slotEnd), [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelCoachSession(session.bookingId);
            await load();
          } catch (error) {
            Alert.alert('Could not cancel', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const join = (session: CoachSession) => {
    if (!session.meetingUrl) return;
    Linking.openURL(session.meetingUrl).catch(() => {
      Alert.alert('Could not open the meeting', 'Please try again when you are connected.');
    });
  };

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <View style={styles.topActions}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.quietAction}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={14} color={colors.inkSubtle} />
          <Text style={styles.quietActionText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.inkSubtle} />}
      >
        <View>
          <Text style={styles.title}>Live sessions</Text>
          <Text style={styles.subtitle}>
            {trainerName ? `One-to-one time with ${trainerName}.` : 'One-to-one time with your coach.'}
          </Text>
        </View>

        {loading ? (
          <LoadingState message="Loading your sessions…" />
        ) : (
          <>
            {sessions.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Booked</Text>
                {sessions.map((session) => (
                  <View key={session.bookingId} style={styles.sessionCard}>
                    <Text style={styles.sessionWhen}>{formatSlotRange(session.slotStart, session.slotEnd)}</Text>
                    <Text style={styles.sessionNote}>
                      {session.joinable
                        ? 'Your coach is expecting you now.'
                        : 'The join link opens ten minutes before you start.'}
                    </Text>
                    <View style={styles.sessionActions}>
                      {session.joinable && session.meetingUrl ? (
                        <TouchableOpacity
                          onPress={() => join(session)}
                          style={styles.joinButton}
                          accessibilityRole="button"
                          accessibilityLabel="Join session"
                        >
                          <Feather name="video" size={15} color={colors.onPrimary} />
                          <Text style={styles.joinText}>Join session</Text>
                        </TouchableOpacity>
                      ) : null}
                      {canStillChange(session.slotStart) ? (
                        <TouchableOpacity
                          onPress={() => cancel(session)}
                          style={styles.cancelButton}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel session"
                        >
                          <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      ) : (
                        // The same rule and the same words as the web page, because it is
                        // the same booking.
                        <Text style={styles.closedText}>Changes close 24h before</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{sessions.length ? 'Book another' : 'Book a session'}</Text>
              <SlotCalendar
                slots={slots}
                selectedBookingId={selectedBookingId}
                onSelect={setSelectedBookingId}
                emptyMessage="Your coach hasn’t opened any times yet. Pull down to check again."
              />
            </View>

            {slots.length ? (
              <PrimaryButton
                title={selectedBookingId ? 'Confirm booking' : 'Pick a time'}
                icon="arrow-right"
                onPress={confirm}
                loading={booking}
                disabled={!selectedBookingId}
                size="lg"
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topActions: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  quietAction: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: spacing.xs },
  quietActionText: { ...typography.caption, color: colors.inkSubtle },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkSubtle, marginTop: spacing.xs },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.inkMuted },
  sessionCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl,
    padding: spacing.md, backgroundColor: colors.panel, gap: spacing.xs,
  },
  sessionWhen: { ...typography.bodyBold, color: colors.ink },
  sessionNote: { ...typography.caption, color: colors.inkSubtle },
  sessionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  joinButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primaryAction,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  joinText: { ...typography.caption, color: colors.onPrimary, fontWeight: '700' },
  cancelButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  cancelText: { ...typography.caption, color: colors.error, fontWeight: '600' },
  closedText: { ...typography.caption, color: colors.inkSubtle },
});
