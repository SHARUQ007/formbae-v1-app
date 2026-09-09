import type { Asset } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { apiRequest, getDirectApiUrl } from './apiClient';
import { invalidateCachedResource } from './appCache';
import { publishOrRefreshTrophySummary } from './trophyRealtime';
import type { MealType } from '../store/dietDiaryStore';
import type { ReportEvidenceCoverage, TrophySummary } from '../types/api';
import { getBackendApiBaseUrl } from '../constants/config';

export type RemoteDietDiaryEntry = {
  entryId: string;
  clientId?: string;
  mealType: MealType | 'Snack';
  note: string;
  status?: 'logged' | 'skipped';
  createdAt: string;
  loggedAt?: string;
  imageMime: string;
  imageUrl: string;
};

type DietDiaryMutationResponse = { ok: boolean; entry: RemoteDietDiaryEntry; trophies?: TrophySummary };

export const DIET_DIARY_CACHE_KEY = 'dietDiary:v3';

export type DietReportSectionId =
  | 'overview'
  | 'weeklyPlan'
  | 'observations'
  | 'questions'
  | 'loggingRhythm'
  | 'mealGuidance'
  | 'patternsAndFoodCoverage'
  | 'goalsRhythmTraining'
  | 'mealFormulaAndSwaps'
  | 'scoreDetails'
  | 'sourcesAndLimitations';

export type DietCoachFeedback = {
  schemaVersion?: number;
  reportKind?: 'diet';
  generationMethod?: 'ai' | 'data_summary';
  evidenceCoverage?: ReportEvidenceCoverage;
  template?: { id: 'weekly-diet-report'; version: number };
  sectionOrder?: DietReportSectionId[];
  weekStartDate: string;
  weekEndDate?: string;
  generatedAt: string;
  previousReports?: DietCoachFeedback[];
  title: string;
  headline?: string;
  summary: string;
  weekSummary?: string;
  nextFocus: string;
  highlights: string[];
  score?: {
    availability?: 'available' | 'insufficientEvidence' | 'temporarilyUnavailable';
    overall: number;
    label: string;
    trend?: number | null;
    components: Array<{
      key: string;
      label: string;
      score: number;
      maxScore: number;
      insight: string;
    }>;
  };
  scoreHistory?: Array<{
    weekStartDate: string;
    weekEndDate: string;
    generatedAt: string;
    overall: number;
    label: string;
  }>;
  charts?: {
    mealLogging?: DietReportChart;
    scoreTrend?: DietReportChart;
  };
  wins?: Array<{ title: string; detail: string; evidence?: string }>;
  patterns?: Array<{
    key: string;
    title: string;
    status: 'strong' | 'building' | 'attention' | 'limited';
    summary: string;
    evidence: string[];
  }>;
  priorityInsights?: Array<{
    id?: string;
    rank: number;
    title: string;
    observation: string;
    whyItMatters: string;
    benefit?: string;
    riskIfUnchanged?: string;
    nextStep: string;
    evidence: string[];
    evidenceIds?: string[];
  }>;
  foodGroups?: Array<{
    key: string;
    label: string;
    status: 'strong' | 'present' | 'limited' | 'notSeen';
    observedFoods: string[];
    insight: string;
  }>;
  mealGuidance?: Array<{
    mealType: 'Breakfast' | 'Lunch' | 'Evening' | 'Dinner';
    observedCount: number;
    status: 'observed' | 'limited';
    pattern: string;
    advice: string;
  }>;
  mealRhythm?: { summary: string; strongestWindow: string; opportunityWindow: string };
  goalAlignment?: { summary: string; supports: string[]; gaps: string[] };
  trainingNutrition?: { summary: string; trainingDayAction: string; restDayAction: string };
  facts?: Array<{ id: string; title: string; body: string; sourceLabel: string; sourceUrl: string }>;
  nextWeek?: {
    actionPlan?: Array<{
      id: string;
      priority: number;
      title: string;
      why: string;
      cue: string;
      steps: string[];
      fallback: string;
      successMeasure: string;
      sourceInsightId: string;
      evidenceIds: string[];
    }>;
    primaryFocus: string;
    whyItMatters: string;
    benefit?: string;
    riskIfUnchanged?: string;
    actions: string[];
    mealBuilder: { title: string; plants: string; protein: string; carbs: string; extras: string };
    smartSwaps: Array<{ from: string; to: string; why: string }>;
    implementationPlan?: { cue: string; action: string; fallback: string; successMeasure: string };
    trackingFocus?: string;
  };
  questionsForNextWeek?: string[];
  questionResponses?: Array<{ questionIndex?: number; question: string; answer: string }>;
  limitations?: string[];
  safetyNotices?: Array<{
    id?: string;
    title?: string;
    body: string;
    severity?: 'info' | 'warning' | 'urgent';
  }>;
  sections?: Array<{
    id?: string;
    title: string;
    summary?: string;
    paragraphs?: string[];
    items?: string[];
  }>;
  status?: 'pending' | 'ready';
  nextInDays?: number;
  /** Evidence accumulated since the last generated report, expressed from 0–100. */
  enrichmentScore?: number;
  requirements?: {
    /** Minimum enrichment score required before report generation can run. */
    enrichment?: number;
  };
  stats: {
    loggedItems: number;
    mealMoments?: number;
    daysLogged: number;
    describedEntries?: number;
    describedMealMoments?: number;
    describedDaysLogged?: number;
    memoryEntries: number;
    photoEntries: number;
    workoutsCompleted?: number;
    mealCounts: Record<string, number>;
    describedMealCounts?: Record<string, number>;
    recentFoods: string[];
  };
};

