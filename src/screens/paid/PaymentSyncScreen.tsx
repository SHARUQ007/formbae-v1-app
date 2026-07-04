import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { syncPayment } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<PaidStackParamList, 'PaymentSync'>;

export function PaymentSyncScreen({ navigation }: Props) {
  const { refreshStatus } = useAuthStore();

  useEffect(() => {
    (async () => {
      try {
        const result = await syncPayment();
        await refreshStatus();
        const screen = result.status.recommendedNextScreen;
        if (screen === 'home') {
          navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
          return;
        }
        if (screen === 'plan_preparing') {
          navigation.replace('PlanPreparing');
          return;
        }
        if (screen === 'paid_welcome' || !result.status.trainerAssigned) {
          navigation.replace('PaidWelcome');
          return;
        }
        navigation.replace('FindingTrainer');
      } catch {
        navigation.replace('PaidWelcome');
      }
    })();
  }, [navigation, refreshStatus]);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <Text style={styles.text}>Checking your FormBae plan…</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.white, fontSize: 20, fontWeight: '600' },
});
