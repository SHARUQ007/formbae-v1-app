import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import { DietScreen } from '../screens/main/DietScreen';
import { ActionHubScreen } from '../screens/main/ActionHubScreen';
import { ProgressNavigator } from './ProgressNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import type { MainTabParamList } from './types';
import { appTabBarStyle, hiddenTabBarStyle } from './tabBarStyle';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; focused: boolean };

const workoutIcon = ({ color, focused }: TabIconProps) => <Icon name="activity" size={focused ? 24 : 22} color={color} />;
const dietIcon = ({ color, focused }: TabIconProps) => (
  <MaterialCommunityIcon name="silverware-fork-knife" size={focused ? 24 : 22} color={color} />
);
const progressIcon = ({ color, focused }: TabIconProps) => <Icon name="bar-chart-2" size={focused ? 24 : 22} color={color} />;
const profileIcon = ({ color, focused }: TabIconProps) => <Icon name="user" size={focused ? 24 : 22} color={color} />;

function ContextualActionButton({ accessibilityState, onPress }: BottomTabBarButtonProps) {
  const focused = Boolean(accessibilityState?.selected);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.actionShell} accessibilityRole="button" accessibilityLabel="Accountability">
      <View style={[styles.actionButton, focused && styles.actionButtonFocused]}>
        <MaterialCommunityIcon
          name={focused ? 'account-check' : 'account-check-outline'}
          size={28}
          color={colors.onPrimary}
        />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Accountability</Text>
    </TouchableOpacity>
  );
}

function renderContextualActionButton(props: BottomTabBarButtonProps) {
  return <ContextualActionButton {...props} />;
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: appTabBarStyle,
        tabBarItemStyle: { borderRadius: radius.md, minHeight: 52 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Workouts"
        component={WorkoutsNavigator}
        options={({ route }) => {
          const focusedRoute = getFocusedRouteNameFromRoute(route);
          const hideTabBar = focusedRoute === 'WorkoutSummary' || focusedRoute === 'WorkoutDetail' || focusedRoute === 'WorkoutVideo' || focusedRoute === 'PlanRefresh';
          return {
            title: 'Workout',
            tabBarIcon: workoutIcon,
            tabBarStyle: hideTabBar ? hiddenTabBarStyle : appTabBarStyle,
          };
        }}
      />
      <Tab.Screen name="Diet" component={DietScreen} options={{ tabBarIcon: dietIcon }} />
      <Tab.Screen
        name="Action"
        component={ActionHubScreen}
        options={{
          title: '',
          tabBarButton: renderContextualActionButton,
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressNavigator}
        options={({ route }) => ({
          tabBarIcon: progressIcon,
          tabBarStyle: ['ProgressReport', 'TrophyDetails'].includes(getFocusedRouteNameFromRoute(route) || '') ? hiddenTabBarStyle : appTabBarStyle,
        })}
      />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ tabBarIcon: profileIcon }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  actionShell: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryAction,
    borderWidth: 3,
    borderColor: colors.panel,
    ...shadows.md,
  },
  actionButtonFocused: {
    backgroundColor: colors.primaryAction,
    borderColor: colors.goldMuted,
  },
  actionLabel: {
    ...typography.caption,
    maxWidth: 68,
    marginTop: 3,
    color: colors.ink,
    fontWeight: '700',
    textAlign: 'center',
  },
});
