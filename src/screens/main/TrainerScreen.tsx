import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
import type { CoachScreenParams } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type CoachTab = 'about' | 'change' | 'detail';
type CoachFilter = 'all' | 'ai' | 'personal';
type CoachRoute = RouteProp<{ Coach: CoachScreenParams | undefined }, 'Coach'>;

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

function coachAccessPrice(coach: CoachOption) {
  const upgradePaise = Math.round(Number(coach.upgradeAmountPaise || 0));
  if (coach.requiresUpgrade && Number.isFinite(upgradePaise) && upgradePaise >= 100) {
    return `₹${Math.round(upgradePaise / 100).toLocaleString('en-IN')} to unlock`;
  }
  if (coach.requiresUpgrade) return 'Upgrade required';
  if (coach.canSelect) return 'Included';
  return formatPrice(coach.monthlyFee);
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
  const route = useRoute<CoachRoute>();
  const tabBarHeight = useBottomTabBarHeight();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const [tab, setTab] = useState<CoachTab>(
    route.params?.initialView === 'browse'
      ? 'change'
      : route.params?.initialView === 'detail'
        ? 'detail'
        : 'about',
  );
  const [filter, setFilter] = useState<CoachFilter>('all');
  const [viewingCoach, setViewingCoach] = useState<CoachOption | null>(null);
  const [changingId, setChangingId] = useState('');
  const [payingTrainerId, setPayingTrainerId] = useState('');
  const { user, status, refreshStatus } = useAuthStore();

  const { data, loading, error, reload, refresh, refreshing } = useAsync((mode) =>
    loadCoachBundleCached({ force: mode === 'refresh' }),
  [], { initialData: peekCoachBundleCached() });

  const appliedRouteRef = useRef('');
  const currentCoach = data?.coachHub.currentTrainer ?? null;
  const selectedCoach = useMemo(
    () => currentCoach
      ? data?.coachHub.trainers.find((coach) => coach.trainerId === currentCoach.trainerId) ?? currentCoach
      : null,
    [currentCoach, data?.coachHub.trainers],
  );
  const currentIsAi = currentCoach ? isAiCoach(currentCoach) : false;
  const availableCoaches = useMemo(() => {
    const coaches = [
      ...(data?.coachHub.currentTrainer ? [data.coachHub.currentTrainer] : []),
      ...(data?.coachHub.trainers || []),
    ];
    const seen = new Set<string>();
    return coaches.filter(coach => {
      if (!coach.trainerId || seen.has(coach.trainerId)) return false;
      seen.add(coach.trainerId);
      return true;
    });
  }, [data?.coachHub.currentTrainer, data?.coachHub.trainers]);
  const hasAiCoaches = availableCoaches.some(isAiCoach);
  const hasPersonalCoaches = availableCoaches.some(coach => !isAiCoach(coach));
  const showFilters = hasAiCoaches && hasPersonalCoaches;
  const activeFilter: CoachFilter = (filter === 'ai' && !hasAiCoaches) || (filter === 'personal' && !hasPersonalCoaches)
    ? 'all'
    : filter;

  useEffect(() => {
    if ((filter === 'ai' && !hasAiCoaches) || (filter === 'personal' && !hasPersonalCoaches)) {
      setFilter('all');
    }
  }, [filter, hasAiCoaches, hasPersonalCoaches]);

  const visibleCoaches = useMemo(() => {
    const filtered = availableCoaches.filter(coach => (
      activeFilter === 'all' || (activeFilter === 'ai' ? isAiCoach(coach) : !isAiCoach(coach))
    ));
    return [...filtered].sort((a, b) => (
      Number(b.trainerId === currentCoach?.trainerId) - Number(a.trainerId === currentCoach?.trainerId)
    ));
  }, [activeFilter, availableCoaches, currentCoach?.trainerId]);
  const stackCoachCards = viewportWidth < 390 || fontScale >= 1.2;

  useEffect(() => {
    if (!data) return;
    const routeKey = `${route.key}:${route.params?.initialView || 'about'}:${route.params?.trainerId || ''}`;
    if (appliedRouteRef.current === routeKey) return;
    const requestedCoach = route.params?.trainerId
      ? availableCoaches.find(coach => coach.trainerId === route.params?.trainerId) || null
      : null;
    if (route.params?.initialView === 'detail') {
      setViewingCoach(requestedCoach);
      setTab(requestedCoach ? 'detail' : 'change');
    } else if (route.params?.initialView === 'browse' || !data.coachHub.currentTrainer) {
      setViewingCoach(null);
      setTab('change');
    } else {
      setViewingCoach(null);
      setTab('about');
    }
    appliedRouteRef.current = routeKey;
  }, [availableCoaches, data, route.key, route.params?.initialView, route.params?.trainerId]);

  const activeTab: CoachTab = !currentCoach && tab === 'about' ? 'change' : tab;

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
        <CoachHeader title="Coaching" onBack={() => navigation.canGoBack() && navigation.goBack()} />
        <LoadingState message="Loading your coach..." />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <CoachHeader title="Coaching" onBack={() => navigation.canGoBack() && navigation.goBack()} />
        <ErrorState message={error || 'Could not load your coach.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  if (!currentCoach && !availableCoaches.length) {
    return (
      <ScreenContainer>
        <CoachHeader title="Coaching" onBack={() => navigation.canGoBack() && navigation.goBack()} />
        <EmptyState icon="user-plus" title="No coach assigned" message="Your coach will appear here once assigned." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <CoachHeader
        title={activeTab === 'change' ? 'Coaches' : activeTab === 'detail' ? 'Coach profile' : 'Your coach'}
        onBack={() => {
          if (activeTab === 'detail') {
            setViewingCoach(null);
            setTab('change');
          } else if (activeTab === 'change' && currentCoach) {
            setTab('about');
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }}
      />
      {activeTab === 'about' && currentCoach ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <CoachHero coach={currentCoach} ai={currentIsAi} />
          <CoachAbout coach={selectedCoach || currentCoach} ai={currentIsAi} onUpgrade={() => setTab('change')} onChange={() => setTab('change')} />
        </ScrollView>
      ) : null}

      {activeTab === 'change' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          <ChangeCoachHeader
            accessLabel={data.coachHub.access?.trainerAccessLabel || ''}
            accessRemainingWeeks={data.coachHub.access?.trainerAccessRemainingWeeks || 0}
            filter={activeFilter}
            showFilters={showFilters}
            onFilter={setFilter}
          />
          <View style={[styles.coachList, stackCoachCards && styles.coachListStack]}>
            {visibleCoaches.map((coach) => (
              <CoachOptionCard
                key={coach.trainerId}
                coach={coach}
                current={coach.trainerId === currentCoach?.trainerId}
                changing={changingId === coach.trainerId || payingTrainerId === coach.trainerId}
                fullWidth={stackCoachCards}
                onPress={() => {
                  setViewingCoach(coach);
                  setTab('detail');
                }}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {activeTab === 'detail' && viewingCoach ? (
        <CoachDetailPage
          coach={viewingCoach}
          current={viewingCoach.trainerId === currentCoach?.trainerId}
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
            if (!viewingCoach.canSelect && !viewingCoach.requiresUpgrade) {
              Alert.alert('Coach unavailable', viewingCoach.reason || 'This coach is not available with your current access.');
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
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [image]);

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        {image && !imageFailed ? (
          <Image source={{ uri: image }} style={styles.heroImage} resizeMode="cover" onError={() => setImageFailed(true)} accessible={false} />
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
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.goldButtonWrap}
      accessibilityRole="button"
      accessibilityLabel="Upgrade to a personal coach"
    >
      <View style={styles.goldButton}>
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

function ChangeCoachHeader({
  accessLabel,
  accessRemainingWeeks,
  filter,
  showFilters,
  onFilter,
}: {
  accessLabel: string;
  accessRemainingWeeks: number;
  filter: CoachFilter;
  showFilters: boolean;
  onFilter: (filter: CoachFilter) => void;
}) {
  const accessCopy = accessRemainingWeeks > 0
    ? `${accessRemainingWeeks} week${accessRemainingWeeks === 1 ? '' : 's'} of coach access remaining`
    : String(accessLabel || '').trim();
  return (
    <View style={styles.changeHeader}>
      <View style={styles.changeHeaderText}>
        <Text style={styles.changeTitle}>Choose a coach</Text>
        <Text style={styles.changeSubtitle}>Compare coaching style and access.</Text>
      </View>
      {accessCopy ? (
        <View style={styles.accessStrip}>
          <View style={styles.accessStripIcon}><Feather name="check" size={14} color={colors.onPrimary} /></View>
          <Text style={styles.accessStripText}>
            {accessCopy}
          </Text>
        </View>
      ) : null}
      {showFilters ? (
        <View style={styles.filterRow} accessibilityRole="radiogroup">
          {([
            ['all', 'All'],
            ['ai', 'AI'],
            ['personal', 'Personal'],
          ] as Array<[CoachFilter, string]>).map(([value, label]) => {
            const selected = filter === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => onFilter(value)}
                style={[styles.filterButton, selected && styles.filterButtonSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
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
  const [imageFailed, setImageFailed] = useState(false);
  const firstName = coach.name.trim().split(/\s+/)[0] || 'coach';
  const isAi = isAiCoach(coach);
  const isLocked = Boolean(coach.blockedUntil);
  const isUnavailable = !current && !coach.canSelect && !coach.requiresUpgrade && !isLocked;
  const languages = coach.languages?.filter(Boolean).join(', ') || '';
  const availability = coach.availableSlotCount > 0 ? `${coach.availableSlotCount} slots open` : '';
  const nextOpening = coach.nextSlotAt && Number.isFinite(new Date(coach.nextSlotAt).getTime())
    ? formatNextSlot(coach.nextSlotAt)
    : '';
  const detailFacts = [
    { icon: 'globe', label: 'Languages', value: languages },
    { icon: 'calendar', label: 'Availability', value: availability },
    { icon: 'clock', label: 'Next opening', value: nextOpening },
    {
      icon: 'credit-card',
      label: 'Coach access',
      value: current
        ? 'Current access'
        : isLocked
          ? `Available ${formatUnlockDate(coach.blockedUntil)}`
          : isUnavailable
            ? 'Not available'
            : coachAccessPrice(coach),
    },
  ].filter(item => item.value);
  const actionTitle = current
    ? 'Current coach'
    : isLocked
      ? `Available ${formatUnlockDate(coach.blockedUntil)}`
      : isUnavailable
        ? 'Not available'
      : coach.requiresUpgrade
        ? `Unlock ${firstName}`
        : `Choose ${firstName}`;

  useEffect(() => setImageFailed(false), [image]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.detailScroll, { paddingBottom: tabBarHeight + spacing.xl }]}
    >
      <View style={styles.detailHero}>
        <View style={styles.detailHeroTop}>
          {image && !imageFailed ? (
            <Image source={{ uri: image }} style={styles.detailImage} resizeMode="cover" onError={() => setImageFailed(true)} accessible={false} />
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
        {!current ? <Text style={styles.detailPrice}>{coachAccessPrice(coach)}</Text> : null}
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

      {detailFacts.length ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Coach details</Text>
          <View style={styles.detailGrid}>
            {detailFacts.map(fact => <DetailFact key={fact.label} {...fact} />)}
          </View>
        </View>
      ) : null}

      <Card style={styles.checkoutNote}>
        <View style={styles.checkoutNoteIcon}>
          <Feather name={current ? 'check' : 'shield'} size={18} color={current ? colors.success : colors.ink} />
        </View>
        <View style={styles.checkoutNoteText}>
          <Text style={styles.checkoutNoteTitle}>
            {current
              ? 'This is your current coach'
              : isUnavailable
                ? 'Currently unavailable'
                : coach.requiresUpgrade
                  ? 'Secure coach access'
                  : 'Your progress stays connected'}
          </Text>
          <Text style={styles.checkoutNoteBody}>
            {current
              ? 'Your current plan and workout history are already connected to this coach.'
              : isUnavailable
                ? coach.reason || 'This coach is not available with your current access.'
              : coach.requiresUpgrade
                ? 'Complete the coach upgrade securely. Your existing workout history stays connected after access is confirmed.'
                : 'Changing coaches keeps your workout history and current progress intact.'}
          </Text>
        </View>
      </Card>

      {isLocked ? <Text style={styles.detailReason}>{coach.reason} Available {formatUnlockDate(coach.blockedUntil)}.</Text> : null}

      <View style={styles.detailActions}>
        <PrimaryButton
          title={actionTitle}
          icon={current ? 'check' : isLocked ? 'lock' : coach.requiresUpgrade ? 'unlock' : 'arrow-right'}
          size="lg"
          loading={loading}
          disabled={current || isLocked || isUnavailable}
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
  fullWidth,
  onPress,
}: {
  coach: CoachOption;
  current: boolean;
  changing: boolean;
  fullWidth: boolean;
  onPress: () => void;
}) {
  const image = photoUrl(coach.photoUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const label = formatCoachLabel(coach);
  const disabled = changing;
  const locked = Boolean(coach.blockedUntil);
  const status = current ? 'Current' : coach.requiresUpgrade ? 'Upgrade' : coach.canSelect ? 'Included' : 'View';

  useEffect(() => setImageFailed(false), [image]);

  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.optionCard,
        fullWidth && styles.optionCardFull,
        current && styles.optionCurrent,
        coach.requiresUpgrade && styles.optionUpgrade,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${coach.name}, ${label}, ${status}, ${coachAccessPrice(coach)}`}
      accessibilityHint="Opens coach profile"
      accessibilityState={{ disabled, selected: current }}
    >
      <View style={styles.optionVisual}>
        {image && !imageFailed ? (
          <Image source={{ uri: image }} style={styles.optionImage} resizeMode="cover" onError={() => setImageFailed(true)} accessible={false} />
        ) : (
          <View style={styles.optionFallback}>
            <View style={styles.optionFallbackDisc} />
            <Text style={styles.optionFallbackInitial}>{coach.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={[
          styles.optionStatus,
          current && styles.optionStatusCurrent,
          coach.requiresUpgrade && styles.optionStatusUpgrade,
        ]}>
          <Feather name={current ? 'check' : coach.requiresUpgrade ? 'lock' : 'arrow-right'} size={12} color={current || coach.requiresUpgrade ? colors.onPrimary : colors.ink} />
          <Text style={[styles.optionStatusText, (current || coach.requiresUpgrade) && styles.optionStatusTextDark]}>{status}</Text>
        </View>
        <View style={styles.optionCaption}>
          <Text style={styles.optionName} numberOfLines={1}>{coach.name}</Text>
          <Text style={styles.optionMeta} numberOfLines={1}>{label}</Text>
        </View>
      </View>
      <View style={styles.optionFooter}>
        <Text style={styles.optionPrice} numberOfLines={1}>
          {current ? 'View profile' : !coach.canSelect && !coach.requiresUpgrade ? 'View availability' : coachAccessPrice(coach)}
        </Text>
        {changing ? <ActivityIndicator size="small" color={colors.ink} /> : <Feather name="arrow-up-right" size={17} color={colors.ink} />}
      </View>
      {locked ? <View style={styles.optionLockedDot} /> : null}
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
    minHeight: 80,
  },
  goldButton: {
    minHeight: 80,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    marginBottom: spacing.lg,
    paddingHorizontal: 2,
  },
  changeHeaderText: { gap: 6 },
  changeTitle: { ...typography.hero, color: colors.ink },
  changeSubtitle: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  accessStrip: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  accessStripIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  accessStripText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18, fontWeight: '700' },
  filterRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  filterButtonSelected: { backgroundColor: colors.primaryAction },
  filterText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  filterTextSelected: { color: colors.onPrimary },
  coachList: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  coachListStack: { flexDirection: 'column' },
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
    width: '48.5%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionCardFull: { width: '100%' },
  optionCurrent: { borderColor: colors.goldMuted },
  optionUpgrade: { borderColor: colors.borderStrong },
  optionVisual: { width: '100%', aspectRatio: 4 / 5, overflow: 'hidden', backgroundColor: colors.panelMuted },
  optionImage: { width: '100%', height: '100%', backgroundColor: colors.panelMuted },
  optionFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  optionFallbackDisc: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: colors.panelWarm,
  },
  optionFallbackInitial: { fontSize: 58, lineHeight: 66, fontWeight: '900', color: colors.goldMuted },
  optionCaption: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(5,6,10,0.84)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  optionName: { ...typography.bodyBold, color: colors.inkStrong, fontSize: 17, lineHeight: 22 },
  optionMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: 1 },
  optionStatus: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5,6,10,0.84)',
    paddingHorizontal: spacing.sm,
  },
  optionStatusCurrent: { backgroundColor: colors.gold },
  optionStatusUpgrade: { backgroundColor: colors.gold },
  optionStatusText: { fontSize: 10, lineHeight: 13, color: colors.ink, fontWeight: '900' },
  optionStatusTextDark: { color: colors.onPrimary },
  optionFooter: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  optionPrice: { ...typography.caption, color: colors.ink, flex: 1, fontWeight: '800' },
  optionLockedDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkSubtle },
});
