import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WorkoutsScreen } from '../screens/main/WorkoutsScreen';
import { WorkoutSummaryScreen } from '../screens/main/WorkoutSummaryScreen';
import { WorkoutDetailScreen } from '../screens/main/WorkoutDetailScreen';
import { WorkoutVideoScreen } from '../screens/main/WorkoutVideoScreen';
import { TrainerScreen } from '../screens/main/TrainerScreen';
import { PlanRefreshScreen } from '../screens/main/PlanRefreshScreen';
import type { WorkoutStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export function WorkoutsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        gestureEnabled: false,
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: '',
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="WorkoutList" component={WorkoutsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Coach" component={TrainerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanRefresh" component={PlanRefreshScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutVideo" component={WorkoutVideoScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
