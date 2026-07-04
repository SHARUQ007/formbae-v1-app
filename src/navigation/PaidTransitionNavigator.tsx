import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaymentSyncScreen } from '../screens/paid/PaymentSyncScreen';
import { PaidWelcomeScreen } from '../screens/paid/PaidWelcomeScreen';
import { FindingTrainerScreen } from '../screens/paid/FindingTrainerScreen';
import { PlanPreparingScreen } from '../screens/paid/PlanPreparingScreen';
import type { PaidStackParamList } from './types';

const Stack = createNativeStackNavigator<PaidStackParamList>();

export function PaidTransitionNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="PaymentSync">
      <Stack.Screen name="PaymentSync" component={PaymentSyncScreen} />
      <Stack.Screen name="PaidWelcome" component={PaidWelcomeScreen} />
      <Stack.Screen name="FindingTrainer" component={FindingTrainerScreen} />
      <Stack.Screen name="PlanPreparing" component={PlanPreparingScreen} />
    </Stack.Navigator>
  );
}
