import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { useAuthStore } from '../../store/authStore';
import { resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { HouseholdMemberProfile, PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PaymentRequired'>;

const RELATIONSHIPS: Array<{ value: HouseholdMemberProfile['relationship']; label: string }> = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'other', label: 'Other' },
];
const AGE_GROUPS: Array<{ value: HouseholdMemberProfile['ageGroup']; label: string }> = [
  { value: 'under-18', label: 'Under 18' },
  { value: '18-34', label: '18–34' },
  { value: '35-49', label: '35–49' },
  { value: '50+', label: '50+' },
];
const GENDERS: Array<{ value: HouseholdMemberProfile['gender']; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'another', label: 'Prefer not to say' },
];
const emptyMember = (): HouseholdMemberProfile => ({ relationship: '', ageGroup: '', gender: '' });
const secondsUntil = (expiresAt: string) => Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000) || 0);
const formatTimer = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const INDIVIDUAL_BENEFITS = [
  'Workouts personalized to your goal and schedule',
  'Practical diet guidance and progress tracking',
  'Daily AI coaching, reminders and accountability',
];

function benefitsForPlan(plan: PaymentPlan): string[] {
  if (plan.benefits?.length) return plan.benefits;
  const members = plan.memberLimit || 1;
  if (members >= 3) return [
    'Everything in the individual plan, for three people',
    'Three profiles — parents, partner or kids',
    'Each plan shaped by that person’s age and gender',
    'Separate workouts, diet guidance and progress',
  ];
  if (members === 2) return [
    'Everything in the individual plan, for two people',
    'A second profile for your mother, spouse or child',
    'Their plan is shaped by their own age and gender',
    'Separate workouts, guidance and progress for each of you',
  ];
  return INDIVIDUAL_BENEFITS;
}

/** Discount headline for the intro offer, or 0 once the timer has run out. */
function savingsPercent(plan: PaymentPlan): number {
  const full = plan.originalAmount || 0;
  if (!full || full <= plan.amount) return 0;
  return Math.round((1 - plan.amount / full) * 100);
}

/** Price framing that re-reads as the member count changes. */
function valueLineForPlan(plan: PaymentPlan | undefined, introActive: boolean): string {
  if (!plan) return 'Build a healthier routine for you and the people you love.';
  const members = plan.memberLimit || 1;
  if (!introActive) {
    return members > 1
      ? 'One plan for your household, with support shaped around each person.'
      : 'Build a healthier routine, with support shaped around your body and your week.';
  }
  const each = rupees(plan.amount / members);
  if (members >= 3) return `${rupees(plan.amount)} a month covers all three of you — about ${each} each. Less than one coffee per person.`;
  if (members === 2) return `${rupees(plan.amount)} a month covers both of you — about ${each} each. Still less than one coffee.`;
  return `${rupees(plan.amount)} a month. Less than a single coffee, for a plan built entirely around you.`;
}

function motivationForPlan(plan: PaymentPlan | undefined): string {
  return (plan?.memberLimit || 1) > 1
    ? 'Most people stop right after the assessment. You don’t have to. One tap turns today’s intention into a plan you and the people you love can actually follow.'
    : 'Most people stop right after the assessment. You don’t have to. One tap turns today’s intention into a plan you can actually follow — starting tomorrow morning.';
}