export type DietReportChart = {
  type: 'bar' | 'line';
  metric: 'loggedMeals' | 'foodPatternScore';
  title: string;
  subtitle: string;
  unit: 'meals' | 'points';
  points: Array<{
    key: string;
    date: string;
    label: string;
    value: number | null;
    missingReason?: string;
  }>;
  minValue?: number;
  maxValue: number;
};

export async function fetchDietDiary() {
  return apiRequest<{ entries: RemoteDietDiaryEntry[]; feedback?: DietCoachFeedback }>('/diet/diary', {
    // A due report is generated synchronously: allow the draft, source audit
    // and bounded repair to finish without starting a duplicate generation.
    timeoutMs: 420000,
    retries: 0,
  });
}

export async function submitDietReportResponses(params: {
  reportGeneratedAt: string;
  answers: Array<{ questionIndex: number; answer: string }>;
}) {
  const response = await apiRequest<{
    ok: boolean;
    answers: Array<{ questionIndex: number; question: string; answer: string }>;
  }>('/diet/report/responses', {
    method: 'PATCH',
    body: params,
  });
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  return response;
}

export async function uploadDietDiaryEntry(params: {
  clientId: string;
  mealType: MealType;
  note?: string;
  createdAt: string;
  asset: Asset;
}) {
  let imageBase64 = params.asset.base64;
  if (!imageBase64 && params.asset.uri) {
    const path = params.asset.originalPath || params.asset.uri.replace(/^file:\/\//, '');
    imageBase64 = await RNFS.readFile(path, 'base64').catch(() => undefined);
  }
  if (!imageBase64) throw new Error('The saved photo could not be read for upload.');

  const response = await apiRequest<DietDiaryMutationResponse>('/diet/diary', {
    method: 'POST',
    timeoutMs: 30000,
    body: {
      clientId: params.clientId,
      mealType: params.mealType,
      note: params.note || '',
      createdAt: params.createdAt,
      imageMime: params.asset.type || 'image/jpeg',
      imageBase64,
    },
  });
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export async function uploadTextDietDiaryEntry(params: {
  clientId: string;
  mealType: MealType;
  note: string;
  createdAt: string;
}) {
  const response = await apiRequest<DietDiaryMutationResponse>('/diet/diary', {
    method: 'POST',
    body: {
      clientId: params.clientId,
      mealType: params.mealType,
      note: params.note,
      createdAt: params.createdAt,
    },
  });
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export async function uploadSkippedDietMeal(params: {
  clientId: string;
  mealType: MealType;
  createdAt: string;
}) {
  const response = await apiRequest<DietDiaryMutationResponse>('/diet/diary', {
    method: 'POST',
    body: { ...params, status: 'skipped' },
  });
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export async function updateRemoteDietDiaryEntry(
  entryId: string,
  params: { mealType: MealType; note: string; createdAt?: string },
) {
  const response = await apiRequest<DietDiaryMutationResponse>(
    `/diet/diary/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      body: params,
    },
  );
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export async function deleteRemoteDietDiaryEntry(entryId: string) {
  const response = await apiRequest<{ ok: boolean; trophies?: TrophySummary }>(`/diet/diary/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  invalidateCachedResource(DIET_DIARY_CACHE_KEY);
  invalidateCachedResource('progressBundle');
  publishOrRefreshTrophySummary(response.trophies);
  return response;
}

export function resolveDietDiaryImageUrl(imageUrl: string) {
  if (!imageUrl || imageUrl.startsWith('file:') || imageUrl.startsWith('content:') || imageUrl.startsWith('data:') || /^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  return getDirectApiUrl(imageUrl.replace(/^\/api\/mobile/, ''));
}

/** Prevents an API token from ever being forwarded to third-party image hosts. */
export function shouldAuthenticateDietDiaryImage(imageUrl: string) {
  const backend = getBackendApiBaseUrl().replace(/\/$/, '');
  return imageUrl === backend || imageUrl.startsWith(`${backend}/`);
}
