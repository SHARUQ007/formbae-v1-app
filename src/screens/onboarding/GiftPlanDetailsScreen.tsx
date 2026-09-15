import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { ScreenContainer } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchPaymentStatus } from '../../services/paymentService';
import { fetchStoreProducts, purchaseStoreProduct, recordHouseholdMembers, StorePurchaseError } from '../../services/storePurchaseService';
import { displayBehavioralNotification } from '../../services/notificationService';
import type { HouseholdGiftMember, HouseholdSuggestion, PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'GiftPlanDetails'>;
type Relationship = HouseholdGiftMember['relationship'];

const RELATIONSHIPS: Array<{ value: Relationship; label: string }> = [
  { value: 'spouse', label: 'Partner' },
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'child', label: 'Child' },
  { value: 'other', label: 'Someone else' },
];

const relationshipLabel = (value: Relationship) => RELATIONSHIPS.find((item) => item.value === value)?.label || 'Someone else';
/** Ten digits, however it was typed or pasted - "+91 98765 43210" is the same number. */
const digitsOnly = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

type GiftDraft = HouseholdGiftMember & { customLabel: string };

const emptyDraft = (relationship: Relationship): GiftDraft => ({ relationship, name: '', mobile: '', customLabel: '' });

export function GiftPlanDetailsScreen({ navigation, route }: Props) {
  const { planId } = route.params;
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  // The store's own localised price. Nothing here formats money: the store is the one
  // charging, and a price we rendered ourselves could disagree with its sheet.
  const [storePrice, setStorePrice] = useState('');
  const [drafts, setDrafts] = useState<GiftDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [picking, setPicking] = useState(-1);

  const memberCount = Math.max(0, (plan?.memberLimit || 1) - 1);

  useEffect(() => {
    fetchPaymentStatus()
      .then(async (data) => {
        const selected = data.plans?.find((entry) => entry.planId === planId) || data.plans?.[0] || null;
        setPlan(selected);
        if (selected?.storeProductId) {
          const products = await fetchStoreProducts([selected.storeProductId]).catch(() => []);
          setStorePrice(products[0]?.priceString || '');
        }
        const extra = Math.max(0, (selected?.memberLimit || 1) - 1);
        const suggestion: HouseholdSuggestion[] = data.householdSuggestion || [];
        // The survey already implies who this is for, so the picker opens on that answer.
        setDrafts(Array.from({ length: extra }, (_, index) =>
          emptyDraft((suggestion[index]?.relationship as Relationship) || 'spouse')));
      })
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [planId]);

  const updateDraft = (index: number, patch: Partial<GiftDraft>) => {
    setDrafts((current) => current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)));
  };

  const firstProblem = useMemo(() => {
    for (const draft of drafts) {
      if (!draft.name.trim()) return 'Add their name so their plan is theirs.';
      if (draft.mobile.length !== 10) return 'Add a 10 digit mobile number for each person.';
      if (draft.relationship === 'other' && !draft.customLabel.trim()) return 'Tell us who they are to you.';
    }
    return '';
  }, [drafts]);

  const onPay = async () => {
    if (!plan) return;
    if (firstProblem) {
      Alert.alert('Almost there', firstProblem);
      return;
    }
    setPaying(true);
    try {
      const members: HouseholdGiftMember[] = drafts.map((draft) => ({
        relationship: draft.relationship,
        name: draft.name.trim(),
        mobile: draft.mobile,
        ...(draft.relationship === 'other' ? { customLabel: draft.customLabel.trim() } : {}),
      }));
      if (!plan.storeProductId) {
        Alert.alert('Not available yet', 'This plan isn’t available in your store right now. Please try again shortly.');
        return;
      }
      // Written down first: the store sells one product and carries none of this with it,
      // so the server reads these back when the entitlement arrives.
      await recordHouseholdMembers(plan.planId, members);
      const result = await purchaseStoreProduct(plan.storeProductId);
      if (!result.active) {
        Alert.alert('Almost there', 'Your purchase is still being confirmed. We’ll unlock your plans as soon as it clears.');
        return;
      }
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('SubscriptionSuccess', {
        planName: plan.label || plan.planName,
        nextScreen: result.status?.recommendedNextScreen,
      });
      displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
    } catch (error) {
      if (error instanceof StorePurchaseError && error.code === 'CANCELLED') return;
      const message = error instanceof Error && error.message
        ? error.message
        : 'That purchase didn’t go through. Nothing has been charged.';
      Alert.alert('Purchase issue', message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <ScreenContainer withBottomInset>
      <View style={styles.topActions}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.quietAction}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Back to plans"
        >
          <Feather name="chevron-left" size={13} color={colors.inkSubtle} />
          <Text style={styles.quietActionText}>Plans</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {loading ? (
          <LoadingState message="Loading your plan…" />
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.hero}>
              <GiftSurpriseMark />
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{memberCount > 1 ? 'Who are these plans for?' : 'Who is this plan for?'}</Text>
                <Text style={styles.subtitle}>
                  We&apos;ll set up their own plan and text them an invite. It stays a surprise until you say so.
                </Text>
              </View>
            </View>

            {drafts.map((draft, index) => (
              <View key={index} style={[styles.memberCard, index > 0 && styles.memberCardSpaced]}>
                {memberCount > 1 ? <Text style={styles.memberIndex}>PERSON {index + 1}</Text> : null}
                <Text style={styles.fieldLabel}>They are your</Text>
                <TouchableOpacity
                  style={styles.select}
                  activeOpacity={0.8}
                  onPress={() => setPicking(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Relationship: ${relationshipLabel(draft.relationship)}. Tap to change.`}
                >
                  <Text style={styles.selectText}>{relationshipLabel(draft.relationship)}</Text>
                  <Feather name="chevron-down" size={16} color={colors.inkMuted} />
                </TouchableOpacity>

                {draft.relationship === 'other' ? (
                  <FormInput
                    label="Who are they to you?"
                    value={draft.customLabel}
                    onChangeText={(text) => updateDraft(index, { customLabel: text })}
                    placeholder="Sister, friend, flatmate…"
                    autoCapitalize="sentences"
                    maxLength={40}
                  />
                ) : null}

                <FormInput
                  label="Their name"
                  value={draft.name}
                  onChangeText={(text) => updateDraft(index, { name: text })}
                  placeholder="Full name"
                  autoCapitalize="words"
                  maxLength={60}
                  icon="user"
                />
                <FormInput
                  label="Their mobile number"
                  value={draft.mobile}
                  onChangeText={(text) => updateDraft(index, { mobile: digitsOnly(text) })}
                  placeholder="10 digit number"
                  keyboardType="phone-pad"
                  prefix="+91"
                />
              </View>
            ))}

            {plan?.benefits?.length ? (
              <View style={styles.benefitsCard}>
                <Text style={styles.benefitsEyebrow}>WHAT THEY GET</Text>
                {plan.benefits.map((benefit) => (
                  <View key={benefit} style={styles.benefitRow}>
                    <Feather name="check" size={13} color={colors.gold} />
                    <Text style={styles.benefitText}>{benefit}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <PrimaryButton
            title={plan && storePrice ? `Pay ${storePrice} & continue` : 'Continue'}
            icon="lock"
            onPress={onPay}
            loading={paying}
            disabled={loading || !plan}
            size="lg"
            style={styles.payBtn}
          />
          <Text style={styles.note}>Secure Razorpay checkout · cancel anytime</Text>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={picking >= 0} transparent animationType="fade" onRequestClose={() => setPicking(-1)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPicking(-1)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>They are your</Text>
            {RELATIONSHIPS.map((option) => {
              const active = drafts[picking]?.relationship === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sheetRow, active && styles.sheetRowActive]}
                  onPress={() => {
                    updateDraft(picking, { relationship: option.value });
                    setPicking(-1);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>{option.label}</Text>
                  {active ? <Feather name="check" size={16} color={colors.gold} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}

function GiftSurpriseMark() {
  return (
    <View style={styles.heroArt} pointerEvents="none">
      <Svg width="72" height="72" viewBox="0 0 72 72">
        <G>
          <Path d="M36 20c-4 0-7-2-7-5s2-5 5-5c4 0 6 4 7 10 1-6 3-10 7-10 3 0 5 2 5 5s-3 5-7 5" fill="none" stroke={colors.gold} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <Rect x="14" y="20" width="44" height="13" rx="3" fill="none" stroke={colors.gold} strokeWidth="2.4" />
          <Path d="M18 33h36v26a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V33z" fill="none" stroke={colors.goldMuted} strokeWidth="2.4" strokeLinejoin="round" />
          <Path d="M36 20v42" stroke={colors.gold} strokeWidth="2.4" strokeLinecap="round" />
          <Circle cx="9" cy="15" r="1.8" fill={colors.gold} />
          <Circle cx="63" cy="41" r="1.5" fill={colors.goldMuted} />
          <Path d="M62 12l1 2.6 2.6 1-2.6 1L62 19l-1-2.4-2.6-1 2.6-1L62 12z" fill={colors.gold} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: spacing.md },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  quietAction: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: 0.75 },
  quietActionText: { fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 0.2, color: colors.inkSubtle },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  heroArt: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    flexShrink: 0,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  title: { ...typography.title, fontSize: 21, lineHeight: 26, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 4 },
  memberCard: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  memberCardSpaced: { marginTop: spacing.sm },
  memberIndex: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.4 },
  fieldLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
  select: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.md,
  },
  selectText: { ...typography.bodyBold, color: colors.ink },
  benefitsCard: {
    marginTop: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 7,
  },
  benefitsEyebrow: { ...typography.label, color: colors.gold, fontSize: 9, letterSpacing: 1.4 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17 },
  footer: { paddingTop: spacing.sm },
  payBtn: { minHeight: 56 },
  note: { ...typography.caption, color: colors.inkSubtle, fontSize: 11, textAlign: 'center', marginTop: 7 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.panelMuted,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  sheetTitle: { ...typography.label, color: colors.inkSubtle, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: spacing.sm },
  sheetRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  sheetRowActive: { backgroundColor: colors.accentLight },
  sheetRowText: { ...typography.body, color: colors.ink },
  sheetRowTextActive: { color: colors.gold, fontWeight: '700' },
});
