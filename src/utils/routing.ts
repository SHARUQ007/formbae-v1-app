import type { RecommendedNextScreen } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

export function resolveRootRoute(screen: RecommendedNextScreen): keyof RootStackParamList {
  switch (screen) {
    case 'home':
      return 'Main';
    case 'payment_sync':
    case 'paid_welcome':
    case 'plan_preparing':
    case 'finding_trainer':
      return 'PaidTransition';
    case 'questionnaire':
    case 'analysis_report':
    case 'payment':
    case 'trainer_match':
      return 'Onboarding';
    case 'welcome':
    default:
      return 'Auth';
  }
}

export function resolveOnboardingInitialRoute(screen: RecommendedNextScreen): keyof import('../navigation/types').OnboardingStackParamList {
  switch (screen) {
    case 'analysis_report':
      return 'AnalysisReport';
    case 'payment':
      return 'PaymentRequired';
    case 'trainer_match':
      return 'TrainerMatch';
    case 'questionnaire':
    default:
      return 'Questionnaire';
  }
}

export function resolvePaidInitialRoute(screen: RecommendedNextScreen): keyof import('../navigation/types').PaidStackParamList {
  switch (screen) {
    case 'payment_sync':
      return 'PaymentSync';
    case 'plan_preparing':
      return 'PlanPreparing';
    case 'finding_trainer':
      return 'FindingTrainer';
    case 'paid_welcome':
    default:
      return 'PaidWelcome';
  }
}
