import type { WeeklyProgressReportSnapshot } from '../types/api';

type Finding = NonNullable<WeeklyProgressReportSnapshot['keyFindings']>[number];
type Action = NonNullable<WeeklyProgressReportSnapshot['actionPlan']>[number];

export const MAX_WEEKLY_FINDINGS = 6;
export const MAX_WEEKLY_ACTIONS = 2;

const FILLER = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'this', 'to', 'week', 'your']);

function textKey(value: string) {
  return value.toLowerCase().replace(/\.(?!\d)/g, ' ').replace(/[^a-z0-9.%+-]+/g, ' ').trim();
}

/** Conservative deduplication: different quantities or negation change a claim. */
export function weeklyTextsOverlap(first: string | undefined, second: string | undefined) {
  if (!first?.trim() || !second?.trim()) return false;
  const left = textKey(first);
  const right = textKey(second);
  if (left === right) return true;
  const qualifiers = (text: string) => (text.match(/\b(?:no|not|never|without|less|more|fewer)\b|[+-]?\d+(?:\.\d+)?%?/g) ?? []).join('|');
  if (qualifiers(left) !== qualifiers(right)) return false;
  if (Math.min(left.length, right.length) >= 24 && (left.includes(right) || right.includes(left))) return true;
  const tokens = (text: string) => new Set(text.split(' ').filter(word => word.length > 1 && !FILLER.has(word)));
  const a = tokens(left);
  const b = tokens(right);
  if (Math.min(a.size, b.size) < 4) return false;
  const overlap = [...a].filter(word => b.has(word)).length;
  return overlap / Math.max(a.size, b.size) >= 0.85;
}

export function uniqueWeeklyText(values: Array<string | undefined>, existing: string[] = []) {
  const seen = [...existing];
  return values.flatMap(value => {
    const text = value?.trim();
    if (!text || seen.some(previous => weeklyTextsOverlap(text, previous))) return [];
    seen.push(text);
    return [text];
  });
}

function uniqueItems<T extends { title: string }>(items: T[], core?: (item: T) => string | undefined) {
  const seen: T[] = [];
  return items.filter(item => {
    if (!item.title?.trim() || seen.some(previous => weeklyTextsOverlap(previous.title, item.title) || (core && weeklyTextsOverlap(core(previous), core(item))))) return false;
    seen.push(item);
    return true;
  });
}

