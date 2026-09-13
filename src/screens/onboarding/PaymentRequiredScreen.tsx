import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
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

export function PaymentRequiredScreen({ navigation }: Props) {
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [paywallId, setPaywallId] = useState<string>('monsoon-offer');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberProfile[]>([]);

  const selectedPlan = plans.find((plan) => plan.planId === selectedId) || plans[0];
  const additionalMemberCount = Math.max(0, (selectedPlan?.memberLimit || 1) - 1);

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
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [routeAfterPaid, refreshStatus]);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('AnalysisReport'))}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to your report"
          >
            <Feather name="chevron-left" size={18} color={colors.inkMuted} />
            <Text style={styles.backText}>Back to report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLogout}
            style={styles.logoutButton}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Feather name="log-out" size={14} color={colors.inkSubtle} />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
        <ScreenTitle>Your plan is ready to unlock</ScreenTitle>
        <ScreenSubtitle>Choose who you want FormBae to support. You can change plans later.</ScreenSubtitle>

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
                  onPress={() => choosePlan(plan)}
                  style={[styles.planCard, selected && styles.planSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.planText}>
                    <View style={styles.planNameRow}>
                      <Text style={styles.planName}>{plan.label || plan.planName}</Text>
                      {plan.popular ? <Text style={styles.popularBadge}>MOST POPULAR</Text> : null}
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.planPrice}>₹{(plan.amount / 100).toLocaleString('en-IN')}</Text>
                      <Text style={styles.perMonth}>/ month</Text>
                    </View>
                    <Text style={styles.planMeta}>{plan.tagline || `${plan.memberLimit || 1} member access`}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <Feather name="check" size={14} color={colors.white} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {selectedPlan ? (
          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>{selectedPlan.label || selectedPlan.planName} includes</Text>
            {(selectedPlan.benefits || []).map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Feather name="check" size={15} color={colors.gold} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
            <Text style={styles.coffeeText}>Costs about as much as a coffee each month.</Text>
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

        <PrimaryButton
          title={selectedPlan ? `Pay ₹${(selectedPlan.amount / 100).toLocaleString('en-IN')} & continue` : 'Choose a plan'}
          icon="lock"
          onPress={onPayNative}
          loading={paying}
          size="lg"
          style={styles.payBtn}
        />

        <View style={styles.secureRow}>
          <Feather name="shield" size={14} color={colors.inkMuted} />
          <Text style={styles.note}>Your details are securely prefilled in Razorpay. Access unlocks after verification.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
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
  scroll: { paddingBottom: spacing.lg },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: spacing.sm,
  },
  backText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1, fontWeight: '600' },
  logoutButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm,
  },
  logoutText: { ...typography.caption, color: colors.inkSubtle, flexShrink: 1, fontWeight: '600' },
  plans: { gap: spacing.sm, marginBottom: spacing.md },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  planText: { flex: 1, minWidth: 0 },
  planNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  planName: { ...typography.bodyBold, color: colors.ink },
  popularBadge: { fontSize: 9, lineHeight: 14, letterSpacing: 1, fontWeight: '800', color: colors.onPrimary, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 },
  planPrice: { ...typography.hero, color: colors.accent },
  perMonth: { ...typography.caption, color: colors.inkMuted, marginLeft: 5 },
  planMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.accentFill, borderColor: colors.accent },
  benefitsCard: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 9, marginBottom: spacing.md },
  benefitsTitle: { ...typography.bodyBold, color: colors.ink, marginBottom: 2 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18 },
  coffeeText: { ...typography.caption, color: colors.gold, fontWeight: '700', marginTop: 3 },
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
  payBtn: { minHeight: 62, marginTop: spacing.sm },
  secureRow: { flexDirection: 'row', gap: 6, marginTop: spacing.lg, alignItems: 'flex-start' },
  note: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17 },
});
