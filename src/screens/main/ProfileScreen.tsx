import { useState } from 'react';
import { ScrollView, Text, StyleSheet, Switch, View, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { ListRow } from '../../components/ListRow';
import { Divider } from '../../components/Divider';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchSettings, updateSettings } from '../../services/settingsService';
import { syncReminders } from '../../services/notificationService';
import { titleCase } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import type { ProfileStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>Profile</ScreenTitle>

        <Card>
          <View style={styles.headerRow}>
            <Avatar name={status?.name} size={60} />
            <View style={styles.headerText}>
              <Text style={styles.name}>{status?.name || 'FormBae Trainee'}</Text>
              <Text style={styles.phone}>{status?.phone || ''}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            {status?.hasPaid ? (
              <Badge label={`Active plan${planName ? ` · ${planName}` : ''}`} tone="success" icon="check-circle" />
            ) : (
              <Badge label="Payment required" tone="warn" icon="alert-circle" />
            )}
          </View>
        </Card>

        <SectionTitle>Your details</SectionTitle>
        <Card>
          <ListRow icon="edit-3" label="Edit profile" onPress={() => navigation.navigate('EditProfile')} />
          {details.length > 0 ? <Divider inset={54} /> : null}
          {details.length > 0 ? (
            details.map(([label, value], i) => (
              <View key={label}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Complete your questionnaire to see your fitness summary here.</Text>
          )}
        </Card>

        <SectionTitle>Notifications</SectionTitle>
        <Card>
          <ToggleRow label="Workout reminders" value={notifications.workoutReminders} onChange={(v) => toggle('workoutReminders', v)} />
          <Divider />
          <ToggleRow label="Weekly check-in reminders" value={notifications.weeklyCheckInReminders} onChange={(v) => toggle('weeklyCheckInReminders', v)} />
          <Divider />
          <ToggleRow label="Trainer message reminders" value={notifications.trainerMessageReminders} onChange={(v) => toggle('trainerMessageReminders', v)} />
        </Card>

        <SectionTitle>Coaching</SectionTitle>
        <Card>
          <ListRow icon="award" label="Your coach" value="Profile, chat, change" onPress={() => navigation.navigate('Trainer')} />
        </Card>

        <SectionTitle>Account & legal</SectionTitle>
        <Card>
          <ListRow icon="file-text" label="Legal & support" onPress={() => navigation.navigate('Legal')} />
          <Divider inset={54} />
          <ListRow icon="trash-2" label="Delete account" tone="danger" onPress={() => navigation.navigate('DeleteAccount')} />
        </Card>

        <PrimaryButton title="Log out" icon="log-out" variant="secondary" onPress={() => logout()} style={styles.logout} />
        <Text style={styles.version}>FormBae · v1.0.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.borderStrong }} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  name: { ...typography.title, color: colors.ink },
  phone: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  badgeRow: { marginTop: spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  detailLabel: { ...typography.body, color: colors.inkMuted },
  detailValue: { ...typography.bodyBold, color: colors.ink, flexShrink: 1, textAlign: 'right', paddingLeft: spacing.md },
  muted: { ...typography.body, color: colors.inkMuted },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44 },
  toggleLabel: { ...typography.body, color: colors.ink, flex: 1, paddingRight: spacing.md },
  logout: { marginTop: spacing.lg },
  version: { ...typography.caption, textAlign: 'center', color: colors.inkSubtle, marginTop: spacing.md },
});
