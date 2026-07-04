import { apiRequest } from './apiClient';
import type { AnalysisReport, MobileQuestion } from '../types/api';

export async function fetchQuestionnaire() {
  return apiRequest<{
    questions: MobileQuestion[];
    answers: Record<string, string>;
    completed: boolean;
  }>('/questionnaire');
}

export async function saveQuestionnaireDraft(answers: Record<string, string>) {
  return apiRequest<{ ok: boolean; answers: Record<string, string> }>('/questionnaire', {
    method: 'PATCH',
    body: { answers },
  });
}

export async function submitQuestionnaire(answers: Record<string, string>) {
  return apiRequest<{ ok: boolean; completed: boolean }>('/questionnaire', {
    method: 'POST',
    body: { answers },
  });
}

export async function fetchAnalysis() {
  return apiRequest<{ report: AnalysisReport; answers: Record<string, string> }>('/analysis');
}

export async function generateAnalysis() {
  return apiRequest<{ ok: boolean; report: AnalysisReport }>('/analysis', { method: 'POST' });
}
