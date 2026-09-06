import type { AiPlanRefresh } from '../../types/api';
import { resolvePlanRefreshPhase } from './PlanRefreshScreen';

function refreshState(overrides: Partial<AiPlanRefresh> = {}): AiPlanRefresh {
  return {
    due: true,
    intervalDays: 14,
    planAgeDays: 22,
    planId: 'current-plan',
    trainerId: 'ava',
    trainerName: 'Ava',
    isAiTrainer: true,
    allowance: { used: 0, limit: 5, remaining: 5, allowed: true },
    ...overrides,
  };
}

describe('resolvePlanRefreshPhase', () => {
  it('opens a fresh questionnaire when a due plan still has the previous completed build', () => {
    const refresh = refreshState({
      build: {
        status: 'completed',
        planId: 'previous-plan',
        newPlanId: 'current-plan',
      },
    });

    expect(resolvePlanRefreshPhase(refresh)).toBe('form');
  });

  it('keeps active builds and newly completed builds in their dedicated flows', () => {
    expect(resolvePlanRefreshPhase(refreshState({ build: { status: 'building' } }))).toBe('building');
    expect(resolvePlanRefreshPhase(refreshState({
      due: false,
      build: { status: 'completed', newPlanId: 'new-plan' },
    }))).toBe('success');
  });
});
