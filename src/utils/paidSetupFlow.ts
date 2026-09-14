import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PaidStackParamList, RootStackParamList } from '../navigation/types';
import type { UserStatus } from '../types/api';
import { nextPaidSetupStep } from './onboarding';

type PaidNavigation = {
  replace: NativeStackNavigationProp<PaidStackParamList>['replace'];
  getParent: NativeStackNavigationProp<PaidStackParamList>['getParent'];
};

/**
 * Moves to whatever paid setup step is actually outstanding.
 *
 * Screens used to route off `recommendedNextScreen`, which settles on "paid_welcome" the
 * moment nothing is blocking — so finishing a step dropped people back on the checklist
 * they had just come from.
 *
 * Returns false when the outstanding step is the screen that just called, which means the
 * work it saved has not landed in the status yet. Replacing a screen with itself looks
 * exactly like a dead button, so the caller says so instead.
 */
export function advancePaidSetup(
  navigation: PaidNavigation,
  status: UserStatus | undefined,
  current?: keyof PaidStackParamList,
): boolean {
  const next = status ? nextPaidSetupStep(status) : 'PaidWelcome';
  if (current && next === current) return false;
  if (next === 'Main') {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
    return true;
  }
  if (next === 'PlanPreparing') {
    navigation.replace('PlanPreparing', { autoStart: true });
    return true;
  }
  navigation.replace(next);
  return true;
}
