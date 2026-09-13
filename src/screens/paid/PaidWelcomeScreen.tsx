import { useState } from 'react';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SetupOverview } from '../../components/SetupOverview';
import { useAuthStore } from '../../store/authStore';
import { nextPaidSetupStep } from '../../utils/onboarding';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PaidStackParamList, 'PaidWelcome'>;

export function PaidWelcomeScreen({ navigation }: Props) {
  const { status, refreshStatus, logout } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const step = status ? nextPaidSetupStep(status) : 'PaymentSync';
  const labels = { PaymentSync: 'Check membership', ProfileSetup: 'Complete my profile', FindingTrainer: 'Choose my coach', PlanPreparing: 'Create my workout plan', Main: 'Enter FormBae' };
  const proceed = async () => {
    setBusy(true); setError('');
    try {
      const fresh = await refreshStatus();
      if (!fresh) throw new Error('Status unavailable');
      const next = nextPaidSetupStep(fresh);
      if (next === 'Main') navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
      else navigation.navigate(next);
    } catch { setError('We couldn’t check your setup. Please try again.'); }
    finally { setBusy(false); }
  };
  return <SetupOverview paid={!!status?.hasPaid} title="Your next chapter starts here."
    subtitle="Let’s finish your setup and turn your membership into a routine that fits you."
    steps={[
      { title: 'Your membership', detail: 'Confirm your existing payment', artwork: 'membership', complete: status?.hasPaid },
      { title: 'Your starting point', detail: 'Goals and a schedule that works for you', artwork: 'profile', complete: status?.questionnaireCompleted },
      { title: 'Your coach', detail: 'Choose from the coaches included in your plan', artwork: 'coach', complete: status?.trainerAssigned, onChange: status?.hasPaid && status.questionnaireCompleted && status.trainerAssigned && !status.planReady ? () => navigation.navigate('FindingTrainer') : undefined },
      { title: 'Your first workout plan', detail: 'Built from your profile and coach selection', artwork: 'plan', complete: status?.planReady },
    ]}
    action={labels[step]} onContinue={proceed} busy={busy} error={error}
    onLogout={async () => { await logout(); navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Auth'); }} />;
}
