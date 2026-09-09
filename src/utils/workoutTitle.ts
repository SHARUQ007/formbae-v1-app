import type { TodayPayload } from '../types/api';

/** Format workout headings only; never apply to prescriptions, IDs or numeric counters. */
export function formatWorkoutTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/([\p{L})])\s*[+&/|·•]\s*(?=[\p{L}])/gu, '$1 and ')
    .replace(/\bandd\b/gi, 'and')
    .replace(/\band(?:\s+and)+\b/gi, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWorkoutPlan<T extends { title?: string; days?: Array<{ focus: string }> }>(plan: T): T {
  const title = plan.title === undefined ? undefined : formatWorkoutTitle(plan.title);
  const originalDays = plan.days;
  let days = originalDays;
  originalDays?.forEach((day, index) => {
    const focus = formatWorkoutTitle(day.focus);
    if (focus === day.focus) return;
    if (days === originalDays) days = [...originalDays];
    days![index] = { ...day, focus };
  });
  return title === plan.title && days === plan.days ? plan : { ...plan, title, days };
}

export function normalizeWorkoutBundle<T extends { plan?: TodayPayload['plan']; today: TodayPayload }>(data: T): T {
  const plan = data.plan ? normalizeWorkoutPlan(data.plan) : data.plan;
  const todayPlan = data.today.plan === data.plan ? plan
    : data.today.plan ? normalizeWorkoutPlan(data.today.plan) : data.today.plan;
  if (plan === data.plan && todayPlan === data.today.plan) return data;
  return { ...data, plan, today: todayPlan === data.today.plan ? data.today : { ...data.today, plan: todayPlan } };
}

export function normalizeWorkoutDetail<T extends { focus: string; planTitle: string }>(detail: T): T {
  const focus = formatWorkoutTitle(detail.focus);
  const planTitle = formatWorkoutTitle(detail.planTitle);
  return focus === detail.focus && planTitle === detail.planTitle ? detail : { ...detail, focus, planTitle };
}
