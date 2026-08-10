import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { fetchRecommendedTrainer } from '../../services/trainerService';
import { displayBehavioralNotification } from '../../services/notificationService';
import { useAuthStore } from '../../store/authStore';
import { resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PaymentRequired'>;

export function PaymentRequiredScreen({ navigation }: Props) {
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [paywallId, setPaywallId] = useState<string>('monsoon-offer');
  const [recommendedTrainerId, setRecommendedTrainerId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

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
      .then((data) => {
        if (data.hasPaid) {
          routeAfterPaid('home');
          return;
        }
        setPlans(data.plans || []);
        setSelectedId(data.plans?.[0]?.planId || '');
        setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'monsoon-offer');
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [routeAfterPaid]);

  useEffect(() => {
    fetchRecommendedTrainer()
      .then((data) => setRecommendedTrainerId(data.trainer?.trainerId))
      .catch(() => undefined);
  }, []);

  const onPayNative = async () => {
    const plan = plans.find((p) => p.planId === selectedId) || plans[0];
    if (!plan) {
      Alert.alert('No plan selected', 'Please choose a plan to continue.');
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
        selectedTrainerId: recommendedTrainerId,
      });
      if (result.cancelled) return;
      if (result.success) {
        await refreshStatus();
        displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
        routeAfterPaid(result.status?.recommendedNextScreen || 'paid_welcome');
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('AnalysisReport'))}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to your report"
          >
            <Feather name="chevron-left" size={22} color={colors.ink} />
            <Text style={styles.backText}>Back to report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLogout}
            style={styles.logoutButton}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Feather name="log-out" size={16} color={colors.inkMuted} />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
        <ScreenTitle>Your plan is ready to unlock</ScreenTitle>
        <ScreenSubtitle>We have used your report to shape your first plan. Choose an option below to activate it securely.</ScreenSubtitle>

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
                  style={[styles.planCard, selected && styles.planSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.planText}>
                    <Text style={styles.planName}>{plan.label || plan.planName}</Text>
                    <Text style={styles.planPrice}>₹{(plan.amount / 100).toLocaleString('en-IN')}</Text>
                    {plan.billing === 'recurring' ? <Text style={styles.planMeta}>Auto-pay renewal</Text> : null}
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <Feather name="check" size={14} color={colors.white} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <PrimaryButton title="Pay & unlock plan" icon="lock" onPress={onPayNative} loading={paying} style={styles.payBtn} />

        <View style={styles.secureRow}>
          <Feather name="shield" size={14} color={colors.inkMuted} />
          <Text style={styles.note}>Your details are securely prefilled in Razorpay. Access unlocks after verification.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg },
  topActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: { ...typography.label, color: colors.ink, flexShrink: 1 },
  logoutButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  logoutText: { ...typography.label, color: colors.inkMuted, flexShrink: 1 },
  plans: { gap: spacing.sm, marginBottom: spacing.md },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  planText: { flex: 1 },
  planName: { ...typography.bodyBold, color: colors.ink },
  planPrice: { ...typography.hero, color: colors.accent, marginTop: 4 },
  planMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
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
  payBtn: { marginTop: spacing.sm },
  secureRow: { flexDirection: 'row', gap: 6, marginTop: spacing.lg, alignItems: 'flex-start' },
  note: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17 },
});
