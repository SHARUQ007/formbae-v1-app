import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { peekCachedResource } from '../../services/appCache';
import { cancelMobileSubscription, fetchSettings, updateSettings, type MobileSettingsResponse } from '../../services/settingsService';
import { syncReminders } from '../../services/notificationService';
import { CACHE_KEYS, loadProfileSettingsCached } from '../../services/preloadService';
import { titleCase } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import type { ProfileStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>;

type NotificationPrefs = MobileSettingsResponse['notifications'];

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

function formatAccessDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatAccessWindow(access: NonNullable<Awaited<ReturnType<typeof fetchSettings>>['access']>) {
  const start = formatAccessDate(access.premiumStartDate);
  const end = formatAccessDate(access.premiumEndDate);
  if (start && end) return `${start} - ${end}`;
  if (end) return `Until ${end}`;
  return 'No active paid access';
}

function compactValue(value?: string) {
  const trimmed = String(value || '').trim();
  return trimmed.length ? trimmed : 'Not set';
}

function isPlaceholderName(value?: string) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return !normalized || normalized === 'trainee' || normalized === 'formbae trainee' || normalized === 'user' || normalized === 'formbae user';
}

function firstRealName(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const name = String(value || '').trim();
    if (!isPlaceholderName(name)) return name;
  }
  return 'FormBae Trainee';
}

