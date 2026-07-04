import { useState } from 'react';
import { ScrollView, Text, StyleSheet, Switch, View, RefreshControl, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchSettings, updateSettings } from '../../services/settingsService';
import { syncReminders } from '../../services/notificationService';
import { titleCase } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import type { ProfileStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>;

type NotificationPrefs = {
  workoutReminders: boolean;
  weeklyCheckInReminders: boolean;
  trainerMessageReminders: boolean;
};

export function ProfileScreen({ navigation }: Props) {
  const { logout, status } = useAuthStore();
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    workoutReminders: true,
    weeklyCheckInReminders: true,
    trainerMessageReminders: true,
  });

  const { data, loading, error, reload, refresh, refreshing } = useAsync(async () => {
    const settings = await fetchSettings();
    setNotifications(settings.notifications);
    syncReminders(settings.notifications).catch(() => undefined);
    return settings;
  });

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    try {
      await updateSettings({ [key]: value });
      await syncReminders(next).catch(() => undefined);
    } catch {
      setNotifications(notifications);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Profile</ScreenTitle>
        <LoadingState message="Loading your profile…" />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ScreenTitle>Profile</ScreenTitle>
        <ErrorState message={error || 'Could not load your profile.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const profile = (data.profile ?? {}) as Record<string, string>;
  const access = (data.access ?? {}) as Record<string, unknown>;
  const planName = typeof access.planName === 'string' ? access.planName : '';

  const details: Array<[string, string]> = [
    ['Goal', titleCase(profile.fitnessGoal)],
    ['Gender', titleCase(profile.gender)],
    ['Age', profile.age],
    ['Height', profile.height ? `${profile.height} cm` : ''],
    ['Weight', profile.weight ? `${profile.weight} kg` : ''],
    ['Diet', titleCase(profile.dietPref)],
    ['Training days', profile.trainingDays],
    ['Injuries / notes', profile.allergies],
  ].filter(([, v]) => v && v.trim().length > 0) as Array<[string, string]>;

  return (
    <ScreenContainer>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ScreenTitle>Profile</ScreenTitle>

        <Card>
          <Text style={styles.name}>{status?.name || 'FormBae Trainee'}</Text>
          <Text style={styles.phone}>{status?.phone || ''}</Text>
          <View style={[styles.badge, status?.hasPaid ? styles.badgePaid : styles.badgeFree]}>
            <Text style={[styles.badgeText, status?.hasPaid ? styles.badgeTextPaid : styles.badgeTextFree]}>
              {status?.hasPaid ? `Active plan${planName ? ` · ${planName}` : ''}` : 'Payment required'}
            </Text>
          </View>
        </Card>

        {details.length > 0 ? (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Your details</Text>
            {details.map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Your details</Text>
            <Text style={styles.muted}>Complete your questionnaire to see your fitness summary here.</Text>
          </Card>
        )}

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Notification preferences</Text>
          <Row label="Workout reminders" value={notifications.workoutReminders} onChange={(v) => toggle('workoutReminders', v)} />
          <Row label="Weekly check-in reminders" value={notifications.weeklyCheckInReminders} onChange={(v) => toggle('weeklyCheckInReminders', v)} />
          <Row label="Trainer message reminders" value={notifications.trainerMessageReminders} onChange={(v) => toggle('trainerMessageReminders', v)} />
          <Text style={styles.todo}>
            Local reminders are scheduled on this device. Server push (FCM/APNs) activates automatically once Firebase config is added.
          </Text>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account & legal</Text>
          <LinkRow label="Legal & support" onPress={() => navigation.navigate('Legal')} />
          <LinkRow label="Delete account" destructive onPress={() => navigation.navigate('DeleteAccount')} />
        </Card>

        <PrimaryButton title="Log out" variant="secondary" onPress={() => logout()} />
        <Text style={styles.version}>FormBae · v1.0.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function LinkRow({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <TouchableOpacity
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.linkLabel, destructive && styles.linkDestructive]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '700', color: colors.ink },
  phone: { color: colors.inkMuted, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  badgePaid: { backgroundColor: colors.accentLight },
  badgeFree: { backgroundColor: '#fff4e6' },
  badgeText: { fontWeight: '700', fontSize: 13 },
  badgeTextPaid: { color: colors.accentDark },
  badgeTextFree: { color: colors.warn },
  section: { marginTop: 12 },
  sectionTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8, color: colors.ink },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.inkMuted },
  detailValue: { color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right', paddingLeft: 12 },
  muted: { color: colors.inkMuted, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { color: colors.ink, flex: 1, paddingRight: 12 },
  todo: { marginTop: 12, fontSize: 12, color: colors.inkMuted },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, minHeight: 48 },
  linkLabel: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  linkDestructive: { color: colors.error },
  chevron: { fontSize: 22, color: colors.inkMuted },
  version: { textAlign: 'center', color: colors.inkMuted, fontSize: 12, marginTop: 16 },
});
