import { resolvePlanBuildPresentation } from './WorkoutsScreen';

describe('resolvePlanBuildPresentation', () => {
  it.each(['requested', 'building'] as const)('suppresses the check-in while a %s build is active', (buildStatus) => {
    expect(resolvePlanBuildPresentation({
      due: true,
      buildStatus,
      hasPendingBuild: false,
      buildId: 'plan-one',
      dismissedBuildId: null,
    })).toEqual({
      building: true,
      takeoverVisible: true,
      checkInPromptVisible: false,
    });
  });

  it('uses the local marker before the server build state arrives', () => {
    expect(resolvePlanBuildPresentation({
      due: true,
      hasPendingBuild: true,
      buildId: 'plan-one',
      dismissedBuildId: null,
    }).checkInPromptVisible).toBe(false);
  });

  it('keeps a dismissed build in the dashboard without reopening its takeover', () => {
    const presentation = resolvePlanBuildPresentation({
      due: false,
      buildStatus: 'building',
      hasPendingBuild: true,
      buildId: 'plan-one',
      dismissedBuildId: 'plan-one',
    });

    expect(presentation.building).toBe(true);
    expect(presentation.takeoverVisible).toBe(false);
  });

  it('keeps failed builds eligible for retry', () => {
    expect(resolvePlanBuildPresentation({
      due: true,
      buildStatus: 'failed',
      hasPendingBuild: false,
      buildId: 'plan-one',
      dismissedBuildId: null,
    }).checkInPromptVisible).toBe(true);
  });
});
