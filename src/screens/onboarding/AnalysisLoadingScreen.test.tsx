import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AnalysisLoadingScreen, reportLoadingDetails, REPORT_LOADING_MS } from './AnalysisLoadingScreen';
import { generateAnalysis } from '../../services/questionnaireService';

jest.mock('../../services/questionnaireService', () => ({ generateAnalysis: jest.fn() }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const navigation = { replace: jest.fn() };
const route = {
  key: 'analysis-loading',
  name: 'AnalysisLoading' as const,
  params: { answers: { goal_feeling: 'stronger', p_gender: 'male' } },
};

describe('report loading experience', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (generateAnalysis as jest.Mock).mockResolvedValue({ ok: true, report: {} });
  });

  afterEach(() => {
    if (renderer) act(() => renderer.unmount());
    jest.useRealTimers();
  });

  it('matches the web report copy and keeps the result visible for the full build interval', async () => {
    await act(async () => {
      renderer = create(<AnalysisLoadingScreen navigation={navigation as never} route={route} />);
    });

    const copy = JSON.stringify(renderer.toJSON());
    expect(copy).toContain('PREPARING YOUR PRELIMINARY REPORT');
    expect(copy).toContain('Matching your baseline');
    expect(copy).toContain('Build strength');
    expect(generateAnalysis).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(REPORT_LOADING_MS - 1); });
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(navigation.replace).toHaveBeenCalledWith('AnalysisReport');
  });

  it('turns raw funnel values into readable loading details', () => {
    expect(reportLoadingDetails({ goal: 'lose_weight', root_cause: 'time' })).toEqual([
      { label: 'Goal', value: 'Lose weight' },
      { label: 'Blocker', value: 'Locked' },
      { label: 'Report', value: 'Building' },
    ]);
  });
});
