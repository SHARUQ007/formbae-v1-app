import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { ProfileGymSection } from '../../components/ProfileGymSection';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { peekCachedResource } from '../../services/appCache';
import { cancelMobileSubscription, fetchSettings, updateSettings, type MobileSettingsResponse } from '../../services/settingsService';
import { fetchGym, type GymPlace } from '../../services/gymService';
import { syncReminders } from '../../services/notificationService';
import { CACHE_KEYS, loadProfileSettingsCached } from '../../services/preloadService';
import { titleCase } from '../../utils/format';
import { getBodyProfileArtwork, getPlanProfileArtwork } from '../../utils/profileArtwork';
import { useAuthStore } from '../../store/authStore';
import type { ProfileStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
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
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
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
  if (access.inGracePeriod && access.graceEndDate) return `Grace period ends ${formatAccessDate(access.graceEndDate)}`;
  const start = formatAccessDate(access.premiumStartDate);
  const end = formatAccessDate(access.premiumEndDate);
  if (start && end) return `${start} - ${end}`;
  if (end) return `Until ${end}`;
  return 'No active paid access';
}

function isPlaceholderName(value?: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
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
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const { logout, status } = useAuthStore();
  const cached = useMemo(() => peekCachedResource<MobileSettingsResponse>(CACHE_KEYS.profileSettings), []);
  const [cancelling, setCancelling] = useState(false);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [selectedGym, setSelectedGym] = useState<GymPlace | null>(null);
  const [gymLoading, setGymLoading] = useState(false);
  const hasFocusedRef = useRef(false);
  const [notifications, setNotifications] = useState<NotificationPrefs>(
    cached?.notifications ?? {
      workoutReminders: true,
      weeklyCheckInReminders: true,
      trainerMessageReminders: true,
    },
  );

  const { data, loading, error, reload, refresh, refreshing } = useAsync<MobileSettingsResponse>(async () => {
    const settings = await loadProfileSettingsCached({
      // Keep cached content on screen, but always revalidate profile metrics.
      // Body measurements can change from Progress or another device.
      force: true,
    });
    setNotifications(settings.notifications);
    syncReminders(settings.notifications).catch(() => undefined);
    return settings;
  }, [], { initialData: cached ?? null });

  const current = data || cached;
  const profile = (current?.profile ?? {}) as Record<string, string>;
  const lifestyle = parseJsonRecord(profile.lifestyleJson);
  const selectedGymPlaceId = lifestyle.selectedGymPlaceId || '';

  useFocusEffect(useCallback(() => {
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true;
      return;
    }
    reload().catch(() => undefined);
  }, [reload]));

  useEffect(() => {
    if (!selectedGymPlaceId) {
      setSelectedGym(null);
      setGymLoading(false);
      return;
    }
    const controller = new AbortController();
    setGymLoading(true);
    setSelectedGym(null);
    fetchGym(selectedGymPlaceId, controller.signal)
      .then((place) => { if (!controller.signal.aborted) setSelectedGym(place); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSelectedGym(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setGymLoading(false);
      });
    return () => controller.abort();
  }, [selectedGymPlaceId]);

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

  const access = current?.access ?? {};
  const languages = parseLanguages(profile.languagePreferencesJson);
  const workoutSetting = lifestyle.workoutSetting === 'home' ? 'Home' : lifestyle.workoutSetting === 'gym' ? 'Gym' : '';
  const accessActive = access.tier === 'premium' || status?.hasPaid;
  const inGrace = Boolean(access.inGracePeriod || status?.subscription?.state === 'grace');
  const graceDaysRemaining = access.graceDaysRemaining ?? status?.subscription?.graceDaysRemaining ?? 0;
  const accessLabel = String(access.label || (accessActive ? 'Active' : 'Payment required'));
  const planName = typeof access.planName === 'string' ? access.planName : '';
  const displayName = firstRealName(current?.user?.name, profile.name, lifestyle.name, lifestyle.fullName, lifestyle.firstName, status?.name);
  const displayContact = current?.user?.mobile || status?.phone || status?.email || '';
  const editProfile = () => navigation.navigate('EditProfile');
  const openRenewal = () => navigation.getParent()?.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('Renewal');

  const bodyMetrics = [
    { label: 'Age', value: profile.age ? `${profile.age} yrs` : '' },
    { label: 'Height', value: profile.height ? `${profile.height} cm` : '' },
    { label: 'Weight', value: profile.weight ? `${profile.weight} kg` : '' },
    { label: 'Gender', value: titleCase(profile.gender) },
  ].filter((item) => Boolean(item.value));

  const measurementMetrics = [
    { label: 'Chest', value: profile.chest ? `${profile.chest} cm` : '' },
    { label: 'Waist', value: profile.waist ? `${profile.waist} cm` : '' },
    { label: 'Biceps', value: profile.biceps ? `${profile.biceps} cm` : '' },
  ].filter((item) => Boolean(item.value));

  const planGoal = titleCase(profile.fitnessGoal) || 'Set your direction';
  const planFacts = [
    {
      label: 'Training',
      value: profile.trainingDays ? `${profile.trainingDays} days / week` : '',
    },
    { label: 'Setting', value: workoutSetting },
    { label: 'Food style', value: titleCase(profile.dietPref) },
  ].filter((item) => Boolean(item.value));
  const bodyArtwork = getBodyProfileArtwork(profile.gender);
  const planArtwork = getPlanProfileArtwork(profile.gender);
  const compactProfile = viewportWidth < 380 || fontScale >= 1.18;
  const largeText = fontScale >= 1.18;
  const availableArtworkWidth = Math.max(280, viewportWidth - spacing.lg * 2);
  const artworkHeight = Math.round(
    Math.max(184, Math.min(210, availableArtworkWidth / 1.9)) + (largeText ? 24 : 0),
  );

  const confirmCancel = () => {
    Alert.alert('Cancel subscription?', 'Cancelling removes app access immediately. Refund review is handled separately by email within the eligible 5-day window.', [
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
    ]);
  };

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.screenScroll}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: tabBarHeight + spacing.md }}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>Profile</ScreenTitle>

        <View style={styles.bodyProfileCard} testID="profile-summary-card">
          <View style={styles.profileIdentityRow}>
            <View style={styles.heroAvatarRing}>
              <Avatar name={displayName} iconId={profile.avatarIcon} size={compactProfile ? 40 : 52} tone="neutral" />
            </View>
            <View style={styles.heroIdentity}>
              <Text style={styles.name} numberOfLines={2}>
                {displayName}
              </Text>
              {displayContact ? (
                <Text style={styles.phone} numberOfLines={1}>
                  {displayContact}
                </Text>
              ) : null}
              <View style={styles.heroStatus}>
                <View style={[styles.statusDot, !accessActive && styles.statusDotWarn]} />
                <Text style={[styles.heroBadgeText, !accessActive && styles.warnText]} numberOfLines={1}>
                  {accessLabel}
                  {planName ? ` · ${planName}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.iconAction} onPress={editProfile} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Feather name="edit-3" size={18} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          <View style={[styles.bodyArtworkFrame, largeText && styles.bodyArtworkFrameLarge]}>
            <Image
              source={bodyArtwork}
              style={styles.bodyArtwork}
              resizeMode="cover"
              accessible={false}
              accessibilityIgnoresInvertColors
              testID="body-profile-artwork"
            />
            <LinearGradient
              colors={['rgba(5,6,10,0.94)', 'rgba(5,6,10,0.58)', 'rgba(5,6,10,0.08)']}
              locations={[0, 0.48, 0.82]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.bodyArtworkShade}
              pointerEvents="none"
            />
            <View style={styles.bodyArtworkCopy}>
              <Text style={styles.artworkOverline}>AT A GLANCE</Text>
              <Text style={styles.artworkTitle} numberOfLines={2}>
                Your baseline
              </Text>
              {!largeText ? <Text style={styles.artworkCaption}>Your numbers, kept simple.</Text> : null}
            </View>
          </View>

          {bodyMetrics.length ? (
            <View style={[styles.bodyMetricRow, compactProfile && styles.bodyMetricRowCompact]}>
              {bodyMetrics.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.bodyMetric,
                    compactProfile ? styles.bodyMetricCompact : styles.bodyMetricWide,
                    !compactProfile && index < bodyMetrics.length - 1 && styles.bodyMetricBorder,
                    compactProfile && index % 2 === 0 && index + 1 < bodyMetrics.length && styles.bodyMetricBorder,
                    compactProfile && bodyMetrics.length > 2 && index < 2 && styles.bodyMetricBottomBorder,
                  ]}
                >
                  <Text style={styles.bodyMetricLabel}>{item.label}</Text>
                  <Text style={styles.bodyMetricValue} numberOfLines={compactProfile ? 2 : 1} adjustsFontSizeToFit={!compactProfile} minimumFontScale={0.72}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.profileEmpty}>Add your body details to personalise training and progress.</Text>
          )}

          {measurementMetrics.length ? (
            <View style={styles.measurementRail}>
              <Text style={styles.detailLabel}>MEASUREMENTS</Text>
              <View style={styles.measurementValues}>
                {measurementMetrics.map((item) => (
                  <Text key={item.label} style={styles.measurementValue}>
                    {item.label} <Text style={styles.measurementNumber}>{item.value}</Text>
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {languages.length ? <ProfileDetail label="Languages" value={languages.join(', ')} /> : null}
          {profile.allergies ? <ProfileDetail label="Notes" value={profile.allergies} /> : null}
        </View>

        <SectionHeading title="Plan" action="Edit" onAction={editProfile} />
        <View style={styles.planCard} testID="plan-and-gym-card">
          <View style={[styles.planArtworkFrame, { height: artworkHeight }]}>
            <Image
              source={planArtwork}
              style={styles.planArtwork}
              resizeMode="cover"
              accessible={false}
              accessibilityIgnoresInvertColors
              testID="plan-profile-artwork"
            />
            <LinearGradient
              colors={['rgba(5,6,10,0.95)', 'rgba(5,6,10,0.62)', 'rgba(5,6,10,0.08)']}
              locations={[0, 0.5, 0.84]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.planArtworkShade}
              pointerEvents="none"
            />
            <View style={styles.planCopy}>
              <Text style={styles.artworkOverline}>YOUR PLAN</Text>
              <Text style={styles.planGoal} numberOfLines={compactProfile ? 3 : 2} adjustsFontSizeToFit={!compactProfile} minimumFontScale={0.82}>
                {planGoal}
              </Text>
              {!largeText ? <Text style={styles.planCaption}>Your routine at a glance.</Text> : null}
            </View>
          </View>
          {planFacts.length ? (
            <View style={styles.planFacts}>
              {planFacts.map((item, index) => (
                <View key={item.label} style={[styles.planFact, index < planFacts.length - 1 && styles.planFactBorder]}>
                  <Text style={styles.planFactLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.planFactValue} numberOfLines={compactProfile ? 2 : 1} adjustsFontSizeToFit={!compactProfile} minimumFontScale={0.72}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.planEmpty}>Add your goal and routine preferences.</Text>
          )}
          {workoutSetting === 'Gym' ? (
            <ProfileGymSection gym={selectedGym} saved={Boolean(selectedGymPlaceId)} loading={gymLoading}
              onSelect={() => navigation.navigate('GymPicker')} />
          ) : null}
        </View>

        <SectionHeading title="Access" />
        <View style={styles.accessCard}>
          <View style={styles.accessHeader}>
            <View style={styles.accessIcon}>
              <Feather name="credit-card" size={22} color={colors.gold} />
            </View>
            <View style={styles.accessText}>
              <Text style={styles.accessTitle}>{inGrace ? `${graceDaysRemaining} day${graceDaysRemaining === 1 ? '' : 's'} left to renew` : accessActive ? 'Access active' : 'Access required'}</Text>
              <Text style={styles.accessSubtitle}>{inGrace ? 'Full access continues during your grace period' : accessLabel}</Text>
            </View>
          </View>
          <View style={styles.accessRows}>
            <PlainRow label="Access window" value={formatAccessWindow(access)} isLast />
          </View>
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.manageDisclosure}
            onPress={() => setManageAccessOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
            accessibilityState={{ expanded: manageAccessOpen }}
          >
            <View style={styles.manageIcon}>
              <Feather name="settings" size={19} color={colors.accentDark} />
            </View>
            <View style={styles.manageCopy}>
              <Text style={styles.manageTitle}>Manage subscription</Text>
              <Text style={styles.manageSummary}>{inGrace ? 'Renewal and access options' : 'Refund and cancellation options'}</Text>
            </View>
            <Feather name={manageAccessOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSubtle} />
          </TouchableOpacity>
          {manageAccessOpen ? (
            <View style={styles.managePanel}>
              <Text style={styles.manageText}>
                {inGrace ? (
                  <>Renew before the grace period ends to keep your access uninterrupted.</>
                ) : (
                  <>
                    Refund requests: <Text style={styles.supportEmail}>team@formbae.in</Text>. Send your payment ID or mobile number within 5 days of payment for review.
                  </>
                )}
              </Text>
              {inGrace ? (
                <PrimaryButton title="Renew subscription" icon="arrow-right" onPress={openRenewal} style={styles.manageRenewButton} />
              ) : accessActive ? (
                <TouchableOpacity activeOpacity={0.8} style={styles.cancelButton} onPress={confirmCancel} disabled={cancelling}>
                  <Feather name="x-circle" size={16} color={colors.error} />
                  <Text style={styles.cancelButtonText}>{cancelling ? 'Cancelling...' : 'Cancel subscription'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
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

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeadingRow}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={`${action} ${title}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileDetail}>
      <Text style={styles.profileDetailLabel}>{label}</Text>
      <Text style={styles.profileDetailValue}>{value}</Text>
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
  screenScroll: { flex: 1 },
  scroll: {},

  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroIdentity: { flex: 1, minWidth: 0 },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarRing: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 3,
  },
  name: { ...typography.title, color: colors.ink },
  phone: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  heroStatus: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  statusDotWarn: { backgroundColor: colors.warn },
  heroBadgeText: { ...typography.caption, color: colors.gold, flexShrink: 1 },
  warnText: { color: colors.warn },
  sectionHeadingRow: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: { ...typography.bodyBold, color: colors.ink },
  sectionAction: {
    ...typography.label,
    color: colors.gold,
    paddingVertical: spacing.xs,
  },
  bodyProfileCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  bodyArtworkFrame: {
    height: 156,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  bodyArtworkFrameLarge: { height: 184 },
  bodyArtwork: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    // Preserve the source proportions and anchor its top edge. A percentage
    // height with cover would crop the head as the card gets shorter.
    height: undefined,
    aspectRatio: 1000 / 667,
  },
  bodyArtworkShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bodyArtworkCopy: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    width: '48%',
    justifyContent: 'center',
  },
  artworkOverline: { ...typography.overline, color: colors.gold },
  artworkTitle: {
    ...typography.title,
    color: colors.inkStrong,
    marginTop: spacing.xs,
    flexShrink: 1,
  },
  artworkCaption: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  bodyMetricRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bodyMetricRowCompact: { flexWrap: 'wrap' },
  bodyMetric: {
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  bodyMetricWide: { flex: 1 },
  bodyMetricCompact: { width: '50%' },
  bodyMetricBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  bodyMetricBottomBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  bodyMetricLabel: {
    ...typography.overline,
    color: colors.inkSubtle,
    fontSize: 9,
    letterSpacing: 1,
  },
  bodyMetricValue: { ...typography.bodyBold, color: colors.ink, marginTop: 3 },
  profileEmpty: {
    ...typography.caption,
    color: colors.inkMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  measurementRail: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  detailLabel: { ...typography.overline, color: colors.inkSubtle, fontSize: 9 },
  measurementValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  measurementValue: { ...typography.caption, color: colors.inkMuted },
  measurementNumber: { color: colors.ink, fontWeight: '700' },
  profileDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  profileDetailLabel: {
    ...typography.caption,
    color: colors.inkSubtle,
    width: 76,
  },
  profileDetailValue: {
    ...typography.caption,
    color: colors.ink,
    flex: 1,
    textAlign: 'right',
  },
  planCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  planArtworkFrame: {
    height: 184,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  planArtwork: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  planArtworkShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  planCopy: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    width: '48%',
    justifyContent: 'center',
  },
  planGoal: {
    ...typography.title,
    color: colors.inkStrong,
    marginTop: spacing.xs,
    flexShrink: 1,
  },
  planCaption: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  planFacts: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  planFact: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  planFactBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  planFactLabel: { ...typography.overline, color: colors.inkSubtle, fontSize: 9, letterSpacing: 1 },
  planFactValue: {
    ...typography.label,
    color: colors.ink,
    marginTop: 3,
  },
  planEmpty: {
    ...typography.caption,
    color: colors.inkMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  listPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  profileRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  noBorder: { borderBottomWidth: 0 },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
  },
  plainLabel: { ...typography.caption, color: colors.inkMuted, flex: 0.7 },
  plainValue: {
    ...typography.bodyBold,
    color: colors.ink,
    flex: 1,
    textAlign: 'right',
  },
  accessCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  accessHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  accessIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessText: { flex: 1 },
  accessTitle: { ...typography.title, color: colors.ink },
  accessSubtitle: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  accessRows: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
  },
  manageDisclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 58,
    marginTop: spacing.sm,
  },
  managePanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  manageHeader: { flexDirection: 'row', gap: spacing.sm },
  manageIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageCopy: { flex: 1 },
  manageTitle: { ...typography.bodyBold, color: colors.ink },
  manageSummary: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  manageText: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 2,
    lineHeight: 20,
  },
  manageRenewButton: { marginTop: 0 },
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
  cancelButtonText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '800',
  },
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
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  version: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.inkSubtle,
    marginTop: spacing.md,
  },
});
