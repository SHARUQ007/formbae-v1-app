import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { loadProfileSettingsCached, peekProfileSettingsCached } from '../../services/preloadService';
import { useAuthStore } from '../../store/authStore';
import type { RootStackParamList } from '../../navigation/types';
import type { PaymentPlan } from '../../types/api';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { resolveBodyGender } from '../../utils/weeklyMuscles';

type Props = NativeStackScreenProps<RootStackParamList, 'Renewal'>;

const MEMBERSHIP_BENEFITS = [
  {
    icon: 'activity',
    imageMale: require('../../assets/membership/training-male.jpg'),
    imageFemale: require('../../assets/membership/training-female.jpg'),
    eyebrow: 'TRAINING',
    title: 'Build lasting strength',
    description: 'Personalized workouts that progress with you.',
    points: ['Your weekly workout plan', 'Exercise videos and form guidance', 'Workouts that progress with you'],
  },
  {
    icon: 'coffee',
    imageMale: require('../../assets/membership/nutrition-male.jpg'),
    imageFemale: require('../../assets/membership/nutrition-female.jpg'),
    eyebrow: 'NUTRITION',
    title: 'Make food feel simpler',
    description: 'Simple meal logging that helps you learn what works.',
    points: ['Simple meal logging', 'Food-memory support', 'Nutrition progress over time'],
  },
  {
    icon: 'trending-up',
    imageMale: require('../../assets/membership/progress-male.jpg'),
    imageFemale: require('../../assets/membership/progress-female.jpg'),
    eyebrow: 'PROGRESS & SUPPORT',
    title: 'See progress clearly',
    description: 'Your workouts, check-ins and coaching stay connected.',
    points: ['Coach guidance and accountability', 'Measurements and progress reports', 'Stay accountable with friends'],
  },
] as const;

const LOOPED_MEMBERSHIP_BENEFITS = [
  MEMBERSHIP_BENEFITS[MEMBERSHIP_BENEFITS.length - 1],
  ...MEMBERSHIP_BENEFITS,
  MEMBERSHIP_BENEFITS[0],
] as const;

