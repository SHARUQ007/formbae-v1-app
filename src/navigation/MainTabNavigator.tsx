import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import { DietScreen } from '../screens/main/DietScreen';
import { ActionHubScreen } from '../screens/main/ActionHubScreen';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import { ProfileNavigator } from './ProfileNavigator';
import type { MainTabParamList } from './types';
import { resolveContextualSnapshot, type ContextualTarget } from '../utils/contextualAction';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IdleCallbackHandle = ReturnType<typeof setTimeout> | number;
type IdleGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdleTask(callback: () => void, timeout = 800): IdleCallbackHandle {
  const requestIdle = (globalThis as IdleGlobal).requestIdleCallback;
  if (typeof requestIdle === 'function') {
    return requestIdle(callback, { timeout });
  }
  return setTimeout(callback, timeout);
}

function cancelIdleTask(handle: IdleCallbackHandle) {
  const cancelIdle = (globalThis as IdleGlobal).cancelIdleCallback;
  if (typeof cancelIdle === 'function' && typeof handle === 'number') {
    cancelIdle(handle);
    return;
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

type TabIconProps = { color: string; focused: boolean };

const workoutIcon = ({ color, focused }: TabIconProps) => <Icon name="activity" size={focused ? 24 : 22} color={color} />;
const dietIcon = ({ color, focused }: TabIconProps) => (
  <MaterialCommunityIcon name="silverware-fork-knife" size={focused ? 24 : 22} color={color} />
);
const progressIcon = ({ color, focused }: TabIconProps) => <Icon name="bar-chart-2" size={focused ? 24 : 22} color={color} />;
const profileIcon = ({ color, focused }: TabIconProps) => <Icon name="user" size={focused ? 24 : 22} color={color} />;

const premiumTabBarStyle = {
  height: 70,
  marginHorizontal: 16,
  marginBottom: 12,
  borderRadius: 26,
  borderTopWidth: 0,
  borderColor: colors.border,
  borderWidth: 1,
  backgroundColor: colors.white,
  paddingTop: 7,
  paddingBottom: 8,
  ...shadows.md,
};

function ContextualActionButton({ accessibilityState, onPress }: BottomTabBarButtonProps) {
  const [target, setTarget] = useState<ContextualTarget>({
    kind: 'workout',
    label: 'Today',
    detail: 'Workout',
    icon: 'home',
  });

  const refreshTarget = useCallback(async () => {
    const snapshot = await resolveContextualSnapshot();
    setTarget(snapshot.target);
  }, []);

  useEffect(() => {
    const idleTask = scheduleIdleTask(refreshTarget, 800);
    const timer = setInterval(refreshTarget, 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshTarget();
    });
    return () => {
      cancelIdleTask(idleTask);
      clearInterval(timer);
      sub.remove();
    };
  }, [refreshTarget]);

  const focused = Boolean(accessibilityState?.selected);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.actionShell} accessibilityRole="button" accessibilityLabel={`Today hub: ${target.detail}`}>
      <View style={[styles.actionButton, focused && styles.actionButtonFocused]}>
        <Icon name={target.icon} size={23} color={colors.white} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{target.label}</Text>
      <Text style={styles.actionDetail} numberOfLines={1}>{target.detail}</Text>
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
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: premiumTabBarStyle,
        tabBarItemStyle: { borderRadius: 22 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
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
            tabBarStyle: hideTabBar ? { display: 'none' } : premiumTabBarStyle,
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
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarIcon: progressIcon }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ tabBarIcon: profileIcon }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  actionShell: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.white,
    ...shadows.accent,
  },
  actionButtonFocused: {
    backgroundColor: colors.black,
  },
  actionLabel: {
    ...typography.caption,
    maxWidth: 74,
    marginTop: 3,
    color: colors.accentDark,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionDetail: {
    fontSize: 9,
    lineHeight: 11,
    maxWidth: 74,
    color: colors.inkSubtle,
    fontWeight: '700',
    textAlign: 'center',
  },
});
