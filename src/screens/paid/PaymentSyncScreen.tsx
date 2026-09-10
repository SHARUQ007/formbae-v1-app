import { useCallback, useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GradientLoading } from '../../components/GradientLoading';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { syncPayment } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<PaidStackParamList, 'PaymentSync'>;
export function PaymentSyncScreen({ navigation }: Props) {
  const { refreshStatus, logout } = useAuthStore();
  const [error, setError] = useState('');
  const check = useCallback(async () => {
    setError('');
    try {
      await syncPayment();
      const fresh = await refreshStatus();
      if (fresh?.recommendedNextScreen === 'home') navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
      else if (fresh?.hasPaid) navigation.replace('PaidWelcome');
      else setError('Your membership hasn’t been confirmed yet. If you paid on the web, use the same phone number here.');
    } catch { setError('We couldn’t verify your payment. Please try again.'); }
  }, [navigation, refreshStatus]);
  useEffect(() => { check(); }, [check]);
  if (!error) return <GradientLoading title="Checking your membership…" subtitle="Looking for your existing payment and saved setup." />;
  return <ScreenContainer withBottomInset>
    <Text style={styles.title}>Let’s check your membership</Text>
    <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
    <PrimaryButton title="Check again" onPress={check} />
    <PrimaryButton title="Use another account" variant="ghost" onPress={async () => { await logout(); navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Auth'); }} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({ title: { fontSize: 28, color: colors.ink, fontWeight: '700', marginVertical: 24 }, message: { color: colors.inkMuted, fontSize: 16, lineHeight: 24, marginBottom: 24 } });
