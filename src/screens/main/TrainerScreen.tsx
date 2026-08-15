import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, Card } from '../../components/Card';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { changeCoach } from '../../services/trainerService';
import { runNativeCheckout } from '../../services/paymentService';
import { loadCoachBundleCached, peekCoachBundleCached } from '../../services/preloadService';
import { useAuthStore } from '../../store/authStore';
import { getSiteUrl } from '../../constants/config';
import type { CoachOption, PaymentPlan } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type CoachTab = 'about' | 'change' | 'detail';

function photoUrl(value: string) {
  const url = value.trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${getSiteUrl()}${url}`;
  return url;
}

function formatPrice(value: string) {
  const amount = Number(String(value || '').replace(/,/g, '').trim());
  if (!Number.isFinite(amount) || amount <= 0) return 'Included';
  return `₹${amount.toLocaleString('en-IN')}/mo`;
}

function formatCoachLabel(coach: CoachOption) {
  const raw = String(coach.expertise || coach.trainerPersona || '').trim();
  const kind = String(coach.trainerKind || '').trim().toLowerCase();
  if (kind === 'ai' || raw === 'female_ai' || raw === 'male_ai') return 'AI trainer';
  const normalized = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Personal trainer';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function coachBlurb(coach: CoachOption) {
  const copy = String(coach.description || coach.detailedDescription || '').trim();
  if (copy) return copy;
  return isAiCoach(coach)
    ? 'AI planning, check-ins, and workout updates based on your logs.'
    : 'Personal guidance, workout reviews, and plan adjustments from your coach.';
}

function formatUnlockDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatNextSlot(value: string) {
  if (!value) return 'Choose after access';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Choose after access';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
}

function isAiCoach(coach: CoachOption) {
  const kind = String(coach.trainerKind || '').trim().toLowerCase();
  if (kind === 'ai') return true;
  if (kind === 'human') return false;
  const persona = String(coach.trainerPersona || '').trim().toLowerCase();
  if (persona === 'female_ai' || persona === 'male_ai') return true;
  const text = `${coach.name} ${coach.expertise} ${coach.description} ${coach.detailedDescription}`.toLowerCase();
  return /\b(ai trainer|ava)\b/.test(text);
}

function trainerUpgradePlan(coach: CoachOption): PaymentPlan | null {
  const amount = Math.round(Number(coach.upgradeAmountPaise || 0));
  if (!coach.paywallId || !Number.isFinite(amount) || amount < 100) return null;
  return {
    planId: '',
    planName: `${coach.name} coach access`,
    label: `${coach.name} coach access`,
    amount,
    planDuration: 'monthly',
    paywallId: coach.paywallId,
    flowSlug: 'mobile',
    billing: 'one_time',
  };
}

export function TrainerScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const [tab, setTab] = useState<CoachTab>('about');
  const [viewingCoach, setViewingCoach] = useState<CoachOption | null>(null);
  const [changingId, setChangingId] = useState('');
  const [payingTrainerId, setPayingTrainerId] = useState('');
  const { user, status, refreshStatus } = useAuthStore();

  const { data, loading, error, reload, refresh, refreshing } = useAsync((mode) =>
    loadCoachBundleCached({ force: mode === 'refresh' }),
  [], { initialData: peekCoachBundleCached() });

  const currentCoach = data?.coachHub.currentTrainer ?? data?.coachHub.trainers[0] ?? null;
  const selectedCoach = useMemo(
    () => data?.coachHub.trainers.find((coach) => coach.trainerId === currentCoach?.trainerId) ?? currentCoach,
    [currentCoach, data?.coachHub.trainers],
  );
  const currentIsAi = currentCoach ? isAiCoach(currentCoach) : false;

  const startTrainerUpgrade = useCallback(
    async (coach: CoachOption) => {
      const plan = trainerUpgradePlan(coach);
      if (!plan) {
        Alert.alert('Coach payment not ready', 'This coach does not have an enabled trainer paywall yet. Please try another coach or contact support.');
        return;
      }
      setPayingTrainerId(coach.trainerId);
      try {
        const result = await runNativeCheckout({
          plan,
          paywallId: coach.paywallId,
          selectedTrainerId: coach.trainerId,
          user: {
            name: status?.name || user?.name || 'FormBae Trainee',
            mobile: status?.phone || user?.mobile || '',
            email: status?.email,
          },
        });
        if (result.cancelled) return;
        if (!result.success) {
          Alert.alert('Payment issue', result.error || 'Payment could not be completed.');
          return;
        }
        await refreshStatus().catch(() => undefined);
        await loadCoachBundleCached({ force: true }).catch(() => undefined);
        await reload();
        setViewingCoach(null);
        setTab('about');
      } catch (e) {
        Alert.alert('Could not unlock coach', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setPayingTrainerId('');
      }
    },
    [refreshStatus, reload, status?.email, status?.name, status?.phone, user?.mobile, user?.name],
  );

  const confirmChangeCoach = useCallback(
    (coach: CoachOption) => {
      if (!data || coach.changeKind === 'none') return;
      if (coach.blockedUntil) {
        Alert.alert('Coach change locked', `${coach.reason} You can change again after ${formatUnlockDate(coach.blockedUntil)}.`);
        return;
      }
      if (coach.requiresUpgrade) {
        Alert.alert('Upgrade coach?', coach.reason || `Unlock ${coach.name} with Razorpay.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => startTrainerUpgrade(coach) },
        ]);
        return;
      }
      Alert.alert('Change coach?', `Switch from ${currentCoach?.name || 'your current coach'} to ${coach.name}? Your workout history stays intact.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            setChangingId(coach.trainerId);
            try {
              await changeCoach(coach.trainerId);
              await refreshStatus().catch(() => undefined);
              await loadCoachBundleCached({ force: true }).catch(() => undefined);
              await reload();
              setViewingCoach(null);
              setTab('about');
            } catch (e) {
              Alert.alert('Could not change coach', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setChangingId('');
            }
          },
        },
      ]);
    },
    [currentCoach?.name, data, refreshStatus, reload, startTrainerUpgrade],
  );

  if (loading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading your coach..." />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error || 'Could not load your coach.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  if (!currentCoach) {
    return (
      <ScreenContainer>
        <EmptyState icon="user-plus" title="No coach assigned" message="Your coach will appear here once assigned." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <CoachHeader
        title={tab === 'change' ? 'Upgrade coach' : tab === 'detail' ? 'Coach profile' : 'Your coach'}
        onBack={() => {
          if (tab === 'detail') {
            setViewingCoach(null);
            setTab('change');
          } else if (tab === 'change') {
            setTab('about');
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }}
      />
      {tab === 'about' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <CoachHero coach={currentCoach} ai={currentIsAi} />
          <CoachAbout coach={selectedCoach || currentCoach} ai={currentIsAi} onUpgrade={() => setTab('change')} onChange={() => setTab('change')} />
        </ScrollView>
      ) : null}

      {tab === 'change' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <ChangeCoachHeader />
          <View style={styles.coachList}>
            {data.coachHub.trainers.map((coach) => (
              <CoachOptionCard
                key={coach.trainerId}
                coach={coach}
                current={coach.trainerId === currentCoach.trainerId}
                changing={changingId === coach.trainerId || payingTrainerId === coach.trainerId}
                onPress={() => {
                  setViewingCoach(coach);
                  setTab('detail');
                }}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {tab === 'detail' && viewingCoach ? (
        <CoachDetailPage
          coach={viewingCoach}
          current={viewingCoach.trainerId === currentCoach.trainerId}
          loading={changingId === viewingCoach.trainerId || payingTrainerId === viewingCoach.trainerId}
          tabBarHeight={tabBarHeight}
          onContinue={() => {
            if (viewingCoach.blockedUntil) {
              Alert.alert(
                'Coach change locked',
                `${viewingCoach.reason} You can change again after ${formatUnlockDate(viewingCoach.blockedUntil)}.`,
              );
              return;
            }
            if (viewingCoach.requiresUpgrade) {
              startTrainerUpgrade(viewingCoach);
              return;
            }
            confirmChangeCoach(viewingCoach);
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}

function CoachHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <TouchableOpacity onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
        <Feather name="chevron-left" size={26} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function CoachHero({ coach, ai }: { coach: CoachOption; ai: boolean }) {
  const image = photoUrl(coach.photoUrl);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        {image ? (
          <Image source={{ uri: image }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.aiPhotoFallback}>
            <Feather name="user" size={28} color={colors.inkMuted} />
          </View>
        )}
        <View style={styles.heroText}>
          <Text style={styles.kicker}>{ai ? 'AI trainer' : 'Your coach'}</Text>
          <Text style={styles.heroName}>{coach.name}</Text>
        </View>
        <Badge label={coach.tier} tone="accent" icon="award" />
      </View>
      {ai ? (
        <View style={styles.aiPromise}>
          <Feather name="zap" size={18} color={colors.goldMuted} />
          <Text style={styles.aiPromiseText}>Plans from your logs, feedback, and next two-week schedule.</Text>
        </View>
      ) : null}
    </View>
  );
}

function CoachAbout({
  coach,
  ai,
  onUpgrade,
  onChange,
}: {
  coach: CoachOption;
  ai: boolean;
  onUpgrade: () => void;
  onChange: () => void;
}) {
  const bio = coach.detailedDescription || coach.description || 'Your coach will guide your training, review your progress, and keep the plan moving.';
  return (
    <>
      <Card style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>{ai ? 'How Ava helps' : 'Coach profile'}</Text>
        <Text style={styles.aboutBody}>{bio}</Text>
        <View style={styles.quickGrid}>
          <InfoTile icon="activity" label="Plan style" value={ai ? 'Adaptive AI' : coach.expertise || 'Personal trainer'} />
          <InfoTile icon="refresh-cw" label="Updates" value={ai ? '2-week plans' : 'Coach guided'} />
          <InfoTile icon="credit-card" label="Access" value={formatPrice(coach.monthlyFee)} />
        </View>
      </Card>

      {ai ? (
        <GoldUpgradeButton onPress={onUpgrade} />
      ) : (
        <PrimaryButton title="Change coach" icon="repeat" variant="secondary" onPress={onChange} style={styles.singleActionButton} />
      )}
    </>
  );
}

function GoldUpgradeButton({ onPress }: { onPress: () => void }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      shimmer.stopAnimation();
      pulse.stopAnimation();
      shimmer.setValue(0);
      pulse.setValue(0);
      return undefined;
    }

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(1800),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    shimmerLoop.start();
    pulseLoop.start();
    return () => {
      shimmerLoop.stop();
      pulseLoop.stop();
    };
  }, [pulse, reduceMotion, shimmer]);

  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 360] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.025] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0.7] });

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.goldButtonWrap}
      accessibilityRole="button"
      accessibilityLabel="Upgrade to a personal coach"
    >
      <Animated.View pointerEvents="none" style={[styles.goldGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <View style={styles.goldButton}>
        <Animated.View
          pointerEvents="none"
          style={[styles.goldShimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '16deg' }] }]}
        />
        <View style={styles.goldIcon}>
          <Feather name="star" size={22} color="#251800" />
        </View>
        <View style={styles.goldTextBlock}>
          <Text style={styles.goldTitle}>Upgrade your coach</Text>
          <Text style={styles.goldSubtitle}>Compare personal coaches and available access.</Text>
        </View>
        <Feather name="arrow-right" size={22} color="#251800" />
      </View>
    </TouchableOpacity>
  );
}

function ChangeCoachHeader() {
  return (
    <View style={styles.changeHeader}>
      <View style={styles.changeHeaderText}>
        <Text style={styles.changeTitle}>Choose a coach</Text>
        <Text style={styles.changeSubtitle}>Compare experience, availability, and access before continuing.</Text>
      </View>
    </View>
  );
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Feather name={icon} size={16} color={colors.accentDark} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function CoachDetailPage({
  coach,
  current,
  loading,
  tabBarHeight,
  onContinue,
}: {
  coach: CoachOption;
  current: boolean;
  loading: boolean;
  tabBarHeight: number;
  onContinue: () => void;
}) {
  const image = photoUrl(coach.photoUrl);
  const firstName = coach.name.trim().split(/\s+/)[0] || 'coach';
  const isAi = isAiCoach(coach);
  const isLocked = Boolean(coach.blockedUntil);
  const languages = coach.languages?.filter(Boolean).join(', ') || 'English';
  const availability = coach.availableSlotCount > 0 ? `${coach.availableSlotCount} slots open` : 'Shared after access';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.detailScroll, { paddingBottom: tabBarHeight + spacing.xl }]}
    >
      <View style={styles.detailHero}>
        <View style={styles.detailHeroTop}>
          {image ? (
            <Image source={{ uri: image }} style={styles.detailImage} resizeMode="cover" />
          ) : (
            <Avatar name={coach.name} size={94} tone={current ? 'accent' : 'neutral'} />
          )}
          <View style={styles.detailIdentity}>
            <Text style={styles.detailKicker}>{isAi ? 'AI trainer' : 'Personal coaching'}</Text>
            <Text style={styles.detailName}>{coach.name}</Text>
            <Text style={styles.detailRole}>{formatCoachLabel(coach)}</Text>
          </View>
        </View>
        <View style={styles.detailBadgeRow}>
          <Badge label={coach.tier || 'Coach'} tone="gold" icon="award" />
          {current ? <Badge label="Current coach" tone="neutral" icon="check" /> : null}
        </View>
        <Text style={styles.detailPrice}>{formatPrice(coach.monthlyFee)}</Text>
        <Text style={styles.detailIntro}>{coachBlurb(coach)}</Text>
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.detailSectionTitle}>How {firstName} will help</Text>
        <Card style={styles.benefitCard}>
          <CoachBenefit
            icon="clipboard"
            title="Personal plan reviews"
            body="Your training plan is reviewed against your progress, schedule, and feedback."
          />
          <CoachBenefit
            icon="message-circle"
            title="Accountability check-ins"
            body="Regular guidance keeps decisions simple and your training consistent."
          />
          <CoachBenefit
            icon="trending-up"
            title="Form and progression guidance"
            body="Get practical direction on technique, training load, and when to progress."
            last
          />
        </Card>
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.detailSectionTitle}>Coach details</Text>
        <View style={styles.detailGrid}>
          <DetailFact icon="globe" label="Languages" value={languages} />
          <DetailFact icon="calendar" label="Availability" value={availability} />
          <DetailFact icon="clock" label="Next opening" value={formatNextSlot(coach.nextSlotAt)} />
          <DetailFact icon="credit-card" label="Coach access" value={formatPrice(coach.monthlyFee)} />
        </View>
      </View>

      <Card style={styles.checkoutNote}>
        <View style={styles.checkoutNoteIcon}>
          <Feather name={current ? 'check' : 'shield'} size={18} color={current ? colors.success : colors.ink} />
        </View>
        <View style={styles.checkoutNoteText}>
          <Text style={styles.checkoutNoteTitle}>{current ? 'This is your current coach' : 'Secure coach access'}</Text>
          <Text style={styles.checkoutNoteBody}>
            {current
              ? 'Your current plan and workout history are already connected to this coach.'
              : 'Both options continue to the coach paywall. You can choose an available slot after payment is verified.'}
          </Text>
        </View>
      </Card>

      {isLocked ? <Text style={styles.detailReason}>{coach.reason} Available {formatUnlockDate(coach.blockedUntil)}.</Text> : null}

      <View style={styles.detailActions}>
        <PrimaryButton
          title="Book a slot"
          icon="calendar"
          variant="secondary"
          size="lg"
          loading={loading}
          disabled={current || isLocked}
          onPress={onContinue}
        />
        <PrimaryButton
          title={current ? 'Current coach' : `Proceed with ${firstName}`}
          icon={current ? 'check' : 'arrow-right'}
          size="lg"
          loading={loading}
          disabled={current || isLocked}
          onPress={onContinue}
        />
      </View>
    </ScrollView>
  );
}

function CoachBenefit({
  icon,
  title,
  body,
  last = false,
}: {
  icon: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.benefitRow, last && styles.benefitRowLast]}>
      <View style={styles.benefitIcon}>
        <Feather name={icon} size={18} color={colors.goldMuted} />
      </View>
      <View style={styles.benefitText}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitBody}>{body}</Text>
      </View>
    </View>
  );
}

function DetailFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailFact}>
      <Feather name={icon} size={17} color={colors.inkMuted} />
      <Text style={styles.detailFactLabel}>{label}</Text>
      <Text style={styles.detailFactValue}>{value}</Text>
    </View>
  );
}

function CoachOptionCard({
  coach,
  current,
  changing,
  onPress,
}: {
  coach: CoachOption;
  current: boolean;
  changing: boolean;
  onPress: () => void;
}) {
  const image = photoUrl(coach.photoUrl);
  const label = formatCoachLabel(coach);
  const blurb = coachBlurb(coach);
  const disabled = changing;
  const actionLabel = current ? 'View' : 'View profile';
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      disabled={disabled}
      style={[styles.optionCard, current && styles.optionCurrent, coach.requiresUpgrade && styles.optionUpgrade]}
      accessibilityRole="button"
      accessibilityLabel={`View ${coach.name}'s coach profile`}
      accessibilityState={{ disabled }}
    >
      <View style={styles.optionTop}>
        {image ? <Image source={{ uri: image }} style={styles.optionImage} /> : <Avatar name={coach.name} size={62} tone={current ? 'accent' : 'neutral'} />}
        <View style={styles.optionText}>
          <View style={styles.optionNameRow}>
            <Text style={styles.optionName}>{coach.name}</Text>
          </View>
          <Text style={styles.optionMeta}>{label}</Text>
        </View>
        <View style={[styles.optionStatus, current && styles.optionStatusCurrent, coach.requiresUpgrade && styles.optionStatusUpgrade]}>
          <Feather name={current ? 'check' : coach.requiresUpgrade ? 'star' : 'arrow-right'} size={16} color={current ? colors.ink : coach.requiresUpgrade ? '#2a1700' : colors.white} />
        </View>
      </View>
      <Text style={styles.optionDescription}>{blurb}</Text>
      <View style={styles.optionMetaRow}>
        <View style={styles.optionChip}>
          <Feather name="award" size={13} color={colors.inkMuted} />
          <Text style={styles.optionChipText}>{coach.tier || 'bronze'}</Text>
        </View>
        {coach.requiresUpgrade ? (
          <View style={styles.optionChip}>
            <Feather name="lock" size={13} color={colors.inkMuted} />
            <Text style={styles.optionChipText}>Paid upgrade</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.optionFooter}>
        <Text style={styles.optionPrice}>{formatPrice(coach.monthlyFee)}</Text>
        <View style={[styles.selectPill, current && styles.selectPillSecondary]}>
          {changing ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={[styles.selectText, current && styles.selectTextSecondary]}>{actionLabel}</Text>}
        </View>
      </View>
      {!coach.canSelect && !current ? <Text style={styles.optionReason}>{coach.blockedUntil ? `${coach.reason} Available ${formatUnlockDate(coach.blockedUntil)}.` : coach.reason}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroImage: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.panelMuted },
  aiPhotoFallback: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  heroName: { ...typography.title, color: colors.ink, marginTop: 2 },
  aiPromise: {
    minHeight: 50,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  aiPromiseText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18, fontWeight: '600' },
  screenHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerBack: {
    width: 50,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.subtitle, color: colors.ink, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 50 },
  scroll: { paddingTop: 0 },
  aboutCard: { gap: spacing.md, padding: spacing.md },
  aboutTitle: { ...typography.subtitle, color: colors.ink },
  aboutBody: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  quickGrid: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs },
  infoTile: {
    minHeight: 54,
    paddingHorizontal: 0,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: { flex: 1, minWidth: 0 },
  infoLabel: { ...typography.caption, color: colors.inkMuted },
  infoValue: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  singleActionButton: { marginTop: spacing.md },
  goldButtonWrap: {
    marginTop: spacing.md,
    minHeight: 86,
    justifyContent: 'center',
  },
  goldGlow: {
    position: 'absolute',
    top: 8,
    right: 12,
    bottom: 8,
    left: 12,
    borderRadius: radius.xl,
    backgroundColor: '#d8a92f',
  },
  goldButton: {
    minHeight: 80,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#f0c85e',
    borderWidth: 1,
    borderColor: '#ffe7a3',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goldShimmer: {
    position: 'absolute',
    top: -32,
    bottom: -32,
    width: 76,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  goldIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,248,219,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(37,24,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldTextBlock: { flex: 1 },
  goldTitle: { ...typography.bodyBold, color: '#251800', fontWeight: '900' },
  goldSubtitle: { ...typography.caption, color: 'rgba(37,24,0,0.68)', marginTop: 3, lineHeight: 17 },
  changeHeader: {
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  changeHeaderText: { gap: 6 },
  changeTitle: { ...typography.hero, color: colors.ink },
  changeSubtitle: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  coachList: { gap: spacing.md },
  detailScroll: { paddingTop: spacing.xs },
  detailHero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailHeroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailImage: { width: 86, height: 86, borderRadius: radius.lg, backgroundColor: colors.panelMuted },
  detailIdentity: { flex: 1, minWidth: 0 },
  detailKicker: { ...typography.overline, color: colors.goldMuted, textTransform: 'uppercase' },
  detailName: { ...typography.title, color: colors.inkStrong, fontSize: 23, lineHeight: 28, marginTop: 3 },
  detailRole: { ...typography.bodyBold, color: colors.inkMuted, marginTop: 2 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  detailPrice: { ...typography.title, color: colors.ink },
  detailIntro: { ...typography.body, color: colors.inkMuted, lineHeight: 23 },
  detailSection: { marginTop: spacing.xl },
  detailSectionTitle: {
    ...typography.overline,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  benefitCard: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  benefitRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  benefitRowLast: { borderBottomWidth: 0 },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1 },
  benefitTitle: { ...typography.bodyBold, color: colors.ink },
  benefitBody: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailFact: {
    width: '48%',
    minHeight: 112,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  detailFactLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },
  detailFactValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  checkoutNote: {
    marginTop: spacing.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.panelMuted,
  },
  checkoutNoteIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutNoteText: { flex: 1 },
  checkoutNoteTitle: { ...typography.bodyBold, color: colors.ink },
  checkoutNoteBody: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  detailReason: { ...typography.caption, color: colors.error, marginTop: spacing.md },
  detailActions: { gap: spacing.sm, marginTop: spacing.lg },
  optionCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
  },
  optionCurrent: { borderColor: colors.goldMuted, backgroundColor: colors.panelMuted },
  optionUpgrade: { borderColor: '#dcc47a' },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  optionImage: { width: 62, height: 62, borderRadius: 22, backgroundColor: colors.panelMuted },
  optionText: { flex: 1, minWidth: 0 },
  optionNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionName: { ...typography.subtitle, color: colors.ink, flex: 1, fontSize: 19, lineHeight: 24 },
  optionMeta: { ...typography.bodyBold, color: colors.inkMuted, marginTop: 2 },
  optionStatus: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionStatusCurrent: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  optionStatusUpgrade: { backgroundColor: '#f4c84d' },
  optionDescription: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  optionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  optionChip: {
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  optionChipText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', textTransform: 'capitalize' },
  optionFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  optionPrice: { ...typography.subtitle, color: colors.ink, flexShrink: 1 },
  selectPill: { minWidth: 104, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.primaryAction, paddingHorizontal: spacing.md, paddingVertical: 11 },
  selectPillSecondary: { backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  selectText: { ...typography.caption, color: colors.onPrimary, fontWeight: '800' },
  selectTextSecondary: { color: colors.inkMuted },
  optionReason: { ...typography.caption, color: colors.error, marginTop: spacing.sm },
});
