import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { QuestionnaireFlow } from '../onboarding/QuestionnaireScreen';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList } from '../../navigation/types';

export function ProfileSetupScreen({ navigation }: NativeStackScreenProps<PaidStackParamList, 'ProfileSetup'>) {
  const { refreshStatus } = useAuthStore();
  return <QuestionnaireFlow onComplete={async () => {
    await refreshStatus();
    navigation.replace('PaidWelcome');
  }} />;
}
