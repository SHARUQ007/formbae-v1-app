import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QuestionnaireScreen } from '../screens/onboarding/QuestionnaireScreen';
import type { OnboardingStackParamList } from './types';
import { colors } from '../theme/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();
const getAnalysisLoadingScreen = () => require('../screens/onboarding/AnalysisLoadingScreen').AnalysisLoadingScreen;
const getAnalysisReportScreen = () => require('../screens/onboarding/AnalysisReportScreen').AnalysisReportScreen;
const getTrainerMatchScreen = () => require('../screens/onboarding/TrainerMatchScreen').TrainerMatchScreen;
const getPaymentRequiredScreen = () => require('../screens/onboarding/PaymentRequiredScreen').PaymentRequiredScreen;

export function OnboardingNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: reduceMotion ? 'none' : 'slide_from_right',
        animationDuration: 280,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SetupWelcome" getComponent={() => require('../screens/onboarding/SetupWelcomeScreen').SetupWelcomeScreen} />
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
      <Stack.Screen name="AnalysisLoading" getComponent={getAnalysisLoadingScreen} options={{ animation: reduceMotion ? 'none' : 'fade' }} />
      <Stack.Screen name="AnalysisReport" getComponent={getAnalysisReportScreen} options={{ animation: reduceMotion ? 'none' : 'fade' }} />
      <Stack.Screen name="TrainerMatch" getComponent={getTrainerMatchScreen} />
      <Stack.Screen name="PaymentRequired" getComponent={getPaymentRequiredScreen} />
    </Stack.Navigator>
  );
}
