import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PaymentRequired'>;

const secondsUntil = (expiresAt: string) => Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000) || 0);
const formatTimer = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** Whatever the admin configured on the plan; the local copy is only a fallback. */
function benefitsForPlan(plan: PaymentPlan, included: string): string[] {
  if (plan.benefits?.length) return plan.benefits;
  const members = plan.memberLimit || 1;
  if (members > 1) return [
    `Separate plans for you and ${included}`,
    'Each one shaped by that person’s age and gender',
    'Daily AI coaching, diet guidance and progress',
  ];
  return [
    'Workouts personalized to your goal and schedule',
    'Practical diet guidance and progress tracking',
    'Daily AI coaching, reminders and accountability',
  ];
}

/** Names the people this plan covers, from what the survey implies. */
function includedPeople(plan: PaymentPlan | undefined, suggestion: HouseholdSuggestion[]): string {
  const extra = Math.max(0, (plan?.memberLimit || 1) - 1);
  const names = suggestion.slice(0, extra).map((member) => member.label);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Three sizes of the same layout, so tall screens fill with design rather than empty space. */
function useDensity() {
  const { height } = useWindowDimensions();
  return useMemo(() => {
    const tier = height >= 880 ? 2 : height >= 780 ? 1 : 0;
    const pick = (values: [number, number, number]) => values[tier];
    return {
      title: pick([23, 27, 30]),
      titleLine: pick([28, 33, 36]),
      subtitle: pick([12, 13, 14]),
      subtitleLine: pick([17, 19, 21]),
      offerHeight: pick([42, 50, 58]),
      offerTimer: pick([19, 22, 25]),
      planName: pick([12, 14, 15]),
      planMeta: pick([10, 11, 12]),
      price: pick([22, 26, 30]),
      priceLine: pick([27, 32, 36]),
      cardPadTop: pick([10, 18, 26]),
      cardPadBottom: pick([11, 19, 27]),
      radio: pick([20, 23, 26]),
      benefitPad: pick([12, 18, 24]),
      benefitText: pick([12, 13, 14]),
      benefitLine: pick([17, 20, 22]),
      benefitGap: pick([8, 12, 16]),
      blockGap: pick([10, 14, 18]),
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

  return (
    <ScreenContainer withBottomInset>
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

      {/* Sized to the viewport: no scrolling, and the slack is spread between blocks. */}
      <View style={[styles.body, { gap: density.blockGap }]}>
        <View>
          <Text style={[styles.title, { fontSize: density.title, lineHeight: density.titleLine }]}>Choose your plan</Text>
          <Text style={[styles.subtitle, { fontSize: density.subtitle, lineHeight: density.subtitleLine }]}>
            Less than a coffee a month. You finished the assessment — most people stop there.
          </Text>
        </View>

        {offerExpiresAt && !loading && plans.length ? (
          <View style={[styles.offerBar, { minHeight: density.offerHeight }, offerSeconds === 0 && styles.offerBarExpired]}>
            <Text style={styles.offerDetail} numberOfLines={1}>
              {offerSeconds === 0
                ? 'Intro offer ended · standard pricing'
                : selectedFullPrice
                  ? `Intro price · back to ${rupees(selectedFullPrice)} in`
                  : 'Intro price reserved for you'}
            </Text>
            {offerSeconds > 0 ? <Text style={[styles.offerTimer, { fontSize: density.offerTimer, lineHeight: density.offerTimer + 4 }]}>{formatTimer(offerSeconds)}</Text> : null}
          </View>
        ) : null}

        {loading ? (
          <LoadingState message="Loading plans…" />
        ) : (
          <View style={styles.plans}>
            {plans.map((plan) => {
              const selected = plan.planId === selectedId;
              return (
                <TouchableOpacity
                  key={plan.planId || plan.planName}
                  activeOpacity={0.85}
                  onPress={() => setSelectedId(plan.planId)}
                  style={[styles.planCard, plan.popular && styles.planPopular, selected && styles.planSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  {plan.popular ? (
                    <View style={styles.popularStrip}>
                      <Text style={styles.popularStripText} numberOfLines={1}>POPULAR</Text>
                    </View>
                  ) : (
                    // Keeps every card's content on the same baseline as the popular one.
                    <View style={styles.popularSpacer} />
                  )}
                  <View style={[styles.planBody, { paddingTop: density.cardPadTop, paddingBottom: density.cardPadBottom }]}>
                    <Text style={[styles.planName, { fontSize: density.planName }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {plan.label || plan.planName}
                    </Text>
                    <Text style={[styles.planMeta, { fontSize: density.planMeta }]} numberOfLines={1}>
                      {(plan.memberLimit || 1) === 1 ? '1 member' : `${plan.memberLimit} members`}
                    </Text>
                    <Text style={[styles.planPrice, { fontSize: density.price, lineHeight: density.priceLine }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {rupees(plan.amount)}
                    </Text>
                    <Text style={styles.originalPrice} numberOfLines={1}>
                      {plan.originalAmount && plan.originalAmount > plan.amount ? rupees(plan.originalAmount) : ' '}
                    </Text>
                    <View style={[styles.radio, { width: density.radio, height: density.radio }, selected && styles.radioSelected]}>
                      {selected ? <Feather name="check" size={12} color={colors.white} /> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {selectedPlan ? (
          <View style={[styles.benefitsCard, { paddingVertical: density.benefitPad }]}>
            {included ? (
              <Text style={[styles.includedText, { fontSize: density.benefitText, lineHeight: density.benefitLine }]} numberOfLines={2}>
                Includes a plan for <Text style={styles.includedName}>{included}</Text>
              </Text>
            ) : null}
            <ScrollView
              style={styles.benefitsScroll}
              contentContainerStyle={{ gap: density.benefitGap }}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {benefitsForPlan(selectedPlan, included).map((benefit) => (
                <View key={benefit} style={styles.benefitRow}>
                  <BenefitCheck />
                  <Text style={[styles.benefitText, { fontSize: density.benefitText, lineHeight: density.benefitLine }]}>{benefit}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          title={
            !selectedPlan
              ? 'Choose a plan'
              : (selectedPlan.memberLimit || 1) > 1
                ? 'Continue'
                : `Pay ${rupees(selectedPlan.amount)} & continue`
          }
          icon={(selectedPlan?.memberLimit || 1) > 1 ? 'arrow-right' : 'lock'}
          onPress={onPayNative}
          loading={paying}
          size="lg"
          style={styles.payBtn}
        />
        <Text style={styles.note}>Secure Razorpay checkout · cancel anytime</Text>
      </View>
    </ScreenContainer>
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
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  quietAction: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: 0.75 },
  quietActionText: { fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 0.2, color: colors.inkSubtle },
  // Spreads whatever height is left over between the blocks instead of pooling it at the bottom.
  body: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.sm },
  title: { ...typography.title, fontSize: 23, lineHeight: 28, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 4 },
  offerBar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  offerBarExpired: { backgroundColor: colors.panel, borderColor: colors.border },
  offerDetail: { ...typography.caption, color: colors.gold, fontWeight: '700', flexShrink: 1, letterSpacing: 0.2 },
  offerTimer: { fontSize: 19, lineHeight: 23, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  plans: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  planCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  planPopular: { borderColor: colors.goldMuted },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  popularStrip: { alignItems: 'center', justifyContent: 'center', height: 17, backgroundColor: colors.gold },
  popularSpacer: { height: 17 },
  popularStripText: { fontSize: 8, lineHeight: 11, letterSpacing: 1, fontWeight: '800', color: colors.onPrimary },
  planBody: { alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm, paddingTop: 10, paddingBottom: 11 },
  planName: { ...typography.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  planMeta: { ...typography.caption, color: colors.inkSubtle, fontSize: 10, lineHeight: 13 },
  planPrice: { fontSize: 22, lineHeight: 27, fontWeight: '800', color: colors.accent, letterSpacing: -0.3, marginTop: 2 },
  originalPrice: { ...typography.caption, fontSize: 10, lineHeight: 13, color: colors.inkSubtle, textDecorationLine: 'line-through' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  radioSelected: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  benefitsCard: { flexShrink: 1, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12 },
  benefitsScroll: { flexGrow: 0, flexShrink: 1 },
  includedText: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginBottom: 8 },
  includedName: { color: colors.gold, fontWeight: '700' },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitCheck: { width: 15, height: 15, marginTop: 1, flexShrink: 0 },
  benefitText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17 },
  footer: { paddingTop: spacing.xs },
  payBtn: { minHeight: 56 },
  note: { ...typography.caption, color: colors.inkSubtle, fontSize: 11, textAlign: 'center', marginTop: 7 },
});
