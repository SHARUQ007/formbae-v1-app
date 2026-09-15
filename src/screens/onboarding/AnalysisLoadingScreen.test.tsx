import React from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AnalysisLoadingScreen, reportLoadingDetails, REPORT_LOADING_MS } from './AnalysisLoadingScreen';
import { AnalysisReportScreen } from './AnalysisReportScreen';
import { fetchAnalysis, generateAnalysis } from '../../services/questionnaireService';
import type { AnalysisReport } from '../../types/api';

jest.mock('../../services/questionnaireService', () => ({ generateAnalysis: jest.fn(), fetchAnalysis: jest.fn() }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const mockLogout = jest.fn();
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Alex' }, logout: mockLogout }) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const navigation = { replace: jest.fn() };
const route = {
  key: 'analysis-loading',
  name: 'AnalysisLoading' as const,
  params: { answers: { goal_feeling: 'stronger', p_gender: 'male' } },
};
const report: AnalysisReport = {
  goalSummary: 'A plan built for your strength goal.',
  startingPoint: 'Starting out', workoutDirection: 'Strength', weeklySchedule: 'Three days a week',
  locationSuitability: 'Home', trainerType: 'AI', budgetRecommendation: 'Standard',
  bmi: 23, goalWeight: 70, readinessScore: 60,
  scores: { activity: 50, consistency: 50, progression: 50, recovery: 50, nutrition: 50 },
  projectionData: [],
  recommendedTrainer: {
    name: 'Coach', gender: 'male', photoUrl: '', coachType: 'Strength', description: '',
    why: '', expertise: '', bestSuitedGoal: '', budgetFit: '', badge: '',
  },
  nextStepCta: 'Continue',
};

describe('report loading experience', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (generateAnalysis as jest.Mock).mockResolvedValue({ ok: true, report });
    (fetchAnalysis as jest.Mock).mockImplementation(() => new Promise(() => {}));
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
    expect(navigation.replace).toHaveBeenCalledWith('AnalysisReport', { report, answers: route.params.answers });
  });

  it('keeps the UI loader visible until a slow report finishes generating', async () => {
    let finish!: (value: { ok: boolean; report: AnalysisReport }) => void;
    (generateAnalysis as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await act(async () => { renderer = create(<AnalysisLoadingScreen navigation={navigation as never} route={route} />); });
    await act(async () => { jest.advanceTimersByTime(REPORT_LOADING_MS); });
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain('Matching your baseline');
    await act(async () => { finish({ ok: true, report }); });
    expect(navigation.replace).toHaveBeenCalledWith('AnalysisReport', { report, answers: route.params.answers });
  });

  it('renders the generated report immediately while its background fetch is pending', async () => {
    await act(async () => {
      renderer = create(<AnalysisReportScreen navigation={navigation as never} route={{
        key: 'report', name: 'AnalysisReport', params: { report, answers: route.params.answers },
      }} />);
    });
    const copy = JSON.stringify(renderer.toJSON());
    expect(copy).toContain('Your preliminary report is ready');
    expect(copy).not.toContain('Matching your baseline');
    expect(copy).not.toContain('Preparing your personalized report');
  });

  it('uses the same UI loader when opening a saved report directly', async () => {
    await act(async () => {
      renderer = create(<AnalysisReportScreen navigation={navigation as never} route={{
        key: 'report', name: 'AnalysisReport', params: undefined,
      }} />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('Matching your baseline');
    expect(generateAnalysis).not.toHaveBeenCalled();
  });

  it('offers logout from the report and waits for confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    try {
      await act(async () => {
        renderer = create(<AnalysisReportScreen navigation={navigation as never} route={{
          key: 'report', name: 'AnalysisReport', params: { report, answers: route.params.answers },
        }} />);
      });
      const logoutButton = renderer.root.findAllByProps({ accessibilityLabel: 'Log out' })[0];
      act(() => logoutButton.props.onPress());
      expect(mockLogout).not.toHaveBeenCalled();
      const actions = alert.mock.calls[0][2]!;
      expect(actions.find(action => action.text === 'Stay')?.style).toBe('cancel');
      await act(async () => { await actions.find(action => action.text === 'Log out')?.onPress?.(); });
      expect(mockLogout).toHaveBeenCalledTimes(1);
    } finally {
      alert.mockRestore();
    }
  });

  it('turns raw funnel values into readable loading details', () => {
    expect(reportLoadingDetails({ goal: 'lose_weight', root_cause: 'time' })).toEqual([
      { label: 'Goal', value: 'Lose weight' },
      { label: 'Blocker', value: 'Locked' },
      { label: 'Report', value: 'Building' },
    ]);
  });
});
