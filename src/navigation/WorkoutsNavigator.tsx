import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WorkoutsScreen } from '../screens/main/WorkoutsScreen';
import type { WorkoutStackParamList } from './types';
import { colors } from '../theme/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();
const getWorkoutSummaryScreen = () => require('../screens/main/WorkoutSummaryScreen').WorkoutSummaryScreen;
const getWorkoutDetailScreen = () => require('../screens/main/WorkoutDetailScreen').WorkoutDetailScreen;
const getWorkoutVideoScreen = () => require('../screens/main/WorkoutVideoScreen').WorkoutVideoScreen;
const getTrainerScreen = () => require('../screens/main/TrainerScreen').TrainerScreen;
const getPlanRefreshScreen = () => require('../screens/main/PlanRefreshScreen').PlanRefreshScreen;

export function WorkoutsNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack.Navigator
      screenOptions={{
        gestureEnabled: true,
        animation: reduceMotion ? 'none' : 'slide_from_right',
        animationDuration: 260,
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: '',
        headerTintColor: colors.accentDark,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="WorkoutList" component={WorkoutsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Coach" getComponent={getTrainerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanRefresh" getComponent={getPlanRefreshScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutSummary" getComponent={getWorkoutSummaryScreen} options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="WorkoutDetail" getComponent={getWorkoutDetailScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="WorkoutVideo" getComponent={getWorkoutVideoScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
