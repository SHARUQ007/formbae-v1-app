import { normalizeDietReportForDisplay } from './dietReportContract';

describe('native diet report boundary', () => {
  it.each([null, undefined, 42, 'report', [], { stats: [], nextWeek: false, score: '90' }])('accepts malformed root data without fabricating measurements: %p', raw => {
    const report = normalizeDietReportForDisplay(raw);
    expect(report.stats).toBeDefined();
    expect(report.stats.describedDaysLogged).toBeUndefined();
    expect(report.score?.overall).toBeUndefined();
  });

  it('accepts only bounded typed content and strips remote presentation instructions', () => {
    const report = normalizeDietReportForDisplay({
      sectionOrder: ['ads'], styles: { height: 2000 }, imageUrl: 'https://example.test/image.jpg',
      priorityInsights: Array(50).fill({ title: 'Familiar food', observation: { text: 'invalid child' }, evidence: 'invalid list' }),
      nextWeek: { actionPlan: [{ title: ['bad'], steps: ['Keep the qualifier: do not use peanuts.'], imageUrl: 'https://example.test/food.jpg' }] },
      stats: { describedDaysLogged: NaN, describedMealMoments: Infinity },
    });
    expect(report).not.toHaveProperty('styles');
    expect(report).not.toHaveProperty('imageUrl');
    expect(report).not.toHaveProperty('sectionOrder');
    expect(report.priorityInsights).toHaveLength(3);
    expect(report.priorityInsights?.[0].observation).toBe('');
    expect(report.priorityInsights?.[0].evidence).toEqual([]);
    expect(report.nextWeek?.actionPlan?.[0].steps).toEqual(['Keep the qualifier: do not use peanuts.']);
    expect(report.nextWeek?.actionPlan?.[0]).not.toHaveProperty('imageUrl');
    expect(report.stats.describedDaysLogged).toBeUndefined();
    expect(report.stats.describedMealMoments).toBeUndefined();
  });

  it('preserves saved question positions and bounded nonrecursive score history', () => {
    const report = normalizeDietReportForDisplay({
      questionsForNextWeek: [null, 'Which breakfast is convenient?'],
      questionResponses: [{ questionIndex: 1, question: 'Which breakfast is convenient?', answer: 'Oats' }],
      previousReports: [{ generatedAt: '2026-08-01', score: { overall: 0 }, previousReports: [{ score: { overall: 100 } }] }],
    });
    expect(report.questionsForNextWeek).toEqual(['', 'Which breakfast is convenient?']);
    expect(report.questionResponses?.[0].questionIndex).toBe(1);
    expect(report.previousReports?.[0].score?.overall).toBe(0);
    expect(report.previousReports?.[0]).not.toHaveProperty('previousReports');
  });
});
