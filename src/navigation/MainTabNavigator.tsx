import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import type { MainTabParamList } from './types';
import { appTabBarStyle, hiddenTabBarStyle } from './tabBarStyle';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Resolve tab modules on demand. React Navigation caches each component
// after its first visit.
const getDietScreen = () => require('../screens/main/DietScreen').DietScreen;
const getActionHubScreen = () => require('../screens/main/ActionHubScreen').ActionHubScreen;
const getProgressNavigator = () => require('./ProgressNavigator').ProgressNavigator;
const getProfileNavigator = () => require('./ProfileNavigator').ProfileNavigator;

type TabIconProps = { color: string; focused: boolean };

const workoutIcon = ({ color, focused }: TabIconProps) => <Icon name="activity" size={focused ? 24 : 22} color={color} />;
const dietIcon = ({ color, focused }: TabIconProps) => (
  <MaterialCommunityIcon name="silverware-fork-knife" size={focused ? 24 : 22} color={color} />
);
const progressIcon = ({ color, focused }: TabIconProps) => <Icon name="bar-chart-2" size={focused ? 24 : 22} color={color} />;
const profileIcon = ({ color, focused }: TabIconProps) => <Icon name="user" size={focused ? 24 : 22} color={color} />;

function ContextualActionButton(props: BottomTabBarButtonProps) {
  // React Navigation v7 exposes the selected state to custom tab buttons via
  // aria-selected (not accessibilityState.selected).
  const focused = Boolean(props['aria-selected']);
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={props.onPress}
      onLongPress={props.onLongPress || undefined}
      style={[props.style, styles.actionShell]}
      accessibilityRole="button"
      accessibilityLabel="Accountability"
      accessibilityState={{ selected: focused }}
    >
      <View style={styles.actionButtonWrap}>
        <View style={styles.actionButton}>
          <MaterialCommunityIcon
            name="heart-outline"
            size={27}
            color={colors.onPrimary}
          />
        </View>
      </View>
      <Text style={styles.actionLabel} numberOfLines={1} allowFontScaling={false}>Accountability</Text>
      <View style={[styles.actionIndicator, focused && styles.actionIndicatorFocused]} />
    </TouchableOpacity>
  );
}

function renderContextualActionButton(props: BottomTabBarButtonProps) {
  return <ContextualActionButton {...props} />;
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Action"
      // Keep visited native views attached across fast switches. Lazy mounting
      // still defers each tab until its first visit and preserves its state.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: true,
        // An interrupted fade can leave the selected scene transparent.
        animation: 'none',
        freezeOnBlur: false,
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
      <Tab.Screen name="Diet" getComponent={getDietScreen} options={{ tabBarIcon: dietIcon }} />
      <Tab.Screen
        name="Action"
        getComponent={getActionHubScreen}
        options={{
          title: '',
          tabBarButton: renderContextualActionButton,
          tabBarItemStyle: styles.actionTabItem,
        }}
      />
      <Tab.Screen
        name="Progress"
        getComponent={getProgressNavigator}
        options={({ route }) => ({
          tabBarIcon: progressIcon,
          tabBarStyle: ['ProgressReport', 'ProgressReportHistory', 'TrophyDetails'].includes(getFocusedRouteNameFromRoute(route) || '') ? hiddenTabBarStyle : appTabBarStyle,
        })}
      />
      <Tab.Screen
        name="Profile"
        getComponent={getProfileNavigator}
        options={({ route }) => ({
          tabBarIcon: profileIcon,
          tabBarStyle: getFocusedRouteNameFromRoute(route) === 'EditProfile' ? hiddenTabBarStyle : appTabBarStyle,
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  actionTabItem: {
    flex: 1.55,
    minHeight: 52,
    borderRadius: radius.md,
    overflow: 'visible',
  },
  actionShell: {
    width: '100%',
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
  actionButtonWrap: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionLabel: {
    width: 92,
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: colors.inkMuted,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: false,
  },
  actionIndicator: {
    width: 14,
    height: 2,
    marginTop: 3,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  actionIndicatorFocused: { backgroundColor: colors.goldRich },
});
