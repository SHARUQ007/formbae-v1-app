import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaymentSyncScreen } from '../screens/paid/PaymentSyncScreen';
import { PaidWelcomeScreen } from '../screens/paid/PaidWelcomeScreen';
import { FindingTrainerScreen } from '../screens/paid/FindingTrainerScreen';
import { PlanPreparingScreen } from '../screens/paid/PlanPreparingScreen';
import type { PaidStackParamList } from './types';
import { colors } from '../theme/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Stack = createNativeStackNavigator<PaidStackParamList>();

export function PaidTransitionNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: reduceMotion ? 'none' : 'fade',
        animationDuration: 280,
        contentStyle: { backgroundColor: colors.bg },
      }}
      initialRouteName="PaymentSync"
    >
      <Stack.Screen name="PaymentSync" component={PaymentSyncScreen} />
      <Stack.Screen name="ProfileSetup" getComponent={() => require('../screens/paid/ProfileSetupScreen').ProfileSetupScreen} />
      <Stack.Screen name="PaidWelcome" component={PaidWelcomeScreen} />
      <Stack.Screen name="FindingTrainer" component={FindingTrainerScreen} />
      <Stack.Screen name="PlanPreparing" component={PlanPreparingScreen} />
    </Stack.Navigator>
  );
}