export function SubscriptionRenewalScreen({ navigation }: Props) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const benefitWidth = Math.max(280, viewportWidth - (spacing.lg * 2));
  const compactViewport = viewportHeight < 760;
  const carouselRef = useRef<ScrollView>(null);
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [paywallId, setPaywallId] = useState('renewal-autopay-49');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [benefitIndex, setBenefitIndex] = useState(0);
  const [profileGender, setProfileGender] = useState(() => resolveBodyGender(peekProfileSettingsCached()?.profile?.gender));
  const subscription = status?.subscription;
  const inGrace = subscription?.state === 'grace';

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentStatus();
      const returnedPlans = data.plans || [];
      const availablePlans = inGrace
        ? returnedPlans.filter((plan) => plan.billing === 'recurring')
        : returnedPlans;
      if (inGrace && returnedPlans.length > 0 && availablePlans.length === 0) {
        throw new Error('Monthly renewal is temporarily unavailable. Please try again shortly.');
      }
      setPlans(availablePlans);
      setSelectedId((current) => availablePlans.some((plan) => plan.planId === current) ? current : availablePlans[0]?.planId || '');
      setPaywallId(data.paywallId || availablePlans[0]?.paywallId || 'renewal-autopay-49');
    } catch (error) {
      Alert.alert('Could not load renewal options', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [inGrace]);

  useEffect(() => {
    loadPlans().catch(() => undefined);
  }, [loadPlans]);

  useEffect(() => {
    carouselRef.current?.scrollTo({ x: benefitWidth, animated: false });
  }, [benefitWidth]);

  useEffect(() => {
    loadProfileSettingsCached()
      .then((settings) => setProfileGender(resolveBodyGender(settings.profile?.gender)))
      .catch(() => undefined);
  }, []);

  const renew = async () => {
    const plan = plans.find((item) => item.planId === selectedId) || plans[0];
    if (!plan || paying) return;
    setPaying(true);
    try {
      const result = await runNativeCheckout({
        plan,
        user: {
          name: status?.name || user?.name || 'FormBae Trainee',
          mobile: status?.phone || user?.mobile || '',
          email: status?.email,
        },
        paywallId: plan.paywallId || paywallId,
        requireRecurring: inGrace,
      });
      if (result.cancelled) return;
      if (!result.success) {
        Alert.alert('Renewal issue', result.error || 'Your renewal could not be completed. Please try again.');
        return;
      }
      await refreshStatus();
      navigation.replace('Main');
    } catch (error) {
      Alert.alert('Could not finish renewal', error instanceof Error ? error.message : 'Your payment may still be processing. Check its status in a moment.');
    } finally {
      setPaying(false);
    }
  };

  const checkAccess = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const next = await refreshStatus();
      if (next.subscription?.state === 'active' || next.subscription?.state === 'grace') {
        navigation.replace('Main');
        return;
      }
      Alert.alert('Renewal not found yet', 'If you just paid, wait a moment and try again.');
    } catch (error) {
      Alert.alert('Could not check access', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigation.replace('Auth');
  };

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>FORMBAE MEMBERSHIP</Text>
          <Text style={styles.headerTitle}>Your transformation continues</Text>
        </View>
        {inGrace ? (
          <TouchableOpacity
            onPress={() => navigation.replace('Main')}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Return to app"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Feather name="x" size={22} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.carouselArea}>
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={benefitWidth}
          onMomentumScrollEnd={(event) => {
            const loopIndex = Math.round(event.nativeEvent.contentOffset.x / benefitWidth);
            if (loopIndex === 0) {
              const lastIndex = MEMBERSHIP_BENEFITS.length - 1;
              setBenefitIndex(lastIndex);
              carouselRef.current?.scrollTo({ x: benefitWidth * MEMBERSHIP_BENEFITS.length, animated: false });
              return;
            }
            if (loopIndex === MEMBERSHIP_BENEFITS.length + 1) {
              setBenefitIndex(0);
              carouselRef.current?.scrollTo({ x: benefitWidth, animated: false });
              return;
            }
            setBenefitIndex(loopIndex - 1);
          }}
          accessibilityLabel="Membership benefits"
        >
          {LOOPED_MEMBERSHIP_BENEFITS.map((benefit, loopIndex) => (
            <View key={`${benefit.eyebrow}-${loopIndex}`} style={[styles.benefitSlide, { width: benefitWidth }]}>
              <ImageBackground
                source={profileGender === 'female' ? benefit.imageFemale : benefit.imageMale}
                resizeMode="cover"
                imageStyle={styles.benefitImage}
                style={styles.benefitCard}
              >
                <View style={styles.benefitImageShade} />
                <View style={[styles.benefitContent, compactViewport && styles.benefitContentCompact]}>
                  <View style={[styles.benefitStory, compactViewport && styles.benefitStoryCompact]}>
                    <View style={styles.benefitLabelRow}>
                      <View style={[styles.benefitIcon, compactViewport && styles.benefitIconCompact]}>
                        <Feather name={benefit.icon} size={18} color={colors.gold} />
                      </View>
                      <Text style={styles.benefitEyebrow}>{benefit.eyebrow}</Text>
                    </View>
                    <Text
                      style={[styles.benefitTitle, compactViewport && styles.benefitTitleCompact]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {benefit.title}
                    </Text>
                    <Text style={[styles.benefitDescription, compactViewport && styles.benefitDescriptionCompact]} numberOfLines={3}>{benefit.description}</Text>
                  </View>
                  <View style={[styles.benefitPoints, compactViewport && styles.benefitPointsCompact]}>
                    {benefit.points.map((point, pointIndex) => (
                      <View key={point} style={[styles.benefitPoint, pointIndex > 0 && styles.benefitPointDivider]}>
                        <View style={styles.benefitCheck}>
                          <Feather name="check" size={12} color={colors.gold} />
                        </View>
                        <Text style={[styles.benefitPointText, compactViewport && styles.benefitPointTextCompact]}>{point}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ImageBackground>
            </View>
          ))}
        </ScrollView>

        <View style={styles.carouselDots} accessibilityRole="tablist">
          {MEMBERSHIP_BENEFITS.map((benefit, index) => (
            <TouchableOpacity
              key={benefit.eyebrow}
              onPress={() => {
                setBenefitIndex(index);
                carouselRef.current?.scrollTo({ x: benefitWidth * (index + 1), animated: true });
              }}
              style={[styles.carouselDot, index === benefitIndex && styles.carouselDotActive]}
              accessibilityRole="tab"
              accessibilityLabel={`Show ${benefit.title}`}
              accessibilityState={{ selected: index === benefitIndex }}
            />
          ))}
        </View>
      </View>

      <View style={styles.checkoutDock}>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.gold} /><Text style={styles.loadingText}>Loading membership…</Text></View>
        ) : (
          <View style={styles.planList}>
            {plans.map((plan) => {
              const selected = plan.planId === selectedId;
              return (
                <TouchableOpacity key={plan.planId} activeOpacity={0.88} onPress={() => setSelectedId(plan.planId)} style={[styles.planCard, selected && styles.planCardSelected]} accessibilityRole="radio" accessibilityState={{ selected }}>
                  {plans.length > 1 ? <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Feather name="check" size={13} color={colors.onPrimary} /> : null}</View> : null}
                  <View style={styles.planCopy}>
                    <Text style={styles.planName}>{plan.label || plan.planName}</Text>
                    <Text style={styles.planBilling}>{plan.billing === 'recurring' ? 'Renews monthly · cancel anytime' : 'One-time payment'}</Text>
                  </View>
                  <View style={styles.priceCopy}>
                    <Text style={styles.planPrice}>₹{(plan.amount / 100).toLocaleString('en-IN')}</Text>
                    {plan.billing === 'recurring' ? <Text style={styles.pricePeriod}>per month</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {!plans.length ? <TouchableOpacity onPress={loadPlans} style={styles.retryButton} accessibilityRole="button"><Feather name="refresh-cw" size={16} color={colors.gold} /><Text style={styles.retryText}>Retry loading plans</Text></TouchableOpacity> : null}
          </View>
        )}

        <PrimaryButton title="Continue my transformation" icon="arrow-right" onPress={renew} loading={paying} disabled={!plans.length || loading} size="lg" style={styles.renewButton} />
        <View style={styles.checkoutMetaRow}>
          {plans.some((plan) => plan.planId === selectedId && plan.billing === 'recurring') ? (
            <Text style={styles.renewalDisclosure}>Monthly renewal · cancel anytime</Text>
          ) : <View />}
          <TouchableOpacity onPress={checkAccess} disabled={checking} style={styles.checkButton} accessibilityRole="button">
            <Text style={styles.checkText}>{checking ? 'Refreshing…' : 'Already paid?'}</Text>
          </TouchableOpacity>
        </View>
        {!inGrace ? <TouchableOpacity onPress={signOut} style={styles.logoutButton} accessibilityRole="button"><Text style={styles.logoutText}>Log out</Text></TouchableOpacity> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.md },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { flex: 1, paddingRight: spacing.md },
  headerEyebrow: { ...typography.overline, color: colors.gold },
  headerTitle: { ...typography.title, color: colors.ink, marginTop: 3 },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  carouselArea: { flex: 1, minHeight: 0, marginTop: spacing.md },
  benefitSlide: { flex: 1, paddingVertical: spacing.xs },
  benefitCard: { flex: 1, borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  benefitImage: { borderRadius: radius.xl },
  benefitImageShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,6,10,0.55)' },
  benefitContent: { flex: 1, padding: spacing.lg, paddingBottom: spacing.md, justifyContent: 'space-between' },
  benefitContentCompact: { padding: spacing.md, paddingBottom: spacing.sm },
  benefitStory: { width: '100%', paddingTop: spacing.sm },
  benefitStoryCompact: { paddingTop: 0 },
  benefitLabelRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitIcon: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,6,10,0.62)', borderWidth: 1, borderColor: colors.accentSurface },
  benefitIconCompact: { width: 28, height: 28 },
  benefitEyebrow: { ...typography.overline, color: colors.gold },
  benefitTitle: { fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.35, color: colors.ink, width: '100%', marginTop: spacing.sm, textShadowColor: 'rgba(0,0,0,0.88)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  benefitTitleCompact: { fontSize: 21, lineHeight: 26 },
  benefitDescription: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.inkStrong, alignSelf: 'flex-start', marginTop: spacing.sm, maxWidth: 360 },
  benefitDescriptionCompact: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  benefitPoints: { alignSelf: 'stretch', paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.lg, backgroundColor: 'rgba(5,6,10,0.76)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  benefitPointsCompact: { paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: 0 },
  benefitPoint: { minHeight: 40, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitPointDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.11)' },
  benefitCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  benefitPointText: { ...typography.bodyBold, color: colors.ink, flex: 1, textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  benefitPointTextCompact: { ...typography.caption, color: colors.ink, flex: 1, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  carouselDots: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  carouselDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  carouselDotActive: { width: 22, backgroundColor: colors.gold },
  checkoutDock: { paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  loading: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption, color: colors.inkMuted },
  planList: { gap: spacing.xs },
  retryButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  retryText: { ...typography.label, color: colors.gold },
  planCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...shadows.sm },
  planCardSelected: { borderColor: colors.accentSurface },
  planCopy: { flex: 1, minWidth: 0 },
  planName: { ...typography.bodyBold, color: colors.ink },
  planBilling: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  priceCopy: { alignItems: 'flex-end' },
  planPrice: { ...typography.subtitle, color: colors.ink, fontWeight: '900' },
  pricePeriod: { ...typography.caption, color: colors.inkSubtle },
  radio: { width: 23, height: 23, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.borderStrong },
  radioSelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  renewButton: { marginTop: spacing.sm },
  checkoutMetaRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginTop: spacing.xs },
  renewalDisclosure: { ...typography.caption, color: colors.inkSubtle, flex: 1 },
  checkButton: { minHeight: 28, justifyContent: 'center' },
  checkText: { ...typography.label, color: colors.inkMuted },
  logoutButton: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  logoutText: { ...typography.label, color: colors.inkMuted },
});
