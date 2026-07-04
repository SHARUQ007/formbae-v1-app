import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
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
import { getSiteUrl } from '../../constants/config';
import type { PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PaymentRequired'>;

export function PaymentRequiredScreen({ navigation }: Props) {
  const { user, status, refreshStatus } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [paymentUrl, setPaymentUrl] = useState(getSiteUrl());
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetchPaymentStatus()
      .then((data) => {
        setPlans(data.plans || []);
        setSelectedId(data.plans?.[0]?.planId || '');
        if (data.paymentUrl) setPaymentUrl(data.paymentUrl);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const routeAfterPaid = (screen: string) => {
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
  };

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
        user: { name: status?.name || user?.name || 'FormBae Trainee', mobile: status?.phone || user?.mobile || '' },
        paywallId: 'monsoon-offer',
      });
      if (result.cancelled) return;
      if (result.success) {
        await refreshStatus();
        displayBehavioralNotification('paymentConfirmed').catch(() => undefined);
        routeAfterPaid(result.status?.recommendedNextScreen || 'paid_welcome');
        return;
      }
      Alert.alert('Payment issue', result.error || 'Payment could not be completed. You can also use web checkout.');
    } finally {
      setPaying(false);
    }
  };

  const openWebPayment = async () => {
    const url = paymentUrl || `${getSiteUrl()}/discovery`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unable to open payment', 'Please visit formbae.in to complete payment.');
      return;
    }
    await Linking.openURL(url);
    Alert.alert('Complete payment on FormBae', 'After payment, return to the app. We will sync your plan automatically.');
  };

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenTitle>Unlock your plan</ScreenTitle>
        <ScreenSubtitle>Choose a plan and pay securely with Razorpay inside the app. You can also pay on the web.</ScreenSubtitle>

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
        <PrimaryButton title="Pay on web instead" variant="ghost" onPress={openWebPayment} />

        <View style={styles.secureRow}>
          <Feather name="shield" size={14} color={colors.inkMuted} />
          <Text style={styles.note}>Payments are processed securely by Razorpay. Access unlocks instantly after verification.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg },
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
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  payBtn: { marginTop: spacing.sm },
  secureRow: { flexDirection: 'row', gap: 6, marginTop: spacing.lg, alignItems: 'flex-start' },
  note: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 17 },
});