export function ProfileScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { logout, status } = useAuthStore();
  const cached = useMemo(() => peekCachedResource<MobileSettingsResponse>(CACHE_KEYS.profileSettings), []);
  const [cancelling, setCancelling] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPrefs>(
    cached?.notifications ?? {
      workoutReminders: true,
      weeklyCheckInReminders: true,
      trainerMessageReminders: true,
    },
  );

  const { data, loading, error, reload, refresh, refreshing } = useAsync<MobileSettingsResponse>(async (mode) => {
    const settings = await loadProfileSettingsCached({ force: mode === 'refresh' });
    setNotifications(settings.notifications);
    syncReminders(settings.notifications).catch(() => undefined);
    return settings;
  });

  const current = data || cached;

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const previous = notifications;
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    try {
      await updateSettings({ [key]: value });
      await loadProfileSettingsCached({ force: true }).catch(() => undefined);
      await syncReminders(next).catch(() => undefined);
    } catch {
      setNotifications(previous);
    }
  };

  if (loading && !current) {
    return (
      <ScreenContainer>
        <ScreenTitle>Profile</ScreenTitle>
        <LoadingState message="Loading your profile..." />
      </ScreenContainer>
    );
  }

  if ((error || !current) && !cached) {
    return (
      <ScreenContainer>
        <ScreenTitle>Profile</ScreenTitle>
        <ErrorState message={error || 'Could not load your profile.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const profile = (current?.profile ?? {}) as Record<string, string>;
  const access = current?.access ?? {};
  const lifestyle = parseJsonRecord(profile.lifestyleJson);
  const languages = parseLanguages(profile.languagePreferencesJson);
  const workoutSetting = lifestyle.workoutSetting === 'home' ? 'Home' : lifestyle.workoutSetting === 'gym' ? 'Gym' : '';
  const accessActive = access.tier === 'premium' || status?.hasPaid;
  const accessLabel = String(access.label || (accessActive ? 'Active' : 'Payment required'));
  const planName = typeof access.planName === 'string' ? access.planName : '';
  const displayName = firstRealName(current?.user?.name, profile.name, lifestyle.name, lifestyle.fullName, lifestyle.firstName, status?.name);
  const displayContact = current?.user?.mobile || status?.phone || status?.email || '';

  const planRows = [
    { icon: 'target', label: 'Goal', value: titleCase(profile.fitnessGoal) },
    { icon: 'calendar', label: 'Training', value: profile.trainingDays ? `${profile.trainingDays}/week` : '' },
    { icon: 'map-pin', label: 'Workout', value: workoutSetting },
    { icon: 'coffee', label: 'Diet', value: titleCase(profile.dietPref) },
  ];

  const bodyRows = [
    { icon: 'user', label: 'Age', value: profile.age },
    { icon: 'maximize-2', label: 'Height', value: profile.height ? `${profile.height} cm` : '' },
    { icon: 'activity', label: 'Weight', value: profile.weight ? `${profile.weight} kg` : '' },
    { icon: 'users', label: 'Gender', value: titleCase(profile.gender) },
    ...(languages.length ? [{ icon: 'message-circle', label: 'Languages', value: languages.join(', ') }] : []),
    ...(profile.allergies ? [{ icon: 'file-text', label: 'Notes', value: profile.allergies }] : []),
  ];

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
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>Profile</ScreenTitle>
        {loading && cached ? <Text style={styles.syncing}>Refreshing latest details...</Text> : null}

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroAvatarRing}>
              <Avatar name={displayName} iconId={profile.avatarIcon} size={60} tone="neutral" />
            </View>
            <TouchableOpacity style={styles.iconAction} onPress={() => navigation.navigate('EditProfile')} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Feather name="edit-3" size={19} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.phone}>{displayContact}</Text>
          <View style={styles.heroBadge}>
            <Feather name={accessActive ? 'shield' : 'alert-circle'} size={16} color={accessActive ? colors.accentDark : colors.warn} />
            <Text style={[styles.heroBadgeText, !accessActive && styles.warnText]}>{accessLabel}{planName ? ` · ${planName}` : ''}</Text>
          </View>
        </View>

        <SectionHeading title="Plan" />
        <View style={styles.listPanel}>
          {planRows.map((item, index) => (
            <ProfileRow key={item.label} icon={item.icon} label={item.label} value={compactValue(item.value)} isLast={index === planRows.length - 1} />
          ))}
        </View>

        <SectionHeading title="Body Profile" />
        <View style={styles.listPanel}>
          {bodyRows.map((item, index) => (
            <ProfileRow key={item.label} icon={item.icon} label={item.label} value={compactValue(item.value)} isLast={index === bodyRows.length - 1} />
          ))}
        </View>

        <SectionHeading title="Access" />
        <View style={styles.accessCard}>
          <View style={styles.accessHeader}>
            <View style={styles.accessIcon}>
              <Feather name="credit-card" size={22} color={colors.gold} />
            </View>
            <View style={styles.accessText}>
              <Text style={styles.accessTitle}>{accessActive ? 'Access active' : 'Access required'}</Text>
              <Text style={styles.accessSubtitle}>{accessLabel}</Text>
            </View>
          </View>
          <View style={styles.accessRows}>
            <PlainRow label="Access window" value={formatAccessWindow(access)} isLast />
          </View>
          <View style={styles.managePanel}>
            <View style={styles.manageHeader}>
              <View style={styles.manageIcon}>
                <Feather name="settings" size={20} color={colors.accentDark} />
              </View>
              <View style={styles.manageCopy}>
                <Text style={styles.manageTitle}>Manage subscription</Text>
                <Text style={styles.manageText}>
                  Refund requests: <Text style={styles.supportEmail}>team@formbae.in</Text>. Send your payment ID or mobile number within 5 days of payment for review.
                </Text>
              </View>
            </View>
            {accessActive ? (
              <TouchableOpacity activeOpacity={0.8} style={styles.cancelButton} onPress={confirmCancel} disabled={cancelling}>
                <Feather name="x-circle" size={16} color={colors.error} />
                <Text style={styles.cancelButtonText}>{cancelling ? 'Cancelling...' : 'Cancel subscription'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <SectionHeading title="Notifications" />
        <View style={styles.listPanel}>
          <ToggleRow icon="activity" label="Workout reminders" value={notifications.workoutReminders} onChange={(v) => toggle('workoutReminders', v)} />
          <ToggleRow icon="calendar" label="Weekly check-ins" value={notifications.weeklyCheckInReminders} onChange={(v) => toggle('weeklyCheckInReminders', v)} />
          <ToggleRow icon="message-circle" label="Trainer messages" value={notifications.trainerMessageReminders} onChange={(v) => toggle('trainerMessageReminders', v)} isLast />
        </View>

        <SectionHeading title="Account" />
        <View style={styles.listPanel}>
          <ActionRow icon="award" label="Your coach" value="Profile, chat, change" onPress={() => navigation.navigate('Trainer')} />
          <ActionRow icon="file-text" label="Legal & support" onPress={() => navigation.navigate('Legal')} />
          <ActionRow icon="trash-2" label="Delete account" tone="danger" onPress={() => navigation.navigate('DeleteAccount')} isLast />
        </View>

        <PrimaryButton title="Log out" icon="log-out" variant="secondary" onPress={() => logout()} style={styles.logout} />
        <Text style={styles.version}>FormBae · v1.0.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <Text style={styles.sectionHeading}>{title}</Text>;
}

function ProfileRow({ icon, label, value, isLast }: { icon: string; label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.profileRow, !isLast && styles.profileRowBorder]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={17} color={colors.ink} />
      </View>
      <View style={styles.profileRowText}>
        <Text style={styles.profileRowLabel}>{label}</Text>
        <Text style={styles.profileRowValue}>{value}</Text>
      </View>
    </View>
  );
}

function PlainRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.plainRow, !isLast && styles.profileRowBorder]}>
      <Text style={styles.plainLabel}>{label}</Text>
      <Text style={styles.plainValue}>{value || '-'}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange, isLast }: { icon: string; label: string; value: boolean; onChange: (v: boolean) => void; isLast?: boolean }) {
  return (
    <View style={[styles.toggleRow, isLast && styles.noBorder]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={17} color={colors.inkMuted} />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.goldMuted, false: colors.borderStrong }}
        thumbColor={value ? colors.primaryAction : colors.inkMuted}
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}

