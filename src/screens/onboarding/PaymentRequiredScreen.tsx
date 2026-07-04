import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import { getSiteUrl } from '../../constants/config';
import type { PaymentPlan } from '../../types/api';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

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
    Alert.alert(
      'Complete payment on FormBae',
      'After payment, return to the app. We will sync your plan automatically.',
    );
  };

  return (
    <ScreenContainer>
      <ScrollView>
        <ScreenTitle>Unlock your trainer-backed plan</ScreenTitle>
        <ScreenSubtitle>
          Choose a plan and pay securely with Razorpay inside the app. You can also complete payment on the web.
        </ScreenSubtitle>
        {loading ? <Text style={styles.loading}>Loading plans…</Text> : null}
        {plans.map((plan) => {
          const selected = plan.planId === selectedId;
          return (
            <TouchableOpacity key={plan.planId || plan.planName} activeOpacity={0.85} onPress={() => setSelectedId(plan.planId)}>
              <Card style={selected ? styles.selectedCard : styles.planCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.planName}>{plan.label || plan.planName}</Text>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.planPrice}>₹{(plan.amount / 100).toLocaleString('en-IN')}</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
        <PrimaryButton title="Pay & unlock plan" onPress={onPayNative} loading={paying} style={{ marginTop: 8 }} />
        <PrimaryButton title="Pay on web instead" variant="secondary" onPress={openWebPayment} style={{ marginTop: 12 }} />
        <Text style={styles.note}>Payments are processed by Razorpay. Your access unlocks instantly after verification.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { color: colors.inkMuted, marginBottom: 12 },
  planCard: { marginBottom: 10 },
  selectedCard: { marginBottom: 10, borderColor: colors.accent, backgroundColor: colors.accentLight },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 18, fontWeight: '700', color: colors.ink },
  check: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  planPrice: { fontSize: 22, color: colors.accent, marginTop: 4 },
  note: { marginTop: 16, color: colors.inkMuted, fontSize: 13 },
});
