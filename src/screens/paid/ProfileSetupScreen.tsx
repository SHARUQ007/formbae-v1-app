import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { QuestionnaireFlow } from '../onboarding/QuestionnaireScreen';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';

export function ProfileSetupScreen({ navigation }: NativeStackScreenProps<PaidStackParamList, 'ProfileSetup'>) {
  const { refreshStatus } = useAuthStore();
  return <QuestionnaireFlow onComplete={async () => {
    await refreshStatus();
    navigation.replace('PaidWelcome');
  }} onLogout={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Auth')} />;
}
