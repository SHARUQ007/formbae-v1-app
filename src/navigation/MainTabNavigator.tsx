import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import { DietScreen } from '../screens/main/DietScreen';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import { ProfileNavigator } from './ProfileNavigator';
import type { MainTabParamList } from './types';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; focused: boolean };

const workoutIcon = ({ color, focused }: TabIconProps) => <Icon name="activity" size={focused ? 24 : 22} color={color} />;
const dietIcon = ({ color, focused }: TabIconProps) => (
  <MaterialCommunityIcon name="bowl-mix-outline" size={focused ? 24 : 22} color={color} />
);
const progressIcon = ({ color, focused }: TabIconProps) => <Icon name="bar-chart-2" size={focused ? 24 : 22} color={color} />;
const profileIcon = ({ color, focused }: TabIconProps) => <Icon name="user" size={focused ? 24 : 22} color={color} />;

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.white,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Workouts" component={WorkoutsNavigator} options={{ title: 'Workout', tabBarIcon: workoutIcon }} />
      <Tab.Screen name="Diet" component={DietScreen} options={{ tabBarIcon: dietIcon }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarIcon: progressIcon }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ tabBarIcon: profileIcon }} />
    </Tab.Navigator>
  );
}
