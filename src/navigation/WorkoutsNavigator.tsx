import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WorkoutsScreen } from '../screens/main/WorkoutsScreen';
import { WorkoutDetailScreen } from '../screens/main/WorkoutDetailScreen';
import { WorkoutVideoScreen } from '../screens/main/WorkoutVideoScreen';
import { TrainerScreen } from '../screens/main/TrainerScreen';
import type { WorkoutStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export function WorkoutsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="WorkoutList" component={WorkoutsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Coach" component={TrainerScreen} options={{ title: 'Your coach' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutVideo" component={WorkoutVideoScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
