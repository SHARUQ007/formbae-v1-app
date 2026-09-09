import type { DietCoachFeedback } from '../services/dietDiaryService';

type Comparison = { previous: number; change: number; note: string } | { unavailable: string };

function scoreOf(report: DietCoachFeedback): number | null {
  const score = report.score;
  return score && (!score.availability || score.availability === 'available')
    && typeof score.overall === 'number' && Number.isFinite(score.overall) && score.overall >= 0 && score.overall <= 100
    ? Math.round(score.overall) : null;
}

function criteria(report: DietCoachFeedback) {
  return (Array.isArray(report.score?.components) ? report.score.components : [])
    .map(item => `${item.key}:${item.maxScore}`).sort().join('|');
}

export function dietScoreComparison(report: DietCoachFeedback, history = report.previousReports): Comparison {
  const current = scoreOf(report);
  if (current === null) return { unavailable: 'A comparison needs an assessed score.' };
  const generated = Date.parse(report.generatedAt);
  // History can include the current snapshot and can arrive out of order.
  // An archived report must never compare against a newer report.
  const previousReport = (Array.isArray(history) ? history : [])
    .filter(item => item && Number.isFinite(Date.parse(item.generatedAt)) && Date.parse(item.generatedAt) < generated)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0];
  if (previousReport) {
    const previous = scoreOf(previousReport);
    if (previous === null) return { unavailable: 'The previous report has no assessed score.' };
    if (!report.schemaVersion || report.schemaVersion !== previousReport.schemaVersion || criteria(report) !== criteria(previousReport)) {
      return { unavailable: 'The scoring method changed; this score starts a new baseline.' };
    }
    const samePeriod = report.weekStartDate === previousReport.weekStartDate && report.weekEndDate === previousReport.weekEndDate;
    const overlaps = previousReport.weekEndDate && previousReport.weekEndDate >= report.weekStartDate;
    return {
      previous, change: current - previous,
      note: samePeriod ? 'Same reporting period' : overlaps ? 'Reporting periods overlap' : '',
    };
  }
  // A server-computed trend remains usable when the matching archive has
  // fallen outside the history window. Do not manufacture a zero trend.
  const trend = report.score?.trend;
  if (typeof trend === 'number' && Number.isFinite(trend)) {
    const previous = Math.round(current - trend);
    if (previous >= 0 && previous <= 100) return { previous, change: current - previous, note: '' };
  }
  return { unavailable: 'No previous score to compare yet.' };
}
