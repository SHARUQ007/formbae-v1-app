import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';
import { HomeScreen } from '../screens/main/HomeScreen';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import { TrainerScreen } from '../screens/main/TrainerScreen';
import { ProfileNavigator } from './ProfileNavigator';
import type { MainTabParamList } from './types';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.white },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, string> = {
            Home: 'home',
            Workouts: 'activity',
            Progress: 'bar-chart-2',
            Trainer: 'message-circle',
            Profile: 'user',
          };
          return <Icon name={map[route.name] || 'circle'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Workouts" component={WorkoutsNavigator} options={{ title: 'Plan' }} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Trainer" component={TrainerScreen} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
  );
}
