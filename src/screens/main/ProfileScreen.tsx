import { useState } from 'react';
import { Alert, Linking, ScrollView, Text, StyleSheet, Switch, TouchableOpacity, View, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { ListRow } from '../../components/ListRow';
import { Divider } from '../../components/Divider';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { cancelMobileSubscription, fetchSettings, updateSettings } from '../../services/settingsService';
import { syncReminders } from '../../services/notificationService';
import { loadProfileSettingsCached } from '../../services/preloadService';
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

function parseJsonRecord(raw?: string) {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '').trim()]));
    }
  } catch {
    return {};
  }
  return {};
}

function parseLanguages(raw?: string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry).trim()).filter(Boolean);
  } catch {
    return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function formatAccessWindow(access: NonNullable<Awaited<ReturnType<typeof fetchSettings>>['access']>) {
  if (access.premiumStartDate && access.premiumEndDate) return `${access.premiumStartDate} to ${access.premiumEndDate}`;
  return 'No active paid window';
}

export function ProfileScreen({ navigation }: Props) {
  const { logout, status } = useAuthStore();
  const [cancelling, setCancelling] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    workoutReminders: true,
    weeklyCheckInReminders: true,
    trainerMessageReminders: true,
  });

  const { data, loading, error, reload, refresh, refreshing } = useAsync(async (mode) => {
    const settings = await loadProfileSettingsCached({ force: mode === 'refresh' });
    setNotifications(settings.notifications);
    syncReminders(settings.notifications).catch(() => undefined);
    return settings;
  });

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    try {
      await updateSettings({ [key]: value });
      await loadProfileSettingsCached({ force: true }).catch(() => undefined);
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
  const access = data.access ?? {};
  const planName = typeof access.planName === 'string' ? access.planName : '';
  const lifestyle = parseJsonRecord(profile.lifestyleJson);
  const languages = parseLanguages(profile.languagePreferencesJson);
  const workoutSetting = lifestyle.workoutSetting === 'home' ? 'Home' : lifestyle.workoutSetting === 'gym' ? 'Gym' : '';
  const accessActive = access.tier === 'premium' || status?.hasPaid;

  const details: Array<[string, string]> = [
    ['Profile icon', titleCase(profile.avatarIcon)],
    ['Goal', titleCase(profile.fitnessGoal)],
    ['Gender', titleCase(profile.gender)],
    ['Age', profile.age],
    ['Height', profile.height ? `${profile.height} cm` : ''],
    ['Weight', profile.weight ? `${profile.weight} kg` : ''],
    ['Diet', titleCase(profile.dietPref)],
    ['Training days', profile.trainingDays],
    ['Workout preference', workoutSetting],
    ['Languages', languages.join(', ')],
    ['Injuries / notes', profile.allergies],
  ].filter(([, v]) => v && v.trim().length > 0) as Array<[string, string]>;

  const requestRefund = async () => {
    const url = 'mailto:team@formbae.in?subject=5-day%20refund%20request';
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Refund request', 'Email team@formbae.in with your payment details within 5 days of payment.');
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel subscription?',
      'Cancelling removes app access immediately. Refund review is handled separately by email within the eligible 5-day window.',
      [
        { text: 'Keep access', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const result = await cancelMobileSubscription();
              await loadProfileSettingsCached({ force: true }).catch(() => undefined);
              await reload();
              Alert.alert('Subscription cancelled', result.message);
            } catch (e) {
              Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

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
            {accessActive ? (
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

        <SectionTitle>Access & refund</SectionTitle>
        <Card>
          <View style={styles.accessGrid}>
            <InfoTile label="Status" value={access.label || (accessActive ? 'Active' : 'Open')} />
            <InfoTile label="Current window" value={formatAccessWindow(access)} />
            <InfoTile label="Days remaining" value={accessActive ? String(access.premiumDaysRemaining ?? 0) : '0'} />
          </View>
          <View style={styles.refundBox}>
            <Text style={styles.refundTitle}>5-day refund policy</Text>
            <Text style={styles.refundText}>
              Eligible purchases can be refunded within 5 days when you email team@formbae.in with your payment details.
            </Text>
            <View style={styles.refundActions}>
              <TouchableOpacity activeOpacity={0.75} style={styles.secondaryPill} onPress={requestRefund}>
                <Text style={styles.secondaryPillText}>Email refund request</Text>
              </TouchableOpacity>
              {accessActive ? (
                <TouchableOpacity activeOpacity={0.75} style={styles.dangerPill} onPress={confirmCancel} disabled={cancelling}>
                  <Text style={styles.dangerPillText}>{cancelling ? 'Cancelling…' : 'Cancel access'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Card>

        <SectionTitle>Notifications</SectionTitle>
        <Card>
          <Text style={styles.muted}>Daily workout reminders run from the app. Trainer/admin SMS pause controls still apply on web.</Text>
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
  accessGrid: { gap: spacing.sm },
  infoTile: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted, borderRadius: 18, padding: spacing.md },
  infoLabel: { ...typography.caption, color: colors.inkMuted },
  infoValue: { ...typography.bodyBold, color: colors.ink, marginTop: 3 },
  refundBox: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 18, padding: spacing.md, backgroundColor: colors.accentLight },
  refundTitle: { ...typography.bodyBold, color: colors.ink },
  refundText: { ...typography.caption, color: colors.inkMuted, marginTop: 4, lineHeight: 18 },
  refundActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  secondaryPill: { borderRadius: 999, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: 10 },
  secondaryPillText: { ...typography.caption, color: colors.accentDark },
  dangerPill: { borderRadius: 999, borderWidth: 1, borderColor: colors.errorLight, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: 10 },
  dangerPillText: { ...typography.caption, color: colors.error },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44 },
  toggleLabel: { ...typography.body, color: colors.ink, flex: 1, paddingRight: spacing.md },
  logout: { marginTop: spacing.lg },
  version: { ...typography.caption, textAlign: 'center', color: colors.inkSubtle, marginTop: spacing.md },
});

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}
