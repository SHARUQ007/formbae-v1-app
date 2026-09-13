import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SetupOverview } from '../../components/SetupOverview';
import type { OnboardingStackParamList } from '../../navigation/types';

export function SetupWelcomeScreen({ navigation }: NativeStackScreenProps<OnboardingStackParamList, 'SetupWelcome'>) {
  return <SetupOverview title="Make room for a stronger you."
    subtitle="Training, food and a little accountability. Let’s find what fits your life."
    steps={[
      { title: 'Tell us about yourself', detail: 'Your goals, starting point and weekly rhythm', artwork: 'profile' },
      { title: 'Explore your direction', detail: 'See your assessment and membership options', artwork: 'direction' },
      { title: 'Meet your coach. Make your plan.', detail: 'Your first routine, ready when you are', artwork: 'plan' },
    ]}
    action="Let’s get started" onContinue={() => navigation.navigate('Questionnaire')} />;
}
