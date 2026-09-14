import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { useAuthStore } from '../../store/authStore';
import { resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { HouseholdSuggestion, PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { rupees } from '../../utils/format';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PaymentRequired'>;

const secondsUntil = (expiresAt: string) => Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000) || 0);
const formatTimer = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const PLUS_ONE_PEOPLE = ['Mother', 'Father', 'Partner', 'Loved one'] as const;

function planLabel(plan: PaymentPlan): string {
  if ((plan.memberLimit || 1) === 3) return 'You + 2';
  return plan.label || plan.planName;
}

function benefitsForPlan(plan: PaymentPlan, included: string): string[] {
  const members = plan.memberLimit || 1;
  const core = members > 1
    ? [
        `${members} personalized member profiles`,
        included ? `A separate plan for you and ${included}` : 'A separate plan for every member',
        'Plans shaped by each person’s age and gender',
      ]
    : [
        'AI trainer',
        'Personalized workout and diet plans',
        'Daily guidance and progress tracking',
      ];
  return [...core, '5-day refund money-back policy', 'Professional coach upgrade at ₹999'];
}

/** Names the people this plan covers, from what the survey implies. */
function includedPeople(plan: PaymentPlan | undefined, suggestion: HouseholdSuggestion[]): string {
  const extra = Math.max(0, (plan?.memberLimit || 1) - 1);
  const names = suggestion.slice(0, extra).map((member) => member.label);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Keep the complete checkout visible on common phones; scrolling remains a small-screen fallback. */
function useDensity() {
  const { height } = useWindowDimensions();
  return useMemo(() => {
    const tier = height >= 900 ? 2 : height >= 760 ? 1 : 0;
    const pick = (values: [number, number, number]) => values[tier];
    return {
      title: pick([21, 23, 25]),
      titleLine: pick([26, 28, 30]),
      subtitle: pick([11, 12, 13]),
      subtitleLine: pick([16, 17, 19]),
      offerHeight: pick([40, 43, 46]),
      offerTimer: pick([18, 19, 21]),
      planName: pick([12, 14, 15]),
      planMeta: pick([10, 11, 12]),
      price: pick([20, 22, 24]),
      priceLine: pick([25, 27, 29]),
      benefitText: pick([11, 12, 13]),
      benefitLine: pick([15, 17, 18]),
      contentGap: pick([7, 8, 10]),
    };
  }, [height]);
}

export function PaymentRequiredScreen({ navigation }: Props) {
  const density = useDensity();
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [paywallId, setPaywallId] = useState<string>('app-paywall');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [suggestion, setSuggestion] = useState<HouseholdSuggestion[]>([]);
  const [offerExpiresAt, setOfferExpiresAt] = useState('');
  const [offerSeconds, setOfferSeconds] = useState(0);
  const [plusOnePersonIndex, setPlusOnePersonIndex] = useState(0);

  const selectedPlan = plans.find((plan) => plan.planId === selectedId) || plans[0];
  const included = includedPeople(selectedPlan, suggestion);
  const selectedFullPrice = selectedPlan?.originalAmount && selectedPlan.originalAmount > selectedPlan.amount
    ? selectedPlan.originalAmount
    : 0;

  const routeAfterPaid = useCallback((screen: string) => {
    const rootNav = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    const root = resolveRootRoute(screen as never);
    if (root === 'PaidTransition') {
      rootNav?.replace('PaidTransition', { screen: resolvePaidInitialRoute(screen as never) });
      return;
    }
    if (root === 'Main') {
      rootNav?.replace('Main');
      return;
    }
    rootNav?.replace('PaidTransition', { screen: 'PaymentSync' });
  }, [navigation]);

  useEffect(() => {
    fetchPaymentStatus()
      .then(async (data) => {
        if (data.hasPaid) {
          const fresh = await refreshStatus();
          routeAfterPaid(fresh?.recommendedNextScreen || 'payment_sync');
          return;
        }
        setPlans(data.plans || []);
        const preferred = data.plans?.find((plan) => plan.popular) || data.plans?.[0];
        setSelectedId(preferred?.planId || '');
        setSuggestion(data.householdSuggestion || []);
        setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'app-paywall');
        setOfferExpiresAt(data.offerExpiresAt || '');
        setOfferSeconds(data.offerExpiresAt ? secondsUntil(data.offerExpiresAt) : 0);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [routeAfterPaid, refreshStatus]);

  useEffect(() => {
    if (!offerExpiresAt) return;
    let refreshed = false;
    const updateTimer = () => {
      const remaining = secondsUntil(offerExpiresAt);
      setOfferSeconds(remaining);
      if (remaining > 0 || refreshed) return;
      refreshed = true;
      setPlans((current) => current.map((plan) => plan.originalAmount ? { ...plan, amount: plan.originalAmount } : plan));
      fetchPaymentStatus()
        .then((data) => {
          setPlans(data.plans || []);
          setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'app-paywall');
          setSelectedId((current) => data.plans?.some((plan) => plan.planId === current)
            ? current
            : (data.plans?.find((plan) => plan.popular) || data.plans?.[0])?.planId || '');
        })
        .catch(() => undefined);
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [offerExpiresAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlusOnePersonIndex((current) => (current + 1) % PLUS_ONE_PEOPLE.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  const onPayNative = async () => {
    const plan = plans.find((p) => p.planId === selectedId) || plans[0];
    if (!plan) {
      Alert.alert('No plan selected', 'Please choose a plan to continue.');
      return;
    }
    if ((plan.memberLimit || 1) > 1) {
      navigation.navigate('GiftPlanDetails', { planId: plan.planId });
      return;
    }
    setPaying(true);
    try {
      // Members are derived server-side from the survey, so none are sent here.
      const result = await runNativeCheckout({
        plan,
        user: {
          name: status?.name || user?.name || 'FormBae Trainee',
          mobile: status?.phone || user?.mobile || '',
          email: status?.email,
        },
        paywallId: plan.paywallId || paywallId,
      });
      if (result.cancelled) return;
      if (result.success) {
        const fresh = await refreshStatus();
        displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
        routeAfterPaid(fresh?.recommendedNextScreen || 'payment_sync');
        return;
      }
      Alert.alert('Payment issue', result.error || 'Payment could not be completed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const onLogout = () => {
    Alert.alert('Log out?', 'You can sign back in later to continue from this report.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Auth');
        },
      },
    ]);
  };

  const openPolicy = (path: string) => {
    Linking.openURL(`https://formbae.in/${path}`).catch(() => {
      Alert.alert('Could not open this page', 'Please try again when you are connected.');
    });
  };

  const checkoutName = status?.name || user?.name || 'FormBae member';
  const checkoutMobile = status?.phone || user?.mobile || '';
  const selectedBenefits = selectedPlan ? benefitsForPlan(selectedPlan, included) : [];

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <View style={styles.topActions}>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('AnalysisReport'))}
          style={styles.quietAction}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Back to your report"
        >
          <Feather name="chevron-left" size={13} color={colors.inkSubtle} />
          <Text style={styles.quietActionText}>Report</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLogout}
          style={styles.quietAction}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={styles.quietActionText}>Log out</Text>
          <Feather name="log-out" size={11} color={colors.inkSubtle} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { gap: density.contentGap }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={[styles.title, { fontSize: density.title, lineHeight: density.titleLine }]}>Get started with your fitness journey.</Text>
          <Text style={[styles.subtitle, { fontSize: density.subtitle, lineHeight: density.subtitleLine }]}>
            Your preliminary report is ready. Unlock app access, trainer guidance, workout and diet direction.
          </Text>
        </View>

        {offerExpiresAt && !loading && plans.length ? (
          <View style={[styles.offerBar, { minHeight: density.offerHeight }, offerSeconds === 0 && styles.offerBarExpired]}>
            <View style={styles.offerLabel}>
              <ClockArtwork expired={offerSeconds === 0} />
              <Text style={[styles.offerDetail, offerSeconds === 0 && styles.offerDetailExpired]} numberOfLines={1}>
                {offerSeconds === 0 ? 'Regular price applies' : 'Discounted price reserved'}
              </Text>
            </View>
            {offerSeconds > 0 ? <Text style={[styles.offerTimer, { fontSize: density.offerTimer, lineHeight: density.offerTimer + 4 }]}>{formatTimer(offerSeconds)}</Text> : null}
          </View>
        ) : null}

        {loading ? (
          <LoadingState message="Loading plans…" />
        ) : plans.length > 1 ? (
          <View style={styles.planChoices} accessibilityRole="radiogroup">
            {plans.map((plan) => {
              const selected = plan.planId === selectedId;
              return (
                <TouchableOpacity
                  key={plan.planId || plan.planName}
                  activeOpacity={0.85}
                  onPress={() => setSelectedId(plan.planId)}
                  style={[styles.planChoice, plan.popular && styles.planChoicePopular, selected && styles.planChoiceSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${planLabel(plan)}, ${rupees(plan.amount)} per month`}
                >
                  {plan.popular ? (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularBadgeText} numberOfLines={1}>POPULAR</Text>
                    </View>
                  ) : null}
                  <View style={styles.planChoiceBody}>
                    <Text style={[styles.planName, { fontSize: density.planName }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {planLabel(plan)}
                    </Text>
                    <Text style={styles.planChoicePrice} numberOfLines={1}>
                      {rupees(plan.amount)}
                    </Text>
                    {(plan.memberLimit || 1) === 2 ? (
                      <Text style={[styles.planMeta, { fontSize: density.planMeta }]} numberOfLines={1}>{PLUS_ONE_PEOPLE[plusOnePersonIndex]}</Text>
                    ) : <View style={styles.planMetaSpacer} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {selectedPlan ? (
          <View style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <View style={styles.selectedHeadingCopy}>
                <Text style={styles.selectedName}>Monthly · {(selectedPlan.memberLimit || 1) === 1 ? 'Just you' : planLabel(selectedPlan)}</Text>
                <View style={styles.priceRow}>
                  {selectedFullPrice ? <Text style={styles.selectedOriginalPrice}>{rupees(selectedFullPrice)}</Text> : null}
                  <Text style={[styles.selectedPrice, { fontSize: density.price + 10, lineHeight: density.priceLine + 11 }]}>{rupees(selectedPlan.amount)}</Text>
                  <Text style={styles.perMonth}>/ month</Text>
                </View>
              </View>
              <SelectedArtwork />
            </View>
            <View style={styles.benefitsList}>
              {selectedBenefits.map((benefit) => (
                <View key={benefit} style={styles.benefitRow}>
                  <BenefitCheck />
                  <Text style={[styles.benefitText, { fontSize: density.benefitText, lineHeight: density.benefitLine }]}>{benefit}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.checkoutCard}>
          <Text style={styles.paymentNoteText}>Secure checkout through Razorpay · Access stays linked to this account</Text>
          <View style={styles.contactField}>
            <Text style={styles.contactText} numberOfLines={1}>{checkoutName}</Text>
          </View>
          <View style={styles.contactField}>
            <Text style={styles.contactText} numberOfLines={1}>{checkoutMobile || 'Verified mobile number'}</Text>
          </View>
          <PrimaryButton
            title={
              !selectedPlan
                ? 'Choose a plan'
                : (selectedPlan.memberLimit || 1) > 1
                  ? `Continue · ${rupees(selectedPlan.amount)}`
                  : `Get started · ${rupees(selectedPlan.amount)}`
            }
            icon="arrow-right"
            onPress={onPayNative}
            loading={paying}
            size="lg"
            style={styles.payBtn}
          />
          <View style={styles.policyRow}>
            <Text style={styles.policyText}>By continuing, you agree to the </Text>
            <TouchableOpacity onPress={() => openPolicy('terms-of-use')} accessibilityRole="link">
              <Text style={styles.policyLink}>FormBae policies</Text>
            </TouchableOpacity>
            <Text style={styles.policyText}> and </Text>
            <TouchableOpacity onPress={() => openPolicy('refund-policy')} accessibilityRole="link">
              <Text style={styles.policyLink}>5-day refund policy</Text>
            </TouchableOpacity>
            <Text style={styles.policyText}>.</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function ClockArtwork({ expired }: { expired: boolean }) {
  const color = expired ? colors.inkSubtle : colors.gold;
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="1.8" />
      <Path d="M12 7.4v5l3.4 1.9" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SelectedArtwork() {
  return (
    <View style={styles.selectedArtwork} pointerEvents="none">
      <Svg width="38" height="38" viewBox="0 0 40 40">
        <Circle cx="20" cy="20" r="19" fill={colors.primaryAction} />
        <Path d="M12.5 20.4l5 5 10.6-11" fill="none" stroke={colors.onPrimary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function BenefitCheck() {
  return (
    <View style={styles.benefitCheck} pointerEvents="none">
      <Svg width="15" height="15" viewBox="0 0 18 18">
        <Circle cx="9" cy="9" r="7.25" fill="rgba(248,216,132,0.08)" stroke={colors.gold} strokeWidth="1.5" />
        <Path d="M5.7 9.1l2.1 2.1 4.6-4.7" fill="none" stroke={colors.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  quietAction: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: 0.52 },
  quietActionText: { fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 0.2, color: colors.inkSubtle },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingTop: 4, paddingBottom: 2 },
  intro: { gap: 5 },
  title: { ...typography.title, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { ...typography.body, color: colors.inkMuted },
  offerBar: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  offerBarExpired: { backgroundColor: colors.panel, borderColor: colors.border },
  offerLabel: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offerDetail: { ...typography.caption, color: colors.gold, fontWeight: '800', flexShrink: 1, letterSpacing: 1.7, textTransform: 'uppercase' },
  offerDetailExpired: { color: colors.inkMuted },
  offerTimer: { fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  planChoices: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  planChoice: {
    flex: 1,
    minWidth: 0,
    minHeight: 82,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  planChoicePopular: { borderColor: colors.goldMuted },
  planChoiceSelected: { borderColor: colors.ink, backgroundColor: colors.panelRaised },
  popularBadge: { height: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  popularBadgeText: { fontSize: 7, lineHeight: 10, letterSpacing: 1.2, fontWeight: '900', color: colors.onPrimary },
  planChoiceBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 8, gap: 2 },
  planName: { ...typography.caption, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  planChoicePrice: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: colors.gold },
  planMeta: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
  planMetaSpacer: { height: 13 },
  selectedCard: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    gap: 11,
  },
  selectedHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  selectedHeadingCopy: { flex: 1, minWidth: 0 },
  selectedName: { ...typography.title, color: colors.ink, fontSize: 18, lineHeight: 23 },
  selectedArtwork: { flexShrink: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  selectedOriginalPrice: { ...typography.bodyBold, color: colors.inkSubtle, textDecorationLine: 'line-through', paddingBottom: 4 },
  selectedPrice: { fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  perMonth: { ...typography.body, color: colors.inkMuted, paddingBottom: 5 },
  benefitsList: { gap: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitCheck: { width: 15, height: 15, marginTop: 2, flexShrink: 0 },
  benefitText: { ...typography.body, color: colors.inkMuted, flex: 1 },
  paymentNoteText: { ...typography.caption, color: colors.inkMuted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  checkoutCard: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 11, gap: 7 },
  contactField: { minHeight: 43, justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primaryAction, paddingHorizontal: spacing.md },
  contactText: { ...typography.body, color: colors.onPrimary, fontSize: 14 },
  payBtn: { minHeight: 52 },
  policyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  policyText: { ...typography.caption, color: colors.inkSubtle, fontSize: 10, lineHeight: 14 },
  policyLink: { ...typography.caption, color: colors.inkMuted, fontSize: 10, fontWeight: '700', lineHeight: 14, textDecorationLine: 'underline' },
});
