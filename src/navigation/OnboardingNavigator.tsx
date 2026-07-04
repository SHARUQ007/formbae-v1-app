import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QuestionnaireScreen } from '../screens/onboarding/QuestionnaireScreen';
import { AnalysisLoadingScreen } from '../screens/onboarding/AnalysisLoadingScreen';
import { AnalysisReportScreen } from '../screens/onboarding/AnalysisReportScreen';
import { TrainerMatchScreen } from '../screens/onboarding/TrainerMatchScreen';
import { PaymentRequiredScreen } from '../screens/onboarding/PaymentRequiredScreen';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
      <Stack.Screen name="AnalysisLoading" component={AnalysisLoadingScreen} />
      <Stack.Screen name="AnalysisReport" component={AnalysisReportScreen} />
      <Stack.Screen name="TrainerMatch" component={TrainerMatchScreen} />
      <Stack.Screen name="PaymentRequired" component={PaymentRequiredScreen} />
    </Stack.Navigator>
  );
}
