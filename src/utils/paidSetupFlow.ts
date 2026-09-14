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
 */
export function advancePaidSetup(navigation: PaidNavigation, status: UserStatus | undefined) {
  const next = status ? nextPaidSetupStep(status) : 'PaidWelcome';
  if (next === 'Main') {
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
    return;
  }
  if (next === 'PlanPreparing') {
    navigation.replace('PlanPreparing', { autoStart: true });
    return;
  }
  navigation.replace(next);
}