export function weeklyReportDate(value: string | undefined) {
  if (!value) return '';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function weeklyActionDestination(domain: string) {
  if (domain === 'diet' || domain === 'nutrition') return { domain: 'diet' as const, label: 'Log a meal' };
  if (domain === 'body' || domain === 'measurements') return { domain: 'body' as const, label: 'Add a measurement' };
  if (domain === 'workout' || domain === 'training' || domain === 'consistency' || domain === 'recovery') {
    return { domain: 'workout' as const, label: 'Open workout plan' };
  }
  return null;
}

export function weeklyDomainLabel(domain: string) {
  if (domain === 'diet' || domain === 'nutrition') return 'Nutrition';
  if (domain === 'body' || domain === 'measurements') return 'Body measurements';
  if (domain === 'workout' || domain === 'training') return 'Training';
  return domain ? domain[0].toUpperCase() + domain.slice(1) : 'This week';
}

function shortWeeklySummary(value: string) {
  const sentences = value.trim().replace(/\s+/g, ' ').replace(/([.!?])\s+/g, '$1\n').split('\n');
  const selected: string[] = [];
  for (const sentence of sentences.slice(0, 3)) {
    if ([...selected, sentence].join(' ').split(/\s+/).length > 80) break;
    selected.push(sentence);
  }
  return selected.join(' ');
}

export function buildWeeklyReportModel(report: WeeklyProgressReportSnapshot) {
  // Older ready responses mixed rolling `stats` with a frozen report. Only an
  // explicit snapshot or the new server-owned report contract is safe to show.
  const stats = report.reportStats ?? (report.reportKind === 'weekly' ? report.stats : undefined);
  const start = weeklyReportDate(report.period?.start);
  const end = weeklyReportDate(report.period?.end);
  const periodLabel = start && end ? `${start} – ${end}` : start ? `Week of ${start}` : 'Saved weekly review';
  const headline = report.headline?.trim() || 'Your week in review';
  const summary = uniqueWeeklyText([shortWeeklySummary(report.summary || '')], [headline])[0] || '';
  const rawWeekSummary = report.weekSummary?.trim() || '';
  // Legacy reviews contained long diary recaps. Prefer their existing short
  // synthesis, shown once, instead of clipping prose in the rendered report.
  const preferredWeekSummary = rawWeekSummary.split(/\s+/).length > 80 && summary
    ? summary
    : shortWeeklySummary(rawWeekSummary);
  const weekSummary = uniqueWeeklyText([preferredWeekSummary], [headline, summary])[0] || '';
  const legacyFindings: Finding[] = (report.highlights ?? []).map(item => ({
    domain: 'progress', title: item.title, insight: item.whyItMatters, evidence: item.evidence ? [item.evidence] : [],
  }));
  if (!legacyFindings.length) {
    if (report.workoutInsight) legacyFindings.push({ domain: 'training', title: 'Your training pattern', insight: report.workoutInsight });
    if (report.nutritionInsight) legacyFindings.push({ domain: 'nutrition', title: 'Your food diary', insight: report.nutritionInsight });
  }
  const seenNarrative = [summary, weekSummary, report.evidenceCoverage?.summary || ''].filter(Boolean);
  const seenEvidence: string[] = [];
  const findings = uniqueItems(report.keyFindings?.length ? report.keyFindings : legacyFindings, item => item.insight)
    .filter(item => item.insight?.trim() || item.evidence?.some(value => value.trim()))
    .slice(0, MAX_WEEKLY_FINDINGS)
    .map(item => {
      // Original evidence keeps its place even when the narrative quotes it.
      // Three bounded excerpts preserve the full server citation set.
      const evidence = uniqueWeeklyText(item.evidence ?? [], seenEvidence).slice(0, 3);
      seenEvidence.push(...evidence);
      const observation = uniqueWeeklyText([item.insight], [...seenNarrative, item.title, ...evidence])[0] || '';
      const meaning = uniqueWeeklyText([item.whyItMatters, item.benefit], [...seenNarrative, item.title, observation, ...evidence])[0] || '';
      seenNarrative.push(item.title, observation, meaning, ...evidence);
      return { ...item, observation, evidence, meaning };
    }).filter(item => item.observation || item.meaning || item.evidence.length);
  const legacyActions: Action[] = report.nextFocusTitle ? [{
    priority: 1, domain: report.nextFocusDomain || 'workout', title: report.nextFocusTitle,
    why: report.nextFocusReason || '', steps: [],
  }] : [];
  const actions = uniqueItems([...(report.actionPlan?.length ? report.actionPlan : legacyActions)]
    .sort((left, right) => (left.priority || 99) - (right.priority || 99)), item => item.successMeasure)
    .slice(0, MAX_WEEKLY_ACTIONS)
    .map((item, index) => {
      const why = uniqueWeeklyText([item.why], [item.title, ...seenNarrative])[0] || '';
      const steps = uniqueWeeklyText(item.steps ?? [], [item.title, item.cue || '', item.successMeasure || '', ...seenNarrative]).slice(0, 3);
      const fallback = uniqueWeeklyText([item.fallback], [item.title, why, ...steps, item.successMeasure || '', ...seenNarrative])[0] || '';
      seenNarrative.push(item.title, why, ...steps, fallback, item.cue || '', item.successMeasure || '');
      return { ...item, priority: index + 1, why, steps, fallback, destination: weeklyActionDestination(item.domain) };
    });
  const questions = uniqueItems(report.watchouts ?? [], item => item.reason).slice(0, 2).map(item => {
    const reason = uniqueWeeklyText([item.reason], [item.title, ...seenNarrative])[0] || '';
    const response = uniqueWeeklyText([item.response], [item.title, reason, ...seenNarrative])[0] || '';
    seenNarrative.push(item.title, reason, response);
    return { ...item, reason, response };
  }).filter(item => item.reason || item.response);
  const limitations = uniqueWeeklyText([
    ...(report.evidenceCoverage?.limitations ?? []),
    ...(report.watchouts ?? []).map(item => item.reason || item.title),
  ]).slice(0, 3);
  return { stats, periodLabel, headline, summary: weekSummary ? summary : '', weekSummary: weekSummary || summary, findings, actions, questions, limitations };
}

export type WeeklyScoreCriterion = {
  key: string;
  title: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  calculation: string;
  meaning: string;
};

export function buildWeeklyScorecard(report: WeeklyProgressReportSnapshot): WeeklyScoreCriterion[] {
  const stats = report.reportStats ?? (report.reportKind === 'weekly' ? report.stats : undefined);
  const training = report.metrics?.trainingSummary;
  const valid = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const completed = stats?.workoutsCompleted ?? training?.completed;
  const planned = stats?.workoutsPlanned ?? training?.planned;
  const standard = stats?.standardWorkoutsCompleted ?? training?.standardSessions;
  const describedDays = stats?.describedDaysLogged;
  const rated = stats?.ratedSessionCount ?? training?.ratedSessions;
  const targetAvailable = valid(planned) && planned > 0 && valid(standard);
  const foodAvailable = valid(describedDays) && describedDays <= 7;
  const feedbackAvailable = valid(completed) && completed > 0 && valid(rated) && rated <= completed;
  return [
    {
      key: 'training-target', title: 'Training target',
      value: targetAvailable ? Math.min(100, Math.round(standard / planned * 100)) : null,
      numerator: valid(standard) ? standard : null, denominator: valid(planned) && planned > 0 ? planned : null,
      calculation: 'Standard sessions completed ÷ your weekly session target.',
      meaning: !valid(planned) || planned === 0 ? 'No weekly target saved. A completion score is not available.' : !valid(standard) ? 'Standard-session detail was not saved with this report.' : 'Quick sessions are recorded separately. This measures participation against your target, not training intensity or strength gains.',
    },
    {
      key: 'food-detail', title: 'Food diary detail',
      value: foodAvailable ? Math.round(describedDays / 7 * 100) : null,
      numerator: foodAvailable ? describedDays : null, denominator: 7,
      calculation: 'Days with at least one written food description ÷ 7 days.',
      meaning: foodAvailable ? 'Descriptions make the food review more specific. This is evidence coverage, not a diet-quality score.' : 'Described-day counts were not saved. Food-log counts alone cannot establish this score.',
    },
    {
      key: 'session-feedback', title: 'Session feedback',
      value: feedbackAvailable ? Math.round(rated / completed * 100) : null,
      numerator: valid(rated) && (!valid(completed) || rated <= completed) ? rated : null,
      denominator: valid(completed) && completed > 0 ? completed : null,
      calculation: 'Completed sessions with a matching session rating ÷ completed sessions.',
      meaning: valid(completed) && completed === 0 ? 'No completed sessions to rate in this period.' : !feedbackAvailable ? 'A unique matched-session count was not saved. Raw feedback entries cannot establish this rate.' : 'Each completed session counts once. Exercise-only feedback and unmatched ratings do not inflate this rate.',
    },
  ];
}

export type WeeklyActivityDay = { date: string; workouts: number | null; foodLogs: number | null };

export function weeklyActivityDays(report: WeeklyProgressReportSnapshot): WeeklyActivityDay[] {
  const raw = report.metrics?.dailyActivity ?? [];
  const start = report.period?.start;
  const end = report.period?.end;
  const startDate = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T12:00:00Z`) : null;
  const endDate = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(`${end}T12:00:00Z`) : null;
  const hasFullPeriod = startDate && endDate && endDate.getTime() - startDate.getTime() === 6 * 86_400_000;
  const dates = hasFullPeriod
    ? Array.from({ length: 7 }, (_, index) => new Date(startDate!.getTime() + index * 86_400_000).toISOString().slice(0, 10))
    : raw.map(item => item.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().slice(0, 7);
  return dates.map(date => {
    const day = raw.find(item => item.date === date);
    const count = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    return { date, workouts: count(day?.workouts), foodLogs: count(day?.foodLogs) };
  });
}

export function weeklyBodyComparison(metric: NonNullable<WeeklyProgressReportSnapshot['metrics']>['bodyChanges'][number]) {
  const count = metric.sampleCount;
  const comparable = typeof count === 'number' && count >= 2
    && Boolean(metric.startDate && metric.endDate && metric.startDate < metric.endDate)
    && Number.isFinite(metric.change);
  if (!comparable) return count === 1 ? 'One reading · trend not established' : 'Comparison unavailable';
  const change = Math.round(metric.change * 10) / 10;
  const delta = change === 0 ? 'No measured change' : `${change > 0 ? '+' : ''}${change} ${metric.unit}`;
  return `${delta} · ${weeklyReportDate(metric.startDate)} to ${weeklyReportDate(metric.endDate)}`;
}