export function PaymentRequiredScreen({ navigation }: Props) {
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [paywallId, setPaywallId] = useState<string>('monsoon-offer');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberProfile[]>([]);
  const [offerExpiresAt, setOfferExpiresAt] = useState('');
  const [offerSeconds, setOfferSeconds] = useState(0);

  const selectedPlan = plans.find((plan) => plan.planId === selectedId) || plans[0];
  const additionalMemberCount = Math.max(0, (selectedPlan?.memberLimit || 1) - 1);
  const hasIntroPricing = offerSeconds > 0 || plans.some((plan) => plan.originalAmount ? plan.amount < plan.originalAmount : plan.amount <= 14900);
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
        setHouseholdMembers(Array.from({ length: Math.max(0, (preferred?.memberLimit || 1) - 1) }, emptyMember));
        setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'monsoon-offer');
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
          setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'monsoon-offer');
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
    const needed = Math.max(0, (plan.memberLimit || 1) - 1);
    const members = householdMembers.slice(0, needed);
    if (members.length !== needed || members.some((member) => !member.relationship || !member.ageGroup || !member.gender)) {
      Alert.alert('Complete family details', `Add the relationship, age group and gender for ${needed === 1 ? 'your additional member' : 'each additional member'}.`);
      return;
    }
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
        householdMembers: members,
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

  const choosePlan = (plan: PaymentPlan) => {
    setSelectedId(plan.planId);
    const count = Math.max(0, (plan.memberLimit || 1) - 1);
    setHouseholdMembers((current) => Array.from({ length: count }, (_, index) => current[index] || emptyMember()));
  };

  const updateMember = <K extends keyof HouseholdMemberProfile>(index: number, key: K, value: HouseholdMemberProfile[K]) => {
    setHouseholdMembers((current) => current.map((member, memberIndex) => memberIndex === index ? { ...member, [key]: value } : member));
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
      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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

        <ScreenTitle>Choose the support that fits your life</ScreenTitle>
        <ScreenSubtitle>Start with your own plan or bring the people you love along with you.</ScreenSubtitle>

        {offerExpiresAt && !loading && plans.length ? (
          <View style={[styles.offerBar, offerSeconds === 0 && styles.offerBarExpired]}>
            <View style={styles.offerCopy}>
              <Text style={[styles.offerEyebrow, offerSeconds === 0 && styles.offerEyebrowExpired]}>
                {offerSeconds > 0 ? 'INTRO PRICE RESERVED FOR YOU' : 'INTRO OFFER ENDED'}
              </Text>
              <Text style={styles.offerDetail}>
                {offerSeconds === 0
                  ? 'Standard monthly pricing now applies.'
                  : selectedFullPrice
                    ? `This plan goes back to ${rupees(selectedFullPrice)} when the timer ends.`
                    : 'Complete checkout before the timer ends.'}
              </Text>
            </View>
            {offerSeconds > 0 ? <Text style={styles.offerTimer}>{formatTimer(offerSeconds)}</Text> : null}
          </View>
        ) : null}

        {loading ? (
          <LoadingState message="Loading plans…" />
        ) : (
          <View>
            <View style={styles.planSectionHeader}>
              <Text style={styles.planSectionTitle}>CHOOSE YOUR PLAN</Text>
              <Text style={styles.planCount}>Billed monthly · cancel anytime</Text>
            </View>
            <View style={styles.plans}>
              {plans.map((plan) => {
                const selected = plan.planId === selectedId;
                const saved = savingsPercent(plan);
                return (
                  <TouchableOpacity
                    key={plan.planId || plan.planName}
                    activeOpacity={0.85}
                    onPress={() => choosePlan(plan)}
                    style={[styles.planCard, plan.popular && styles.planPopular, selected && styles.planSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    {plan.popular ? (
                      <View style={styles.popularStrip}>
                        <Feather name="star" size={9} color={colors.onPrimary} />
                        <Text style={styles.popularStripText}>MOST POPULAR</Text>
                      </View>
                    ) : null}
                    <View style={styles.planBody}>
                      <View style={styles.planText}>
                        <Text style={styles.planName}>{plan.label || plan.planName}</Text>
                        <View style={styles.priceRow}>
                          <Text style={styles.planPrice}>{rupees(plan.amount)}</Text>
                          <Text style={styles.perMonth}>/ month</Text>
                          {plan.originalAmount && plan.originalAmount > plan.amount ? (
                            <Text style={styles.originalPrice}>{rupees(plan.originalAmount)}</Text>
                          ) : null}
                        </View>
                        <View style={styles.planMetaRow}>
                          <Text style={styles.planMeta} numberOfLines={2}>
                            {plan.tagline || `${plan.memberLimit || 1} member access`}
                          </Text>
                          {saved ? <Text style={styles.savePill}>SAVE {saved}%</Text> : null}
                        </View>
                      </View>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <Feather name="check" size={14} color={colors.white} /> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {selectedPlan ? (
          <View style={styles.benefitsCard}>
            <View style={styles.benefitsHeader}>
              <Text style={styles.benefitsEyebrow}>WHAT YOU’LL UNLOCK</Text>
              <View style={styles.memberChip}>
                <Feather name="users" size={11} color={colors.gold} />
                <Text style={styles.memberChipText}>
                  {(selectedPlan.memberLimit || 1) === 1 ? '1 member' : `${selectedPlan.memberLimit} members`}
                </Text>
              </View>
            </View>
            <Text style={styles.benefitsTitle}>{selectedPlan.label || selectedPlan.planName}</Text>
            {benefitsForPlan(selectedPlan).map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <BenefitCheck />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
            <View style={styles.benefitFootnote}>
              <Text style={styles.benefitFootnoteText}>
                {(selectedPlan.memberLimit || 1) > 1
                  ? 'Every member gets recommendations shaped around their own profile.'
                  : 'Your recommendations adapt as your fitness and routine change.'}
              </Text>
            </View>
          </View>
        ) : null}

        {!loading && plans.length ? (
          <View style={styles.valueCard}>
            <FamilyWellbeingMark />
            <View style={styles.valueCopy}>
              <Text style={styles.valueEyebrow}>A SMALL STEP THAT ADDS UP</Text>
              <Text style={styles.valueText}>{valueLineForPlan(selectedPlan, hasIntroPricing)}</Text>
            </View>
          </View>
        ) : null}

        {additionalMemberCount ? (
          <View style={styles.householdCard}>
            <Text style={styles.householdTitle}>{additionalMemberCount === 1 ? 'Who are you adding?' : 'Add your family members'}</Text>
            <Text style={styles.householdIntro}>Age and gender help tailor each member’s recommendations.</Text>
            {householdMembers.slice(0, additionalMemberCount).map((member, index) => (
              <View key={index} style={[styles.memberForm, index > 0 && styles.memberDivider]}>
                <Text style={styles.memberTitle}>Member {index + 2}</Text>
                <ChoiceGroup label="Relationship" options={RELATIONSHIPS} value={member.relationship} onChange={(value) => updateMember(index, 'relationship', value)} />
                <ChoiceGroup label="Age group" options={AGE_GROUPS} value={member.ageGroup} onChange={(value) => updateMember(index, 'ageGroup', value)} />
                <ChoiceGroup label="Gender" options={GENDERS} value={member.gender} onChange={(value) => updateMember(index, 'gender', value)} />
              </View>
            ))}
          </View>
        ) : null}

        {!loading && plans.length ? (
          <View style={styles.motivation}>
            <Text style={styles.motivationEyebrow}>YOUR NEXT STEP</Text>
            <Text style={styles.motivationText}>{motivationForPlan(selectedPlan)}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={selectedPlan ? `Pay ${rupees(selectedPlan.amount)} & continue` : 'Choose a plan'}
          icon="lock"
          onPress={onPayNative}
          loading={paying}
          size="lg"
          style={styles.payBtn}
        />
        <View style={styles.secureRow}>
          <Feather name="shield" size={12} color={colors.inkSubtle} />
          <Text style={styles.note}>Secure Razorpay checkout · cancel anytime · access unlocks right after verification.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

function FamilyWellbeingMark() {
  return (
    <View style={styles.valueArtwork} pointerEvents="none">
      <Svg width="54" height="54" viewBox="0 0 54 54">
        <Circle cx="19" cy="18" r="6" fill="none" stroke={colors.gold} strokeWidth="2" />
        <Circle cx="36" cy="20" r="5" fill="none" stroke={colors.goldMuted} strokeWidth="2" />
        <Path d="M8 40c0-8 5-13 11-13s11 5 11 13" fill="none" stroke={colors.gold} strokeWidth="2" strokeLinecap="round" />
        <Path d="M30 30c7 0 12 4 12 11" fill="none" stroke={colors.goldMuted} strokeWidth="2" strokeLinecap="round" />
        <Path d="M40 8l1.4 3 3.1 1.3-3.1 1.4-1.4 3-1.4-3-3.1-1.4 3.1-1.3L40 8z" fill={colors.gold} />
      </Svg>
    </View>
  );
}

function BenefitCheck() {
  return (
    <View style={styles.benefitCheck} pointerEvents="none">
      <Svg width="18" height="18" viewBox="0 0 18 18">
        <Circle cx="9" cy="9" r="7.25" fill="rgba(248,216,132,0.08)" stroke={colors.gold} strokeWidth="1.5" />
        <Path d="M5.7 9.1l2.1 2.1 4.6-4.7" fill="none" stroke={colors.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function ChoiceGroup<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollArea: { flex: 1 },
  scroll: { paddingBottom: spacing.lg },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  quietAction: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    opacity: 0.75,
  },
  quietActionText: { fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 0.2, color: colors.inkSubtle },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.accentLight,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  valueArtwork: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    flexShrink: 0,
  },
  valueCopy: { flex: 1, minWidth: 0 },
  valueEyebrow: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.3 },
  valueText: { ...typography.caption, color: colors.ink, lineHeight: 19, marginTop: 5, fontWeight: '600' },
  offerBar: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  offerBarExpired: { backgroundColor: colors.panel, borderColor: colors.border },
  offerCopy: { flex: 1, minWidth: 0 },
  offerEyebrow: { ...typography.label, color: colors.gold, fontSize: 10, letterSpacing: 1.4 },
  offerEyebrowExpired: { color: colors.inkSubtle },
  offerDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 17 },
  offerTimer: { fontSize: 24, lineHeight: 28, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  planSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  planSectionTitle: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.4 },
  planCount: { ...typography.caption, color: colors.inkSubtle, fontSize: 11 },
  plans: { gap: spacing.sm, marginBottom: spacing.md },
  planCard: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  planPopular: { borderColor: colors.goldMuted },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  popularStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.gold,
    paddingVertical: 4,
  },
  popularStripText: { fontSize: 9, lineHeight: 13, letterSpacing: 1.2, fontWeight: '800', color: colors.onPrimary },
  planBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
  },
  planText: { flex: 1, minWidth: 0 },
  planName: { ...typography.bodyBold, color: colors.ink },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 3 },
  planPrice: { ...typography.hero, color: colors.accent },
  perMonth: { ...typography.caption, color: colors.inkMuted, marginLeft: 5 },
  originalPrice: { ...typography.caption, color: colors.inkSubtle, marginLeft: spacing.sm, textDecorationLine: 'line-through' },
  planMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  planMeta: { ...typography.caption, color: colors.inkMuted, flex: 1, minWidth: 0, lineHeight: 17 },
  savePill: {
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.8,
    fontWeight: '800',
    color: colors.success,
    backgroundColor: colors.successLight,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
    flexShrink: 0,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  benefitsCard: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 11, marginBottom: spacing.md },
  benefitsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  benefitsEyebrow: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.4, flexShrink: 1 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    paddingHorizontal: 9,
    paddingVertical: 3,
    flexShrink: 0,
  },
  memberChipText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.3, color: colors.gold },
  benefitsTitle: { ...typography.bodyBold, color: colors.ink, marginBottom: 1 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitCheck: { width: 18, height: 18, marginTop: 1, flexShrink: 0 },
  benefitText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
  benefitFootnote: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10, marginTop: 2 },
  benefitFootnoteText: { ...typography.caption, color: colors.inkSubtle, lineHeight: 18 },
  householdCard: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  householdTitle: { ...typography.bodyBold, color: colors.ink },
  householdIntro: { ...typography.caption, color: colors.inkMuted, marginTop: 3, marginBottom: spacing.md },
  memberForm: { gap: spacing.md },
  memberDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: spacing.lg, paddingTop: spacing.lg },
  memberTitle: { ...typography.label, color: colors.gold, textTransform: 'uppercase', letterSpacing: 1.2 },
  choiceGroup: { gap: spacing.xs },
  choiceLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: { minHeight: 38, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, paddingHorizontal: spacing.md, paddingVertical: 7 },
  choiceSelected: { borderColor: colors.gold, backgroundColor: colors.accentLight },
  choiceText: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
  choiceTextSelected: { color: colors.gold },
  motivation: { borderLeftWidth: 2, borderLeftColor: colors.gold, paddingLeft: spacing.md, marginTop: spacing.xs },
  motivationEyebrow: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.4 },
  motivationText: { ...typography.body, color: colors.ink, lineHeight: 22, marginTop: 5 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  payBtn: { minHeight: 62 },
  secureRow: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, alignItems: 'flex-start' },
  note: { ...typography.caption, color: colors.inkSubtle, flex: 1, lineHeight: 16, fontSize: 11 },
});
