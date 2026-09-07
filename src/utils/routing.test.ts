import {
  resolveOnboardingInitialRoute,
  resolvePaidInitialRoute,
  resolveRootRoute,
  shouldReconcileRootRoute,
} from './routing';

describe('root routing', () => {
  it('maps every setup phase to a deterministic root and nested screen', () => {
    expect(resolveRootRoute('questionnaire')).toBe('Onboarding');
    expect(resolveOnboardingInitialRoute('analysis_report')).toBe('AnalysisReport');
    expect(resolveRootRoute('plan_preparing')).toBe('PaidTransition');
    expect(resolvePaidInitialRoute('plan_preparing')).toBe('PlanPreparing');
    expect(resolveRootRoute('home')).toBe('Main');
    expect(resolveRootRoute('renewal')).toBe('Renewal');
  });

  it('leaves splash, auth, and deliberate renewal routes alone', () => {
    expect(shouldReconcileRootRoute('Splash', 'Main')).toBe(false);
    expect(shouldReconcileRootRoute('Auth', 'Main')).toBe(false);
    expect(shouldReconcileRootRoute('Renewal', 'Main')).toBe(false);
  });

  it('repairs stale setup and main routes after status refreshes', () => {
    expect(shouldReconcileRootRoute('Onboarding', 'Main')).toBe(true);
    expect(shouldReconcileRootRoute('PaidTransition', 'Main')).toBe(true);
    expect(shouldReconcileRootRoute('Main', 'Renewal')).toBe(true);
    expect(shouldReconcileRootRoute('Main', 'PaidTransition')).toBe(true);
    expect(shouldReconcileRootRoute('Main', 'Main')).toBe(false);
  });
});
