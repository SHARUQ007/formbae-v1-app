jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => (() => void) | undefined) => require('react').useEffect(effect, [effect]) }));
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ProgressSummary, WeeklyProgressReview } from '../../types/api';
import { weeklyReadingBlocks } from '../../utils/weeklyReportPresentation';
import { WeeklyReportStory } from '../../components/WeeklyReportStory';
import { ProgressScreen } from './ProgressScreen';

let mockProgress: ProgressSummary;
let mockUserId = 'owner';
const mockRefresh = jest.fn().mockResolvedValue(undefined);
let mockLoading = false;
let mockRefreshing = false;
let mockError = '';

jest.mock('@react-navigation/bottom-tabs', () => ({ BottomTabBarHeightContext: require('react').createContext(0) }));
jest.mock('../../hooks/useProfileBodyGender', () => ({ useProfileBodyGender: () => 'neutral' }));
jest.mock('../../hooks/useAsync', () => ({ useAsync: () => ({ data: { progress: mockProgress }, loading: mockLoading, error: mockError, reload: jest.fn(), refresh: mockRefresh, refreshing: mockRefreshing, setData: jest.fn() }) }));
jest.mock('../../services/preloadService', () => ({ loadProgressBundleCached: jest.fn(), peekProgressBundleCached: jest.fn() }));
jest.mock('../../services/trophyRealtime', () => ({ subscribeToTrophySummary: () => () => {} }));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ user: { userId: mockUserId }, status: { userId: mockUserId } }) }));

function report(): WeeklyProgressReview {
  const stats = { workoutsCompleted: 3, workoutsPlanned: 4, standardWorkoutsCompleted: 2, quickWorkoutsCompleted: 1, adherencePct: 50, currentStreak: 2, mealsLogged: 8, dietDaysLogged: 4, describedDaysLogged: 3, describedEntries: 6, workoutFeedbackCount: 2, ratedSessionCount: 2, checkInCount: 1, bodyLogCount: 1 };
  return {
    reportKind: 'weekly', generationMethod: 'ai', generatedForUserId: 'owner', status: 'ready', weekStartDate: '2026-08-24', generatedAt: '2026-08-31T08:00:00Z', nextInDays: 5,
    period: { start: '2026-08-24', end: '2026-08-30' },
    headline: 'A steady training week', summary: 'A repeatable routine is taking shape around three training days.',
    weekSummary: 'Training was spread across the week, with a quick session preserving some flexibility. Written food descriptions covered fewer days than the diary itself, so the nutrition picture remains selective. The next useful step is to make breakfast easier to describe while keeping measurement conditions comparable.',
    stats: { ...stats, workoutsCompleted: 999 }, reportStats: stats,
    keyFindings: [{ id: 'training', domain: 'training', title: 'Your sessions are spaced through the week', insight: 'Sessions were saved on Monday, Wednesday and Saturday.', evidence: ['Three different training days'], whyItMatters: 'Spacing creates room to recover between sessions.' }],
    actionPlan: [
      { id: 'body', priority: 2, domain: 'body', title: 'Keep measurement conditions similar', why: 'Comparable readings are easier to interpret.', cue: 'After waking on the same weekday', steps: ['Use the same scale before breakfast.'], fallback: 'Wait for the next consistent morning.', successMeasure: 'One measurement under similar conditions' },
      { id: 'food', priority: 1, domain: 'diet', title: 'Describe your next three breakfasts', why: 'Breakfast is the least-described meal.', cue: 'After breakfast', steps: ['Name the foods and portions you remember.'], fallback: 'Add a short description later that day.', successMeasure: 'Three described breakfasts next week' },
    ],
    evidenceCoverage: { level: 'partial', observedDays: 5, periodDays: 7, summary: 'Food entries are incomplete; unlogged meals are unknown.', limitations: ['Meal portions were not consistently recorded.'] },
    metrics: {
      momentumScore: 80, momentumLabel: 'Strong', dimensions: [], weeklyDeltas: [], workoutFocus: [], feedbackSignals: [],
      dailyActivity: [{ date: '2026-08-24', label: 'Mon', workouts: 1, foodLogs: 0 }],
      bodyChanges: [{ key: 'weight', label: 'Weight', current: 80, start: 80, change: 0, unit: 'kg', sampleCount: 1, startDate: '2026-08-26', endDate: '2026-08-26' }],
    },
  };
}