function ActionRow({ icon, label, value, tone, onPress, isLast }: { icon: string; label: string; value?: string; tone?: 'danger'; onPress: () => void; isLast?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={[styles.actionRow, isLast && styles.noBorder]}>
      <View style={[styles.rowIcon, tone === 'danger' && styles.dangerIcon]}>
        <Feather name={icon} size={17} color={tone === 'danger' ? colors.error : colors.inkMuted} />
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, tone === 'danger' && styles.dangerText]}>{label}</Text>
        {value ? <Text style={styles.actionValue}>{value}</Text> : null}
      </View>
      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  syncing: { ...typography.caption, color: colors.inkSubtle, marginTop: -spacing.sm, marginBottom: spacing.md },
  heroCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    ...shadows.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconAction: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  heroAvatarRing: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, padding: 3 },
  name: { ...typography.hero, color: colors.ink, marginTop: spacing.md },
  phone: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  heroBadge: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  heroBadgeText: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  warnText: { color: colors.warn },
  sectionHeading: {
    ...typography.bodyBold,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  listPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  profileRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  profileRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  noBorder: { borderBottomWidth: 0 },
  profileRowText: { flex: 1 },
  profileRowLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
  profileRowValue: { ...typography.bodyBold, color: colors.ink },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
  },
  plainLabel: { ...typography.caption, color: colors.inkMuted, flex: 0.7 },
  plainValue: { ...typography.bodyBold, color: colors.ink, flex: 1, textAlign: 'right' },
  accessCard: { borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  accessHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  accessIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  accessText: { flex: 1 },
  accessTitle: { ...typography.title, color: colors.ink },
  accessSubtitle: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  accessRows: { marginTop: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.xs },
  managePanel: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md, gap: spacing.md },
  manageHeader: { flexDirection: 'row', gap: spacing.sm },
  manageIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  manageCopy: { flex: 1 },
  manageTitle: { ...typography.bodyBold, color: colors.ink },
  manageText: { ...typography.caption, color: colors.inkMuted, marginTop: 2, lineHeight: 20 },
  supportEmail: { color: colors.accentDark, fontWeight: '800' },
  cancelButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.errorLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: { ...typography.caption, color: colors.error, fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dangerIcon: { backgroundColor: colors.errorLight },
  toggleLabel: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionText: { flex: 1 },
  actionLabel: { ...typography.bodyBold, color: colors.ink },
  actionValue: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  dangerText: { color: colors.error },
  logout: { marginTop: spacing.lg },
  version: { ...typography.caption, textAlign: 'center', color: colors.inkSubtle, marginTop: spacing.md },
});
