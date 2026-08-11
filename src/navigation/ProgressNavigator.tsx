import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import { TrophyDetailsScreen } from '../screens/main/TrophyDetailsScreen';
import type { ProgressStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        gestureEnabled: true,
        headerShown: false,
        headerStyle: { backgroundColor: colors.bg },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="ProgressMain" component={ProgressScreen} />
      <Stack.Screen name="ProgressReport" component={ProgressScreen} />
      <Stack.Screen name="TrophyDetails" component={TrophyDetailsScreen} />
    </Stack.Navigator>
  );
}
