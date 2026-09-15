import type { MobileQuestion } from '../types/api';

export function answerProblem(question: MobileQuestion, answer: string): string {
  const raw = answer.trim();
  if (!raw) {
    if (question.required === false) return '';
    return question.type === 'number' ? 'Enter a number to continue.' : 'Choose an answer to continue.';
  }
  if (question.type === 'number') {
    const value = Number(raw);
    if (!Number.isFinite(value)) return 'Enter numbers only.';
    const min = question.min ?? 0;
    const max = question.max ?? Number.MAX_SAFE_INTEGER;
    if (value < min || value > max) return `Enter a value between ${min} and ${max}${question.unit ? ` ${question.unit}` : ''}.`;
  }
  if (question.type === 'single' && !question.options?.some(option => option.value === raw)) {
    return 'Choose one of the available answers.';
  }
  if (question.type === 'multi') {
    const picked = raw.split(',').map(value => value.trim()).filter(Boolean);
    if (!picked.length || picked.some(value => !question.options?.some(option => option.value === value))) {
      return 'Choose from the available answers.';
    }
  }
  return '';
}

/** A draft from the free assessment can contain ranges that paid setup no longer accepts. */
export function restoreQuestionnaireAnswers(
  questions: MobileQuestion[],
  remote: Record<string, string>,
  local: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(questions.map(question => {
    const saved = local[question.id] ?? remote[question.id] ?? '';
    if (!saved.trim() || !answerProblem(question, saved)) return [question.id, saved];
    const fallback = remote[question.id] ?? '';
    return [question.id, answerProblem(question, fallback) ? '' : fallback];
  }));
}

/** FastAPI wraps errors in detail; older mobile endpoints return them at the top level. */
export function rejectedQuestionIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const detail = 'detail' in payload ? payload.detail : payload;
  if (!detail || typeof detail !== 'object') return [];
  const fields = 'fields' in detail && Array.isArray(detail.fields) ? detail.fields : [];
  const missing = 'missing' in detail && Array.isArray(detail.missing) ? detail.missing : [];
  return [...fields, ...missing].flatMap(field => {
    if (typeof field === 'string') return [field];
    if (field && typeof field === 'object' && 'id' in field && typeof field.id === 'string') return [field.id];
    return [];
  });
}
