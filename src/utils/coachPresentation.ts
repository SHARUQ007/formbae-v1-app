import type { CoachOption, PaymentPlan } from '../types/api';
import { titleCase } from './format';

export function formatCoachLabel(coach: Pick<CoachOption, 'expertise' | 'trainerPersona' | 'trainerKind'>): string {
  const raw = String(coach.expertise || coach.trainerPersona || '').trim();
  const normalized = raw.toLowerCase();
  if (String(coach.trainerKind || '').toLowerCase() === 'ai' || normalized === 'female_ai' || normalized === 'male_ai') {
    return 'AI trainer';
  }
  return titleCase(raw) || 'Personal trainer';
}

export function isIncludedCoach(coach: CoachOption): boolean {
  if (coach.includedInMembership !== undefined) return coach.includedInMembership;
  return coach.name.trim().toLowerCase() === 'ava' && formatCoachLabel(coach) === 'AI trainer';
}

export function coachPricePaise(coach: CoachOption): number {
  const explicit = Number(coach.upgradeAmountPaise || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const rupees = Number(String(coach.monthlyFee || '').replace(/,/g, '').trim());
  return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
}

export function coachAccessPrice(coach: CoachOption): string {
  if (isIncludedCoach(coach)) return 'Included with ₹49 membership';
  const amount = coachPricePaise(coach);
  return amount > 0 ? `₹${Math.round(amount / 100).toLocaleString('en-IN')}/month` : 'Pricing unavailable';
}

export function coachCheckoutPlan(coach: CoachOption): PaymentPlan | null {
  const amount = coachPricePaise(coach);
  if (!coach.paywallId || amount <= 0) return null;
  return {
    planId: 'monthly__m1',
    planName: `${coach.name} personal coaching`,
    label: `${coach.name} personal coaching`,
    amount,
    planDuration: 'monthly',
    paywallId: coach.paywallId,
    billing: 'one_time',
    memberLimit: 1,
  };
}
