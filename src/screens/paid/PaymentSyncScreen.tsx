import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GradientLoading } from '../../components/GradientLoading';
import { syncPayment } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

  return <GradientLoading title="Checking your FormBae plan…" subtitle="Syncing your payment and unlocking access." />;
}
