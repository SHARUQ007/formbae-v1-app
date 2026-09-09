import type { WeeklyProgressReportSnapshot } from '../types/api';
import { buildWeeklyReportModel, buildWeeklyScorecard, uniqueWeeklyText, weeklyActionDestination, weeklyActivityDays, weeklyBodyComparison, weeklyTextsOverlap } from './weeklyReport';

const stats = {
  workoutsCompleted: 3, workoutsPlanned: 4, adherencePct: 75, currentStreak: 1,
  mealsLogged: 9, dietDaysLogged: 4, workoutFeedbackCount: 2, checkInCount: 0, bodyLogCount: 1,
};

describe('weekly report presentation model', () => {
  it('keeps six distinct insights and the top two actions while removing repeated core points and source excerpts', () => {
    const keyFindings = ['Session spacing', 'Exercise focus', 'Reported effort', 'Diary detail', 'Measurement conditions', 'Travel plans'].map((title, index) => ({
      id: `finding-${index}`, domain: 'training', title, insight: `Distinct recorded observation ${index}.`, whyItMatters: `Practical implication ${index}.`, evidence: ['The same original source note.'],
    }));
    keyFindings.splice(1, 0, { ...keyFindings[0], id: 'duplicate', title: 'A renamed version of the first finding' });
    const actionPlan = ['Schedule training', 'Describe lunch', 'Rate effort', 'Use the same scale'].map((title, index) => ({ priority: index + 1, domain: 'workout', title, why: `Unique implementation reason ${index}.`, successMeasure: `Observable target ${index}.` }));
    actionPlan.splice(1, 0, { ...actionPlan[0], title: 'The same action renamed' });
    const model = buildWeeklyReportModel({ keyFindings, actionPlan });
    expect(model.findings).toHaveLength(6);
    expect(model.actions).toHaveLength(2);
    expect(model.findings.flatMap(item => item.evidence)).toEqual(['The same original source note.']);
    expect(model.findings.map(item => item.id)).not.toContain('duplicate');
    expect(model.actions.map(item => item.priority)).toEqual([1, 2]);
  });

  it('retains distinct follow-up questions and removes advice already owned by an action', () => {
    const model = buildWeeklyReportModel({
      actionPlan: [{ priority: 1, domain: 'body', title: 'Keep the same scale', why: '', steps: ['Record the scale used with your next measurement.'] }],
      watchouts: [
        { title: 'Different scales', reason: 'The scale used was not recorded.', response: 'Record the scale used with your next measurement.' },
        { title: 'Measurement uncertainty', reason: 'The scale used was not recorded.', response: 'Repeated question' },
        { title: 'Travel access', reason: 'Travel plans leave equipment access unclear.', response: 'Check which equipment is available at your destination.' },
      ],
    });
    expect(model.questions).toHaveLength(2);
    expect(model.questions[0].response).toBe('');
    expect(model.questions[1].response).toContain('destination');
  });

  it('uses the frozen snapshot instead of rolling current-week totals', () => {
    const model = buildWeeklyReportModel({ reportStats: stats, stats: { ...stats, workoutsCompleted: 999 }, period: { start: '2026-08-24', end: '2026-08-30' } });
    expect(model.stats?.workoutsCompleted).toBe(3);
    expect(model.periodLabel).toBe('24 Aug – 30 Aug');
  });

  it('does not invent a date window or import live totals for a legacy report', () => {
    const model = buildWeeklyReportModel({ stats: { ...stats, workoutsCompleted: 999 } });
    expect(model.stats).toBeUndefined();
    expect(model.periodLabel).toBe('Saved weekly review');
  });

  it('accepts explicitly frozen stats from the new weekly contract', () => {
    expect(buildWeeklyReportModel({ reportKind: 'weekly', stats }).stats).toEqual(stats);
  });

  it('deduplicates wording without erasing changed quantities or negation', () => {
    expect(weeklyTextsOverlap('Your food diary covered 3 days this week.', 'Food diary covered 3 days.')).toBe(true);
    expect(weeklyTextsOverlap('Food diary covered 3 days.', 'Food diary covered 5 days.')).toBe(false);
    expect(weeklyTextsOverlap('The week has 3 workouts and 5 food days.', 'The week has 5 workouts and 3 food days.')).toBe(false);
    expect(weeklyTextsOverlap('You did log all meals this week.', 'You did not log all meals this week.')).toBe(false);
    expect(uniqueWeeklyText(['Feedback covered 2 sessions.', 'Feedback covered 2 sessions.', 'Feedback covered 3 sessions.'])).toHaveLength(2);
  });

  it('shows each interpretation once and discards empty findings', () => {
    const report: WeeklyProgressReportSnapshot = {
      headline: 'Training became repeatable', summary: 'Training became repeatable',
      keyFindings: [{ domain: 'workout', title: 'A repeatable routine', insight: 'You recorded three sessions.', whyItMatters: 'A repeatable routine supports consistency.', benefit: 'A repeatable routine supports consistency.', evidence: ['Monday, Wednesday and Saturday', 'Monday, Wednesday and Saturday'] },
        { domain: 'workout', title: 'A repeatable routine', insight: 'You recorded three sessions.' },
        { domain: 'diet', title: 'No detail', insight: 'No detail' }],
    };
    const model = buildWeeklyReportModel(report);
    expect(model.summary).toBe('');
    expect(model.findings).toHaveLength(1);
    expect(model.findings[0].evidence).toEqual(['Monday, Wednesday and Saturday']);
    expect(model.findings[0].meaning).toBe('A repeatable routine supports consistency.');
  });

  it('retains all three distinct source excerpts and shows quoted observations only once', () => {
    const model = buildWeeklyReportModel({ keyFindings: [{
      id: 'finding-source-set', domain: 'training', title: 'Sessions fit different days',
      insight: 'Monday: 1 standard session.',
      whyItMatters: 'The session mix gives the next schedule a concrete starting point.',
      evidence: ['Monday: 1 standard session.', 'Wednesday: 1 quick session.', 'Saturday: 1 standard session.', 'Monday: 1 standard session.'],
    }] });
    expect(model.findings[0].evidence).toEqual(['Monday: 1 standard session.', 'Wednesday: 1 quick session.', 'Saturday: 1 standard session.']);
    expect(model.findings[0].observation).toBe('');
    expect(model.findings[0].meaning).toContain('session mix');
  });

  it('sorts distinct actions by priority and maps each to its own destination', () => {
    const model = buildWeeklyReportModel({ actionPlan: [
      { priority: 2, domain: 'body', title: 'Record a measurement', why: '' },
      { priority: 1, domain: 'nutrition', title: 'Describe breakfast', why: '', steps: ['Name the food.', 'Name the food.'], successMeasure: 'Three described breakfasts' },
      { priority: 3, domain: 'workout', title: 'Finish training', why: '' },
    ] });
    expect(model.actions.map(action => action.title)).toEqual(['Describe breakfast', 'Record a measurement']);
    expect(model.actions[0].steps).toEqual(['Name the food.']);
    expect(model.actions.map(action => action.destination?.domain)).toEqual(['diet', 'body']);
    expect(weeklyActionDestination('unknown')).toBeNull();
  });

  it('never labels one measurement as no change', () => {
    expect(weeklyBodyComparison({ key: 'weight', label: 'Weight', current: 80, start: 80, change: 0, unit: 'kg', sampleCount: 1, startDate: '2026-08-26', endDate: '2026-08-26' })).toBe('One reading · trend not established');
    expect(weeklyBodyComparison({ key: 'weight', label: 'Weight', current: 80, start: 80, change: 0, unit: 'kg' })).toBe('Comparison unavailable');
  });

  it('reports neutral measured changes only with two dated readings', () => {
    expect(weeklyBodyComparison({ key: 'weight', label: 'Weight', current: 80, start: 81, change: -1, unit: 'kg', sampleCount: 2, startDate: '2026-08-24', endDate: '2026-08-30' })).toBe('-1 kg · 24 Aug to 30 Aug');
  });

  it('keeps a whole-week summary separate from the short verdict and preserves legacy synthesis once', () => {
    const model = buildWeeklyReportModel({ headline: 'Steadier training', summary: 'The week shows a repeatable rhythm.', weekSummary: 'Your training was spaced through the week while the diary covered only a selection of meals.' });
    expect(model.summary).toBe('The week shows a repeatable rhythm.');
    expect(model.weekSummary).toBe('Your training was spaced through the week while the diary covered only a selection of meals.');
    const legacy = buildWeeklyReportModel({ summary: 'A saved synthesis of the week.' });
    expect(legacy.summary).toBe('');
    expect(legacy.weekSummary).toBe('A saved synthesis of the week.');
  });

  it('replaces a long legacy recap with the existing concise synthesis shown once', () => {
    const summary = 'The diary covers five days. Training was not recorded during this period.';
    const model = buildWeeklyReportModel({ summary, weekSummary: Array.from({ length: 20 }, () => 'This is another detailed daily account.').join(' ') });
    expect(model.summary).toBe('');
    expect(model.weekSummary).toBe(summary);
  });

  it('uses at most three complete sentences without clipping a long sentence or decimal measurement', () => {
    const model = buildWeeklyReportModel({ weekSummary: 'Two readings differed by 1.5 kg. The diary covers five days. Training entries were spread out. Feedback was also recorded.' });
    expect(model.weekSummary).toBe('Two readings differed by 1.5 kg. The diary covers five days. Training entries were spread out.');
    const overlong = buildWeeklyReportModel({ weekSummary: `${Array.from({ length: 90 }, () => 'word').join(' ')}.` });
    expect(overlong.weekSummary).toBe('');
  });

  it('calculates each transparent criterion from its own source and denominator', () => {
    const criteria = buildWeeklyScorecard({ reportStats: { ...stats, workoutsCompleted: 4, standardWorkoutsCompleted: 3, quickWorkoutsCompleted: 1, describedDaysLogged: 3, ratedSessionCount: 1 } });
    expect(criteria.map(item => [item.key, item.value, item.numerator, item.denominator])).toEqual([
      ['training-target', 75, 3, 4], ['food-detail', 43, 3, 7], ['session-feedback', 25, 1, 4],
    ]);
  });

  it('preserves unknown scores and never substitutes log counts for food descriptions or unique ratings', () => {
    const criteria = buildWeeklyScorecard({ reportStats: { ...stats, workoutsPlanned: 0 } });
    expect(criteria.every(item => item.value === null)).toBe(true);
    expect(criteria[0].meaning).toContain('No weekly target saved');
    expect(criteria[1].meaning).toContain('Food-log counts alone');
    expect(criteria[2].meaning).toContain('Raw feedback entries');
  });

  it('shows known zero coverage and handles empty rating denominators without a zero-percent penalty', () => {
    const criteria = buildWeeklyScorecard({ reportStats: { ...stats, workoutsCompleted: 0, standardWorkoutsCompleted: 0, describedDaysLogged: 0, ratedSessionCount: 0 } });
    expect(criteria[0].value).toBe(0);
    expect(criteria[1].value).toBe(0);
    expect(criteria[2].value).toBeNull();
  });

  it('fills seven report dates with unknown daily detail instead of fabricated zero counts', () => {
    const days = weeklyActivityDays({ period: { start: '2026-08-24', end: '2026-08-30' } });
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-08-24', workouts: null, foodLogs: null });
    expect(days[6].date).toBe('2026-08-30');
  });
});
