import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WorkoutsNavigator } from './WorkoutsNavigator';
import { DietScreen } from '../screens/main/DietScreen';
import { ProgressScreen } from '../screens/main/ProgressScreen';
import { ProfileNavigator } from './ProfileNavigator';
import type { MainTabParamList } from './types';
import { loadWorkoutPlanCached } from '../services/preloadService';
import { loadDietDiaryEntries, type MealType } from '../store/dietDiaryStore';
import type { PlanDay } from '../types/api';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { spacing } from '../theme/spacing';
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
  <MaterialCommunityIcon name="bowl-mix-outline" size={focused ? 24 : 22} color={color} />
);
const progressIcon = ({ color, focused }: TabIconProps) => <Icon name="bar-chart-2" size={focused ? 24 : 22} color={color} />;
const profileIcon = ({ color, focused }: TabIconProps) => <Icon name="user" size={focused ? 24 : 22} color={color} />;

type ContextualTarget =
  | { kind: 'diet'; label: string; detail: string; icon: string; mealType: MealType }
  | { kind: 'workout'; label: string; detail: string; icon: string; day?: PlanDay }
  | { kind: 'refresh'; label: string; detail: string; icon: string }
  | { kind: 'progress'; label: string; detail: string; icon: string };

const premiumTabBarStyle = {
  height: 74,
  marginHorizontal: 14,
  marginBottom: 10,
  borderRadius: 28,
  borderTopWidth: 0,
  borderColor: colors.border,
  borderWidth: 1,
  backgroundColor: colors.white,
  paddingTop: 8,
  paddingBottom: 10,
  ...shadows.lg,
};

function ActionPlaceholder() {
  return <View />;
}

function currentMealType(date = new Date()): MealType {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 18 && hour < 23) return 'Dinner';
  return 'Snack';
}

function isMealWindow(date = new Date()) {
  const hour = date.getHours();
  return (hour >= 5 && hour < 16) || (hour >= 18 && hour < 23);
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

function workoutTitle(day?: PlanDay) {
  const focus = String(day?.focus || '').trim();
  return focus || "Today's workout";
}

async function resolveContextualTarget(): Promise<ContextualTarget> {
  try {
    const [workoutData, dietEntries] = await Promise.all([
      loadWorkoutPlanCached().catch(() => null),
      loadDietDiaryEntries().catch(() => []),
    ]);
    const mealType = currentMealType();
    const hasCurrentMealLog = dietEntries.some((entry) => isToday(entry.createdAt) && entry.mealType === mealType);
    if (isMealWindow() && !hasCurrentMealLog) {
      return {
        kind: 'diet',
        label: mealType,
        detail: 'Log meal',
        icon: 'camera',
        mealType,
      };
    }

    const plan = workoutData?.plan || workoutData?.today?.plan;
    const days = plan?.days || [];
    const nextDay = days.find((day) => !day.completed) || days[0];
    if (nextDay?.planDayId && !nextDay.completed) {
      return {
        kind: 'workout',
        label: 'Today',
        detail: 'Workout',
        icon: 'activity',
        day: nextDay,
      };
    }

    if (workoutData?.aiPlanRefresh?.due) {
      return {
        kind: 'refresh',
        label: 'Ava',
        detail: 'Next plan',
        icon: 'refresh-cw',
      };
    }

    return {
      kind: 'progress',
      label: 'Check',
      detail: 'Progress',
      icon: 'smile',
    };
  } catch {
    return {
      kind: 'workout',
      label: 'Today',
      detail: 'Workout',
      icon: 'home',
    };
  }
}

function ContextualActionButton({ accessibilityState }: BottomTabBarButtonProps) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [target, setTarget] = useState<ContextualTarget>({
    kind: 'workout',
    label: 'Today',
    detail: 'Workout',
    icon: 'home',
  });

  const refreshTarget = useCallback(async () => {
    setTarget(await resolveContextualTarget());
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

  const onPress = async () => {
    const nextTarget = await resolveContextualTarget();
    setTarget(nextTarget);
    if (nextTarget.kind === 'diet') {
      navigation.navigate('Diet', { action: 'camera', requestId: Date.now(), mealType: nextTarget.mealType });
    } else if (nextTarget.kind === 'workout') {
      if (nextTarget.day?.planDayId) {
        navigation.navigate('Workouts', {
          screen: 'WorkoutDetail',
          params: { planDayId: nextTarget.day.planDayId, title: workoutTitle(nextTarget.day), mode: 'standard' },
        });
      } else {
        navigation.navigate('Workouts', { screen: 'WorkoutList' });
      }
    } else if (nextTarget.kind === 'refresh') {
      navigation.navigate('Workouts', { screen: 'PlanRefresh' });
    } else {
      navigation.navigate('Progress');
    }
  };

  const focused = Boolean(accessibilityState?.selected);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.actionShell} accessibilityRole="button" accessibilityLabel={`${target.detail}: ${target.label}`}>
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
        component={ActionPlaceholder}
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
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
  },
  actionButton: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.white,
    ...shadows.accent,
  },
  actionButtonFocused: {
    backgroundColor: colors.accentDarker,
  },
  actionLabel: {
    ...typography.caption,
    maxWidth: 74,
    marginTop: spacing.xs,
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
