import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchPaymentStatus } from '../../services/paymentService';
import { fetchStoreProducts, presentStorePaywall, purchaseStoreProduct, restoreStorePurchases, StorePurchaseError } from '../../services/storePurchaseService';
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
  return [...core, 'Cancel anytime in your store account', 'Professional coach upgrade available'];
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
  const { user, status, refreshStatus } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [suggestion, setSuggestion] = useState<HouseholdSuggestion[]>([]);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({});
  // How the paywall should look, decided by an admin rather than by this build.
  const [presentation, setPresentation] = useState<{ offeringId?: string; hosted?: boolean }>({});
  const [restoring, setRestoring] = useState(false);
  const [plusOnePersonIndex, setPlusOnePersonIndex] = useState(0);

  const selectedPlan = plans.find((plan) => plan.planId === selectedId) || plans[0];
  const included = includedPeople(selectedPlan, suggestion);
  /**
   * The store's own price, already localised and already carrying the right symbol.
   * Nothing here formats money: a price we rendered ourselves could disagree with the
   * sheet the user is about to be shown, and the store is the one charging.
   */
  const priceFor = (plan?: PaymentPlan) => (plan?.storeProductId ? storePrices[plan.storeProductId] || '' : '');
  const selectedPrice = priceFor(selectedPlan);
  /**
   * The store returned no price for anything on offer.
   *
   * It means the products have not been created yet, or have not propagated, or this
   * build has no store configured. Whatever the cause, nothing here can be bought, and
   * the screen has to say so rather than show an em dash where the price goes and a
   * button that trails off after "Get started ·".
   */
  const storeUnavailable = !loading && plans.length > 0 && Object.keys(storePrices).length === 0;

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

  const reload = useCallback(() => {
    setLoading(true);
    return fetchPaymentStatus()
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
        setPresentation(data.paywall || {});
        // A product the store does not return has not been created yet, or has not
        // finished propagating, or is not sold in this storefront. Its plan is left
        // without a price and cannot be bought, rather than shown at one we invented.
        const ids = (data.plans || []).map((plan) => plan.storeProductId || '').filter(Boolean);
        const products = await fetchStoreProducts(ids).catch(() => []);
        setStorePrices(Object.fromEntries(products.map((product) => [product.productId, product.priceString])));
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [routeAfterPaid, refreshStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlusOnePersonIndex((current) => (current + 1) % PLUS_ONE_PEOPLE.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  /**
   * RevenueCat's own paywall, when an admin has asked for it.
   *
   * Worth having as a switch rather than a decision: the hosted template takes its prices,
   * period labels and required disclosures from the offering, so a seasonal set of prices
   * needs no release - while our own screen keeps the household step, which no template
   * knows about.
   */
  const onHostedPaywall = async () => {
    setPaying(true);
    try {
      const result = await presentStorePaywall(presentation.offeringId);
      if (!result?.active) return;
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('SubscriptionSuccess', {
        planName: selectedPlan?.label || selectedPlan?.planName || 'FormBae',
        nextScreen: result.status?.recommendedNextScreen,
      });
      displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
    } catch (error) {
      if (error instanceof StorePurchaseError && error.code === 'CANCELLED') return;
      Alert.alert('Purchase issue', error instanceof Error && error.message ? error.message : 'Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const onBuy = async () => {
    // A household plan collects who the memberships are for first, which is a step the
    // hosted template has no concept of - so it always uses our own screen.
    const chosen = plans.find((p) => p.planId === selectedId) || plans[0];
    if (presentation.hosted && (chosen?.memberLimit || 1) === 1) {
      return onHostedPaywall();
    }
    const plan = plans.find((p) => p.planId === selectedId) || plans[0];
    if (!plan) {
      Alert.alert('No plan selected', 'Please choose a plan to continue.');
      return;
    }
    if ((plan.memberLimit || 1) > 1) {
      navigation.navigate('GiftPlanDetails', { planId: plan.planId });
      return;
    }
    if (!plan.storeProductId || !storePrices[plan.storeProductId]) {
      Alert.alert('Not available yet', 'This plan isn’t available in your store right now. Please try again shortly.');
      return;
    }
    setPaying(true);
    try {
      // The store takes the money; what that bought is settled by the server, which asks
      // RevenueCat rather than believing anything this screen sends.
      const result = await purchaseStoreProduct(plan.storeProductId);
      if (!result.active) {
        Alert.alert('Almost there', 'Your purchase is still being confirmed. We’ll unlock your plan as soon as it clears.');
        return;
      }
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('SubscriptionSuccess', {
        planName: plan.label || plan.planName,
        nextScreen: result.status?.recommendedNextScreen,
      });
      displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
    } catch (error) {
      // A cancelled purchase is a choice, not a failure, and gets no alert.
      if (error instanceof StorePurchaseError && error.code === 'CANCELLED') return;
      const message = error instanceof Error && error.message
        ? error.message
        : 'That purchase didn’t go through. Nothing has been charged.';
      Alert.alert('Purchase issue', message);
    } finally {
      setPaying(false);
    }
  };

  /**
   * Apple requires a way to restore a purchase without buying again, reachable whether or
   * not anything has been bought on this device. It is also the honest answer for anyone
   * who paid on the website, reinstalled, or changed phone.
   */
  const onRestore = async () => {
    setRestoring(true);
    try {
      const result = await restoreStorePurchases();
      if (!result.active) {
        Alert.alert('Nothing to restore', 'We couldn’t find a purchase on this store account.');
        return;
      }
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('SubscriptionSuccess', {
        planName: selectedPlan?.label || selectedPlan?.planName || 'FormBae',
        nextScreen: result.status?.recommendedNextScreen,
      });
    } catch (error) {
      if (error instanceof StorePurchaseError && error.code === 'CANCELLED') return;
      Alert.alert('Restore issue', error instanceof Error && error.message ? error.message : 'We couldn’t restore your purchase.');
    } finally {
      setRestoring(false);
    }
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

        {storeUnavailable ? (
          <View style={styles.unavailableCard}>
            <Text style={styles.unavailableTitle}>Plans aren’t available right now</Text>
            <Text style={styles.unavailableBody}>
              We couldn’t reach {Platform.OS === 'ios' ? 'the App Store' : 'Google Play'} to load pricing. Check your
              connection and try again — nothing has been charged.
            </Text>
            <TouchableOpacity onPress={reload} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryRow}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <LoadingState message="Loading plans…" />
        ) : storeUnavailable ? null : plans.length > 1 ? (
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
                  accessibilityLabel={`${planLabel(plan)}, ${priceFor(plan) || 'price unavailable'} per month`}
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
                      {priceFor(plan) || '—'}
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

        {selectedPlan && !storeUnavailable ? (
          <View style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <View style={styles.selectedHeadingCopy}>
                <Text style={styles.selectedName}>Monthly · {(selectedPlan.memberLimit || 1) === 1 ? 'Just you' : planLabel(selectedPlan)}</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.selectedPrice, { fontSize: density.price + 10, lineHeight: density.priceLine + 11 }]}>{selectedPrice || '—'}</Text>
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

        {storeUnavailable ? null : (
        <View style={styles.checkoutCard}>
          <Text style={styles.paymentNoteText}>
            {Platform.OS === 'ios' ? 'Billed by the App Store' : 'Billed by Google Play'} · Access stays linked to this account
          </Text>
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
                  ? (selectedPrice ? `Continue · ${selectedPrice}` : 'Continue')
                  : (selectedPrice ? `Get started · ${selectedPrice}` : 'Get started')
            }
            icon="arrow-right"
            onPress={onBuy}
            loading={paying}
            size="lg"
            style={styles.payBtn}
          />
          <TouchableOpacity
            onPress={onRestore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            style={styles.restoreRow}
          >
            <Text style={styles.restoreText}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
          </TouchableOpacity>
          {/* Both stores require the terms of a subscription to be stated where it is
              bought: what it costs, how long it runs, and that it renews itself. */}
          <Text style={styles.renewalText}>
            {`A monthly subscription${selectedPrice ? ` at ${selectedPrice}` : ''}. It renews every month until you cancel, `}
            {Platform.OS === 'ios' ? 'in your Apple account settings.' : 'in your Google Play subscriptions.'}
          </Text>
          <View style={styles.policyRow}>
            <Text style={styles.policyText}>By continuing, you agree to the </Text>
            <TouchableOpacity onPress={() => openPolicy('terms-of-use')} accessibilityRole="link">
              <Text style={styles.policyLink}>Terms of Use</Text>
            </TouchableOpacity>
            <Text style={styles.policyText}> and </Text>
            <TouchableOpacity onPress={() => openPolicy('privacy-policy')} accessibilityRole="link">
              <Text style={styles.policyLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.policyText}>.</Text>
          </View>
        </View>
        )}
      </ScrollView>
    </ScreenContainer>
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
  unavailableCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl,
    padding: spacing.md, backgroundColor: colors.panel, gap: spacing.xs,
  },
  unavailableTitle: { ...typography.bodyBold, color: colors.ink },
  unavailableBody: { ...typography.caption, color: colors.inkSubtle, lineHeight: 18 },
  retryRow: { paddingTop: spacing.xs },
  retryText: { ...typography.caption, color: colors.primaryAction, fontWeight: '700' },
  restoreRow: { alignSelf: 'center', paddingVertical: spacing.xs },
  restoreText: { ...typography.caption, color: colors.primaryAction, fontWeight: '600' },
  renewalText: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', lineHeight: 16 },
  policyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  policyText: { ...typography.caption, color: colors.inkSubtle, fontSize: 10, lineHeight: 14 },
  policyLink: { ...typography.caption, color: colors.inkMuted, fontSize: 10, fontWeight: '700', lineHeight: 14, textDecorationLine: 'underline' },
});
