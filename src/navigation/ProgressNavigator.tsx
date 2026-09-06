import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import type { ProgressStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ProgressStackParamList>();
const getTrophyDetailsScreen = () => require('../screens/main/TrophyDetailsScreen').TrophyDetailsScreen;

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
      <Stack.Screen name="ProgressReportHistory" component={ProgressScreen} />
      <Stack.Screen name="TrophyDetails" getComponent={getTrophyDetailsScreen} />
    </Stack.Navigator>
  );
}
