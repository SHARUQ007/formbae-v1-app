import type { DietCoachFeedback } from '../services/dietDiaryService';

// The native document owns layout, labels, artwork, links and section order.
// Only these data fields may reach it, including reports restored from cache.
type Shape = 'text' | 'number' | { [key: string]: Shape } | [Shape, number];
const texts = (limit: number): Shape => ['text', limit];
const objects = (shape: Record<string, Shape>, limit: number): Shape => [shape, limit];
const evidence = { evidence: texts(3), evidenceIds: texts(3) };
const summary = { summary: 'text' as const, supports: texts(3), gaps: texts(3) };
const action = { id: 'text', priority: 'number', title: 'text', why: 'text', cue: 'text', steps: texts(2), fallback: 'text', successMeasure: 'text', sourceInsightId: 'text', evidenceIds: texts(3) } satisfies Record<string, Shape>;
const shape: Record<string, Shape> = {
  schemaVersion: 'number', reportKind: 'text', generationMethod: 'text', status: 'text',
  weekStartDate: 'text', weekEndDate: 'text', generatedAt: 'text', title: 'text', headline: 'text', summary: 'text', weekSummary: 'text', nextFocus: 'text', highlights: texts(3),
  enrichmentScore: 'number', nextInDays: 'number', requirements: { enrichment: 'number' },
  evidenceCoverage: { level: 'text', summary: 'text', observedDays: 'number', periodDays: 'number', limitations: texts(2) },
  score: { availability: 'text', overall: 'number', label: 'text', trend: 'number', components: objects({ key: 'text', label: 'text', score: 'number', maxScore: 'number', insight: 'text' }, 6) },
  scoreHistory: objects({ weekStartDate: 'text', weekEndDate: 'text', generatedAt: 'text', overall: 'number', label: 'text' }, 52),
  wins: objects({ title: 'text', detail: 'text', evidence: 'text' }, 2),
  patterns: objects({ key: 'text', title: 'text', status: 'text', summary: 'text', ...evidence }, 3),
  priorityInsights: objects({ id: 'text', rank: 'number', title: 'text', observation: 'text', whyItMatters: 'text', benefit: 'text', riskIfUnchanged: 'text', nextStep: 'text', ...evidence }, 3),
  foodGroups: objects({ key: 'text', label: 'text', status: 'text', observedFoods: texts(6), insight: 'text' }, 7),
  mealGuidance: objects({ mealType: 'text', observedCount: 'number', status: 'text', pattern: 'text', advice: 'text' }, 4),
  mealRhythm: { summary: 'text', strongestWindow: 'text', opportunityWindow: 'text' },
  goalAlignment: summary, trainingNutrition: { summary: 'text', trainingDayAction: 'text', restDayAction: 'text' },
  facts: objects({ id: 'text', title: 'text', body: 'text', sourceLabel: 'text', sourceUrl: 'text' }, 3),
  nextWeek: {
    actionPlan: objects(action, 2), primaryFocus: 'text', whyItMatters: 'text', benefit: 'text', riskIfUnchanged: 'text', actions: texts(3),
    mealBuilder: { title: 'text', plants: 'text', protein: 'text', carbs: 'text', extras: 'text' },
    smartSwaps: objects({ from: 'text', to: 'text', why: 'text' }, 2),
    implementationPlan: { cue: 'text', action: 'text', fallback: 'text', successMeasure: 'text' }, trackingFocus: 'text',
  },
  // Preserve positions: questionIndex refers to the original list, including
  // questions the UI later filters out as unrelated to nutrition.
  questionsForNextWeek: texts(12),
  questionResponses: objects({ questionIndex: 'number', question: 'text', answer: 'text' }, 12),
  limitations: texts(2), safetyNotices: objects({ id: 'text', title: 'text', body: 'text', severity: 'text' }, 10),
  stats: {
    loggedItems: 'number', mealMoments: 'number', daysLogged: 'number', describedEntries: 'number', describedMealMoments: 'number', describedDaysLogged: 'number', memoryEntries: 'number', photoEntries: 'number', workoutsCompleted: 'number', recentFoods: texts(20),
    mealCounts: { morning: 'number', afternoon: 'number', evening: 'number', night: 'number' },
    describedMealCounts: { morning: 'number', afternoon: 'number', evening: 'number', night: 'number' },
  },
};

function read(value: unknown, field: Shape): unknown {
  if (field === 'text') return typeof value === 'string' ? value : '';
  if (field === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (Array.isArray(field)) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, field[1]).map(item => read(item, field[0])).filter(item => item !== undefined);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(field).map(([key, child]) => [key, read(record[key], child)]));
}

/** Never interprets model-provided JSX, styles, sectionOrder or image URLs. */
export function normalizeDietReportForDisplay(value: unknown): DietCoachFeedback {
  const result = read(value, shape) as Partial<DietCoachFeedback> | undefined;
  // Keep absent measurements absent, rather than inventing zero-valued stats.
  const history = value && typeof value === 'object' && 'previousReports' in value && Array.isArray(value.previousReports)
    ? value.previousReports.slice(0, 52).map(item => read(item, shape)).filter(Boolean) : [];
  return { ...result, stats: result?.stats || {}, previousReports: history } as DietCoachFeedback;
}
