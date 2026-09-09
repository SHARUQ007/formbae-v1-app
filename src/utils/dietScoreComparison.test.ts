import type { DietCoachFeedback } from '../services/dietDiaryService';
import { dietScoreComparison } from './dietScoreComparison';

const report = (overall: number, generatedAt: string, extra: Partial<DietCoachFeedback> = {}): DietCoachFeedback => ({
  schemaVersion: 17, generatedAt, weekStartDate: '2026-09-02', weekEndDate: '2026-09-08',
  title: '', summary: '', nextFocus: '', highlights: [],
  stats: { loggedItems: 0, daysLogged: 0, memoryEntries: 0, photoEntries: 0, mealCounts: {}, recentFoods: [] },
  score: { overall, label: '', components: [{ key: 'foodVariety', label: 'Variety', score: 10, maxScore: 20, insight: '' }] },
  ...extra,
});
const current = report(40, '2026-09-09T12:00:00Z');
const prior = report(35, '2026-09-09T10:00:00Z');

it('compares same-period revisions while excluding the current snapshot and sorting history', () => {
  expect(dietScoreComparison(current, [report(30, '2026-09-09T08:00:00Z'), current, prior])).toEqual({
    previous: 35, change: 5, note: 'Same reporting period',
  });
});

it('preserves decreases and zero changes, including a previous score of zero', () => {
  expect(dietScoreComparison(current, [report(48, prior.generatedAt)])).toMatchObject({ previous: 48, change: -8 });
  expect(dietScoreComparison(current, [report(40, prior.generatedAt)])).toMatchObject({ previous: 40, change: 0 });
  expect(dietScoreComparison(current, [report(0, prior.generatedAt)])).toMatchObject({ previous: 0, change: 40 });
});

it('uses the preceding snapshot for an archived report, never a newer score', () => {
  expect(dietScoreComparison(prior, [current, prior, report(32, '2026-09-08T10:00:00Z')])).toMatchObject({ previous: 32, change: 3 });
});

it('distinguishes non-overlapping weeks from overlapping windows', () => {
  expect(dietScoreComparison(current, [report(35, prior.generatedAt, { weekStartDate: '2026-08-26', weekEndDate: '2026-09-01' })])).toMatchObject({ note: '' });
  expect(dietScoreComparison(current, [report(35, prior.generatedAt, { weekStartDate: '2026-08-28', weekEndDate: '2026-09-03' })])).toMatchObject({ note: 'Reporting periods overlap' });
});

it('does not compare different scoring methods, unavailable scores or invalid numbers', () => {
  expect(dietScoreComparison(current, [{ ...prior, schemaVersion: 16 }])).toHaveProperty('unavailable');
  expect(dietScoreComparison(current, [{ ...prior, score: { ...prior.score!, components: [] } }])).toHaveProperty('unavailable');
  expect(dietScoreComparison(current, [{ ...prior, score: { ...prior.score!, availability: 'insufficientEvidence' } }])).toHaveProperty('unavailable');
  expect(dietScoreComparison(current, [report(NaN, prior.generatedAt)])).toHaveProperty('unavailable');
});

it('uses a valid server trend when archive data is absent and explains missing baselines', () => {
  expect(dietScoreComparison({ ...current, score: { ...current.score!, trend: 4 } })).toEqual({ previous: 36, change: 4, note: '' });
  expect(dietScoreComparison({ ...current, score: { ...current.score!, trend: 200 } })).toHaveProperty('unavailable');
  expect(dietScoreComparison(current, [current])).toEqual({ unavailable: 'No previous score to compare yet.' });
});
