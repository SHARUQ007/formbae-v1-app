import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SetupOverview } from '../../components/SetupOverview';
import { useAuthStore } from '../../store/authStore';
import type { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';

export function SetupWelcomeScreen({ navigation }: NativeStackScreenProps<OnboardingStackParamList, 'SetupWelcome'>) {
  const { logout } = useAuthStore();
  return <SetupOverview title="Make room for a stronger you."
    subtitle="Training, food and a little accountability. Let’s find what fits your life."
    steps={[
      { title: 'Tell us about yourself', detail: 'Your goals, starting point and weekly rhythm', artwork: 'profile' },
      { title: 'Explore your direction', detail: 'See your assessment and membership options', artwork: 'direction' },
      { title: 'Meet your coach. Make your plan.', detail: 'Your first routine, ready when you are', artwork: 'plan' },
    ]}
    action="Let’s get started" onContinue={() => navigation.navigate('Questionnaire')}
    onLogout={async () => { await logout(); navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Auth'); }} />;
}
