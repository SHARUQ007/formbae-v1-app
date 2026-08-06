import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, Card } from '../../components/Card';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { changeCoach } from '../../services/trainerService';
import { loadCoachBundleCached } from '../../services/preloadService';
import { useAuthStore } from '../../store/authStore';
import { getSiteUrl } from '../../constants/config';
import type { CoachOption } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type CoachTab = 'about' | 'change';

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

function formatUnlockDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isAiCoach(coach: CoachOption) {
  const text = `${coach.name} ${coach.gender} ${coach.expertise} ${coach.description} ${coach.detailedDescription}`.toLowerCase();
  return text.includes('ai') || text.includes('ava');
}

export function TrainerScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const [tab, setTab] = useState<CoachTab>('about');
  const [changingId, setChangingId] = useState('');
  const { refreshStatus } = useAuthStore();

  const { data, loading, error, reload, refresh, refreshing } = useAsync((mode) =>
    loadCoachBundleCached({ force: mode === 'refresh' }),
  );

  const currentCoach = data?.coachHub.currentTrainer ?? data?.coachHub.trainers[0] ?? null;
  const selectedCoach = useMemo(
    () => data?.coachHub.trainers.find((coach) => coach.trainerId === currentCoach?.trainerId) ?? currentCoach,
    [currentCoach, data?.coachHub.trainers],
  );
  const currentIsAi = currentCoach ? isAiCoach(currentCoach) : false;

  const confirmChangeCoach = useCallback(
    (coach: CoachOption) => {
      if (!data || coach.changeKind === 'none') return;
      if (coach.blockedUntil) {
        Alert.alert('Coach change locked', `${coach.reason} You can change again after ${formatUnlockDate(coach.blockedUntil)}.`);
        return;
      }
      if (coach.requiresUpgrade) {
        Alert.alert('Upgrade required', coach.reason);
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
    [currentCoach?.name, data, refreshStatus, reload],
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
          <ChangeCoachHeader onBack={() => setTab('about')} />
          <View style={styles.coachList}>
            {data.coachHub.trainers.map((coach) => (
              <CoachOptionCard
                key={coach.trainerId}
                coach={coach}
                current={coach.trainerId === currentCoach.trainerId}
                changing={changingId === coach.trainerId}
                onPress={() => confirmChangeCoach(coach)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}

function CoachHero({ coach, ai }: { coach: CoachOption; ai: boolean }) {
  const image = photoUrl(coach.photoUrl);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        {image ? <Image source={{ uri: image }} style={styles.heroImage} /> : <Avatar name={coach.name} size={82} />}
        <View style={styles.heroText}>
          <Text style={styles.kicker}>{ai ? 'AI trainer' : 'Your coach'}</Text>
          <Text style={styles.heroName} numberOfLines={1}>{coach.name}</Text>
          <Text style={styles.heroMeta} numberOfLines={2}>{ai ? 'Instant workout planning and adaptive weekly check-ins' : coach.expertise || 'Personal trainer'}</Text>
        </View>
        <Badge label={coach.tier} tone="accent" icon="award" />
      </View>
      {ai ? (
        <View style={styles.aiPromise}>
          <Feather name="zap" size={18} color={colors.white} />
          <Text style={styles.aiPromiseText}>Ava builds plans from your logs, feedback, and next two-week schedule.</Text>
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
          <InfoTile icon="refresh-cw" label="Updates" value={ai ? 'Every 2 weeks' : 'Coach guided'} />
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

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    shimmerLoop.start();
    pulseLoop.start();
    return () => {
      shimmerLoop.stop();
      pulseLoop.stop();
    };
  }, [pulse, shimmer]);

  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-130, 330] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.88] });

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.goldButtonWrap} accessibilityRole="button" accessibilityLabel="Upgrade trainer">
      <Animated.View style={[styles.goldGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <View style={styles.goldButton}>
        <Animated.View style={[styles.goldShimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '16deg' }] }]} />
        <View style={styles.goldIcon}>
          <Feather name="star" size={24} color="#2a1700" />
        </View>
        <View style={styles.goldTextBlock}>
          <Text style={styles.goldTitle}>Upgrade to a real coach</Text>
          <Text style={styles.goldSubtitle}>Unlock human trainer guidance when you are ready.</Text>
        </View>
        <Feather name="arrow-right" size={24} color="#2a1700" />
      </View>
    </TouchableOpacity>
  );
}

function ChangeCoachHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.changeHeader}>
      <TouchableOpacity onPress={onBack} style={styles.changeBackButton} accessibilityRole="button" accessibilityLabel="Back to coach profile">
        <Feather name="chevron-left" size={22} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.changeHeaderText}>
        <Text style={styles.changeTitle}>Pick your trainer</Text>
        <Text style={styles.changeSubtitle}>Choose from trainers currently shown to users.</Text>
      </View>
    </View>
  );
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Feather name={icon} size={16} color={colors.accentDark} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
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
  const disabled = current || changing;
  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} disabled={disabled} style={[styles.optionCard, current && styles.optionCurrent]}>
      <View style={styles.optionTop}>
        {image ? <Image source={{ uri: image }} style={styles.optionImage} /> : <Avatar name={coach.name} size={54} tone={current ? 'accent' : 'neutral'} />}
        <View style={styles.optionText}>
          <View style={styles.optionNameRow}>
            <Text style={styles.optionName} numberOfLines={1}>{coach.name}</Text>
            {current ? <Badge label="Current" tone="success" icon="check" /> : null}
          </View>
          <Text style={styles.optionMeta} numberOfLines={1}>{coach.expertise}</Text>
        </View>
      </View>
      <Text style={styles.optionDescription} numberOfLines={2}>{coach.description || coach.detailedDescription || 'Coach profile details will appear here.'}</Text>
      <View style={styles.optionFooter}>
        <Text style={styles.optionPrice}>{formatPrice(coach.monthlyFee)}</Text>
        <View style={[styles.selectPill, (!coach.canSelect || current) && styles.selectPillDisabled]}>
          {changing ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={[styles.selectText, (!coach.canSelect || current) && styles.selectTextDisabled]}>{current ? 'Selected' : coach.requiresUpgrade ? 'Upgrade' : 'Choose'}</Text>}
        </View>
      </View>
      {!coach.canSelect && !current ? <Text style={styles.optionReason}>{coach.blockedUntil ? `${coach.reason} Available ${formatUnlockDate(coach.blockedUntil)}.` : coach.reason}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.inkStrong,
    borderRadius: 34,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroImage: { width: 82, height: 82, borderRadius: 28, backgroundColor: colors.panelMuted },
  heroText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  heroName: { ...typography.title, color: colors.white, marginTop: 2 },
  heroMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: 4, lineHeight: 18 },
  aiPromise: {
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  aiPromiseText: { ...typography.caption, color: colors.white, flex: 1, lineHeight: 18, fontWeight: '800' },
  scroll: { paddingTop: spacing.sm },
  aboutCard: { gap: spacing.lg, padding: spacing.lg },
  aboutTitle: { ...typography.title, color: colors.ink },
  aboutBody: { ...typography.body, color: colors.inkMuted, lineHeight: 24 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoTile: {
    flex: 1,
    minWidth: '30%',
    minHeight: 112,
    borderRadius: 22,
    backgroundColor: colors.panelMuted,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  infoLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 8 },
  infoValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  singleActionButton: { marginTop: spacing.md },
  goldButtonWrap: {
    marginTop: spacing.lg,
    minHeight: 104,
    justifyContent: 'center',
  },
  goldGlow: {
    position: 'absolute',
    top: 6,
    right: 10,
    bottom: 6,
    left: 10,
    borderRadius: 34,
    backgroundColor: '#f3bd3f',
  },
  goldButton: {
    minHeight: 96,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#f2c24d',
    borderWidth: 1,
    borderColor: '#ffe49a',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goldShimmer: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 82,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  goldIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: '#fff3bf',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(42,23,0,0.12)',
  },
  goldTextBlock: { flex: 1 },
  goldTitle: { ...typography.subtitle, color: '#2a1700', fontWeight: '900' },
  goldSubtitle: { ...typography.caption, color: 'rgba(42,23,0,0.68)', marginTop: 3, lineHeight: 17 },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  changeBackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeHeaderText: { flex: 1 },
  changeTitle: { ...typography.title, color: colors.ink },
  changeSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  coachList: { gap: spacing.sm },
  optionCard: {
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionCurrent: { borderColor: colors.accentSurface, backgroundColor: colors.accentLight },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionImage: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.panelMuted },
  optionText: { flex: 1 },
  optionNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionName: { ...typography.subtitle, color: colors.ink, flex: 1 },
  optionMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  optionDescription: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  optionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  optionPrice: { ...typography.bodyBold, color: colors.ink },
  selectPill: { minWidth: 86, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: 9 },
  selectPillDisabled: { backgroundColor: colors.panelMuted },
  selectText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  selectTextDisabled: { color: colors.inkMuted },
  optionReason: { ...typography.caption, color: colors.error, marginTop: spacing.sm },
});