function renderStory(value = report(), onAction = jest.fn()) {
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<WeeklyReportStory report={value} onAction={onAction} />); });
  return tree!;
}

function textContent(tree: ReturnType<typeof create>) {
  const text = (value: unknown): string => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return tree.root.findAllByType(Text).map(node => text(node.props.children)).join('\n');
}

describe('weekly report story', () => {
  it('keeps only the top two priorities while retaining takeaways and unresolved context', () => {
    const value = report();
    value.actionPlan!.push(
      { priority: 3, domain: 'workout', title: 'Rate session effort', why: 'Your reported experience can inform the next review.', successMeasure: 'Rate the next completed session.' },
      { priority: 4, domain: 'workout', title: 'Check your travel equipment', why: 'Available equipment affects plan options.', successMeasure: 'Save your travel equipment list.' },
    );
    value.watchouts = [{ title: 'A change in routine', reason: 'Your check-in mentions a trip without a return date.', response: 'Add your return date at the next check-in.' }];
    const onAction = jest.fn();
    const tree = renderStory(value, onAction);
    const text = textContent(tree);
    expect(text).toContain('Your takeaway');
    expect(text).toContain('PRIORITY 1');
    expect(text).toContain('PRIORITY 2');
    expect(text).not.toContain('PRIORITY 3');
    expect(text).not.toContain('Rate session effort');
    expect(text).not.toContain('Check your travel equipment');
    expect(text).toContain('To clarify next week');
    expect(text).toContain('Add your return date at the next check-in.');
    act(() => tree.root.findByProps({ accessibilityLabel: 'Log a meal: Describe your next three breakfasts' }).props.onPress());
    expect(onAction).toHaveBeenCalledWith('diet');
    act(() => tree.unmount());
  });

  it('shows a complete narrative, visible weekly record and defined scores without a composite score', () => {
    const tree = renderStory();
    const text = textContent(tree);
    expect(text).toContain('24 Aug – 30 Aug');
    expect(text).toContain('Week in review');
    for (const block of weeklyReadingBlocks(report().weekSummary!)) expect(text).toContain(block);
    expect(text).toContain('The seven-day record');
    expect(text).toContain('Your scores & criteria');
    expect(tree.root.findByProps({ testID: 'weekly-score-training-target' }).findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(50);
    expect(tree.root.findByProps({ testID: 'weekly-score-food-detail' }).findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(43);
    expect(tree.root.findByProps({ testID: 'weekly-score-session-feedback' }).findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(67);
    expect(text).not.toContain('999');
    expect(text).not.toContain('/100');
    expect(text).not.toContain('min read');
    expect(text).toContain('Three described breakfasts next week');
    expect(tree.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityLabel?.startsWith('Log a meal'))).toHaveLength(1);
  });

  it('routes priority actions to their own domain instead of the legacy focus', () => {
    const onAction = jest.fn();
    const tree = renderStory({ ...report(), nextFocusDomain: 'workout' }, onAction);
    const buttons = tree.root.findAllByType(TouchableOpacity).filter(node => /^(Log a meal|Add a measurement):/.test(node.props.accessibilityLabel || ''));
    expect(buttons.map(button => button.props.accessibilityLabel)).toEqual(['Log a meal: Describe your next three breakfasts', 'Add a measurement: Keep measurement conditions similar']);
    act(() => buttons[0].props.onPress());
    act(() => buttons[1].props.onPress());
    expect(onAction.mock.calls).toEqual([['diet'], ['body']]);
  });

  it('shows daily and measurement detail immediately and distinguishes one reading from no change', () => {
    const tree = renderStory();
    expect(textContent(tree)).toContain('One reading · trend not established');
    expect(textContent(tree)).toContain('No saved entry');
    expect(textContent(tree)).toContain('Detail unavailable');
    expect(textContent(tree)).not.toContain('How to read');
    expect(tree.root.findAllByProps({ accessibilityLabel: 'The records behind this report' })).toHaveLength(0);
    expect(textContent(tree)).not.toContain('No measured change');
  });

  it('starts with records collapsed and lets each finding expand independently', () => {
    const value = report();
    value.keyFindings![0].evidence = ['Monday: 1 standard session.', 'Wednesday: 1 quick session.', 'Saturday: 1 standard session.'];
    value.keyFindings!.push({ id: 'food', domain: 'nutrition', title: 'Diary detail', insight: 'Descriptions vary.', evidence: ['Lunch names rice.'] });
    const tree = renderStory(value);
    const toggle = () => tree.root.findByProps({ accessibilityLabel: `In your records: ${value.keyFindings![0].title}` });
    expect(toggle().props.accessibilityState.expanded).toBe(false);
    expect(textContent(tree)).not.toContain('Monday: 1 standard session.');
    act(() => toggle().props.onPress());
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    for (const source of value.keyFindings![0].evidence!) expect(textContent(tree)).toContain(source);
    expect(textContent(tree)).not.toContain('Lunch names rice.');
    act(() => toggle().props.onPress());
    expect(toggle().props.accessibilityState.expanded).toBe(false);
    expect(textContent(tree)).not.toContain('Saturday: 1 standard session.');
    act(() => tree.unmount());
  });

  it('avoids repeating an all-zero session mix while keeping the known training score visible', () => {
    const value = report();
    value.reportStats!.workoutsCompleted = 0;
    value.reportStats!.standardWorkoutsCompleted = 0;
    value.reportStats!.quickWorkoutsCompleted = 0;
    value.reportStats!.ratedSessionCount = 0;
    const tree = renderStory(value);
    expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Standard sessions')).toBe(false);
    expect(tree.root.findByProps({ testID: 'weekly-score-training-target' }).findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(0);
  });

  it('does not turn a missing target into zero percent adherence', () => {
    const value = report();
    value.reportStats!.workoutsPlanned = 0;
    const text = textContent(renderStory(value));
    expect(text).toContain('No weekly target saved');
    expect(text).not.toContain('% of standard-session target');
  });

  it('uses unique matched session ratings instead of duplicate or unmatched feedback entries', () => {
    const value = report();
    value.reportStats!.workoutFeedbackCount = 7;
    value.reportStats!.ratedSessionCount = 1;
    const tree = renderStory(value);
    expect(textContent(tree)).toContain('1 of 3 sessions rated');
    expect(tree.root.findByProps({ testID: 'weekly-score-session-feedback' }).findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(33);
    expect(textContent(tree)).not.toContain('7 of 3');
  });

  it('labels legacy feedback as entries when a unique session count was not saved', () => {
    const value = report();
    value.reportStats!.workoutFeedbackCount = 7;
    delete value.reportStats!.ratedSessionCount;
    const tree = renderStory(value);
    expect(textContent(tree)).toContain('7 feedback entries');
    expect(textContent(tree)).not.toContain('completed sessions rated');
  });

  it('uses neutral flat report panels without a yellow wash', () => {
    const tree = renderStory();
    const backgrounds = tree.root.findAllByType(View).map(node => StyleSheet.flatten(node.props.style)?.backgroundColor);
    expect(backgrounds).not.toContain('#201e19');
    expect(backgrounds).not.toContain('rgba(240,206,120,0.10)');
    expect(backgrounds).toContain('#111217');
  });

  it('renders a legacy report without borrowing rolling stats or fabricating daily activity', () => {
    const value = report();
    delete value.reportStats;
    delete value.reportKind;
    delete value.period;
    delete value.metrics;
    const tree = renderStory(value);
    expect(textContent(tree)).toContain('Snapshot unavailable');
    expect(textContent(tree)).not.toContain('999');
    expect(textContent(tree)).toContain('Daily activity detail was not saved with this report.');
  });
});

describe('weekly report access and navigation', () => {
  beforeEach(() => {
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockUserId = 'owner';
    mockLoading = false;
    mockRefreshing = false;
    mockError = '';
    mockProgress = { userId: 'owner', completed: 9, planned: 9, adherencePct: 100, currentStreak: 1, bestStreak: 3, weeklyReview: report(), bodyTrend: [] };
  });

  function renderScreen(name: 'ProgressMain' | 'ProgressReport' | 'ProgressReportHistory' = 'ProgressReport', canGoBack = true) {
    const parentNavigate = jest.fn();
    const navigation = { addListener: jest.fn((_event: string, _callback: () => void) => jest.fn()), navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => canGoBack, getParent: () => ({ navigate: parentNavigate }) };
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ProgressScreen route={{ key: 'report', name } as never} navigation={navigation as never} />); });
    return { tree: tree!, navigation, parentNavigate };
  }

  it('retries an unavailable screen when the user returns to Progress', () => {
    mockError = 'Offline';
    const { tree, navigation } = renderScreen('ProgressMain');
    expect(textContent(tree)).toContain('Progress');
    const onFocus = navigation.addListener.mock.calls.find(([event]) => event === 'focus')![1];
    act(() => onFocus());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('keeps background refreshes quiet and shows the spinner only for a manual pull', async () => {
    let finish!: () => void;
    mockRefresh.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    mockRefreshing = true;
    const { tree, navigation } = renderScreen('ProgressMain');
    const control = () => tree.root.findByType(RefreshControl);
    const onFocus = navigation.addListener.mock.calls.find(([event]) => event === 'focus')![1];
    act(() => onFocus());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(control().props.refreshing).toBe(false);
    expect(textContent(tree)).toContain('Trophies');
    await act(async () => finish());

    let pull!: Promise<void>;
    act(() => { pull = control().props.onRefresh(); });
    expect(control().props.refreshing).toBe(true);
    await act(async () => { finish(); await pull; });
    expect(control().props.refreshing).toBe(false);
    act(() => tree.unmount());
  });

  it('shows dashboard content while analysis is pending and stops polling on unmount', () => {
    jest.useFakeTimers();
    mockProgress.weeklyReview = { ...report(), generationPending: true, nextInDays: 0 };
    const { tree } = renderScreen('ProgressMain');
    expect(textContent(tree)).toContain('Progress');
    expect(textContent(tree)).toContain('Trophies');
    act(() => jest.advanceTimersByTime(15000));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType(RefreshControl).props.refreshing).toBe(false);
    act(() => tree.unmount());
    act(() => jest.advanceTimersByTime(30000));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('keeps the saved report visible while its replacement prepares', () => {
    mockProgress.weeklyReview = { ...report(), generationPending: true, nextInDays: 0, cycleState: 'preparing', cycleStats: { ...report().stats, workoutsCompleted: 0 } };
    const { tree } = renderScreen();
    expect(tree.root.findAllByType(WeeklyReportStory)).toHaveLength(1);
    expect(textContent(tree)).toContain('A steady training week');
    act(() => tree.unmount());
  });

  it('does not poll or show preparing before the weekly countdown expires', () => {
    jest.useFakeTimers();
    mockProgress.weeklyReview = { ...report(), generationPending: true, nextInDays: 5 };
    const { tree } = renderScreen('ProgressMain');
    expect(textContent(tree)).toContain('5 days to next review');
    expect(textContent(tree)).not.toContain('Next review preparing');
    act(() => jest.advanceTimersByTime(30000));
    expect(mockRefresh).not.toHaveBeenCalled();
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('keeps the previous report readable after a skipped week', () => {
    mockProgress.weeklyReview = { ...report(), generationPending: false, nextInDays: 6, cycleState: 'collecting', lastCycleStatus: 'insufficient_activity' };
    const { tree } = renderScreen('ProgressMain');
    expect(textContent(tree)).toContain('Last report saved · New week in progress');
    expect(textContent(tree)).toContain('View report');
    expect(textContent(tree)).toContain('6 days to next review');
    act(() => tree.unmount());
  });

  it.each(['progress', 'report', 'signed-out'])('keeps another account report hidden when the %s owner does not match', (mismatch) => {
    if (mismatch === 'progress') mockProgress.userId = 'another-user';
    if (mismatch === 'report') mockProgress.weeklyReview!.generatedForUserId = 'another-user';
    if (mismatch === 'signed-out') mockUserId = '';
    const { tree } = renderScreen();
    expect(tree.root.findAllByType(WeeklyReportStory)).toHaveLength(0);
    expect(textContent(tree)).not.toContain('A steady training week');
  });

  it('opens the main measurement form from a body action in the report', () => {
    const { tree, navigation } = renderScreen();
    act(() => tree.root.findByType(WeeklyReportStory).props.onAction('body'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProgressMain', { action: 'logBody', requestId: expect.any(Number) });
  });

  it('uses contextual illustrations for history evidence and saved activity', () => {
    mockProgress.weeklyReview!.history = [{ reportId: 'saved-report', generatedAt: '2026-08-31T08:00:00Z', report: report() }];
    const { tree } = renderScreen('ProgressReportHistory');
    expect(tree.root.findAllByProps({ testID: 'report-illustration-training' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'report-illustration-nutrition' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'report-illustration-evidence' }).length).toBeGreaterThan(0);
    expect(tree.root.findAll(node => String(node.type) === 'Icon' && ['zap', 'file-text', 'activity', 'calendar'].includes(node.props.name))).toHaveLength(0);
  });

  it.each([false, true])('keeps saved history visible with a pending report (generating: %s)', generating => {
    const saved = report();
    mockProgress.weeklyReview = { ...saved, status: 'pending', generationPending: generating,
      history: [{ reportId: 'saved-report', generatedAt: saved.generatedAt, report: saved }] };
    const { tree } = renderScreen('ProgressReportHistory');
    expect(textContent(tree)).toContain(saved.headline);
    expect(textContent(tree)).not.toContain('No previous reports yet');
    const entry = tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityHint === 'Shows report insight and action')!;
    act(() => entry.props.onPress());
    expect(textContent(tree)).toContain(saved.summary);
    act(() => tree.unmount());
  });

  it.each(['progress', 'report', 'signed-out'])('hides saved history when the %s owner does not match', mismatch => {
    mockProgress.weeklyReview!.history = [{ reportId: 'saved-report', generatedAt: report().generatedAt, report: report() }];
    if (mismatch === 'progress') mockProgress.userId = 'another-user';
    if (mismatch === 'report') mockProgress.weeklyReview!.generatedForUserId = 'another-user';
    if (mismatch === 'signed-out') mockUserId = '';
    const { tree } = renderScreen('ProgressReportHistory');
    expect(textContent(tree)).not.toContain('A steady training week');
    act(() => tree.unmount());
  });

  it('pins Back, title and History in one nonwrapping row with History at the right', () => {
    const { tree, navigation } = renderScreen();
    const header = tree.root.findByProps({ testID: 'weekly-report-navigation' });
    const style = StyleSheet.flatten(header.props.style);
    expect(style).toEqual(expect.objectContaining({ flexDirection: 'row', flexWrap: 'nowrap', width: '100%' }));
    const back = header.findByProps({ accessibilityLabel: 'Back to progress', accessibilityRole: 'button' });
    const history = header.findByProps({ accessibilityLabel: 'View previous reports', accessibilityRole: 'button' });
    expect(StyleSheet.flatten(back.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(history.props.style)).toEqual(expect.objectContaining({ width: 60, flexShrink: 0, minHeight: 44 }));
    expect(header.findAllByType(TouchableOpacity).map(button => button.props.accessibilityLabel)).toEqual(['Back to progress', 'View previous reports']);
    expect(tree.root.findAllByType(ScrollView).flatMap(scroll => scroll.findAllByProps({ testID: 'weekly-report-navigation' }))).toHaveLength(0);
    expect(back.findAllByType(Text)).toHaveLength(0);
    expect(StyleSheet.flatten(back.props.style).width).toBe(44);
    act(() => back.props.onPress());
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    act(() => history.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ProgressReportHistory');
  });

  it.each(['ProgressReport', 'ProgressReportHistory'] as const)('provides a working back destination on direct entry to %s', name => {
    const { tree, navigation } = renderScreen(name, false);
    const label = name === 'ProgressReportHistory' ? 'Back to weekly report' : 'Back to progress';
    act(() => tree.root.findByProps({ accessibilityLabel: label, accessibilityRole: 'button' }).props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith(name === 'ProgressReportHistory' ? 'ProgressReport' : 'ProgressMain');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it.each(['loading', 'error', 'pending'])('keeps the report back control visible during %s', state => {
    if (state === 'loading') mockLoading = true;
    if (state === 'error') mockError = 'Temporarily unavailable';
    if (state === 'pending') mockProgress.weeklyReview!.status = 'pending';
    const { tree, navigation } = renderScreen();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Back to progress', accessibilityRole: 'button' }).props.onPress());
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
