import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QuestionnaireScreen } from '../screens/onboarding/QuestionnaireScreen';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();
const getAnalysisLoadingScreen = () => require('../screens/onboarding/AnalysisLoadingScreen').AnalysisLoadingScreen;
const getAnalysisReportScreen = () => require('../screens/onboarding/AnalysisReportScreen').AnalysisReportScreen;
const getTrainerMatchScreen = () => require('../screens/onboarding/TrainerMatchScreen').TrainerMatchScreen;
const getPaymentRequiredScreen = () => require('../screens/onboarding/PaymentRequiredScreen').PaymentRequiredScreen;

export function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
      <Stack.Screen name="AnalysisLoading" getComponent={getAnalysisLoadingScreen} />
      <Stack.Screen name="AnalysisReport" getComponent={getAnalysisReportScreen} />
      <Stack.Screen name="TrainerMatch" getComponent={getTrainerMatchScreen} />
      <Stack.Screen name="PaymentRequired" getComponent={getPaymentRequiredScreen} />
    </Stack.Navigator>
  );
}
