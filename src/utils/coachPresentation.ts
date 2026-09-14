import type { CoachOption, PaymentPlan } from '../types/api';
import { rupees, titleCase } from './format';

export function formatCoachLabel(coach: Pick<CoachOption, 'expertise' | 'trainerPersona' | 'trainerKind'>): string {
  const raw = String(coach.expertise || coach.trainerPersona || '').trim();
  const normalized = raw.toLowerCase();
  if (String(coach.trainerKind || '').toLowerCase() === 'ai' || normalized === 'female_ai' || normalized === 'male_ai') {
    return 'AI trainer';
  }
  if (!raw) return 'Personal trainer';
  // The backend already writes these for a reader; only a stored key needs spelling out,
  // otherwise "Strength and Training Coach" comes back as "Strength And Training Coach".
  return /[_-]/.test(raw) ? titleCase(raw) : raw;
}

export function isIncludedCoach(coach: CoachOption): boolean {
  if (coach.includedInMembership !== undefined) return coach.includedInMembership;
  return coach.name.trim().toLowerCase() === 'ava' && formatCoachLabel(coach) === 'AI trainer';
}

export function coachPricePaise(coach: CoachOption): number {
  const explicit = Number(coach.upgradeAmountPaise || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const monthlyFee = Number(String(coach.monthlyFee || '').replace(/,/g, '').trim());
  return Number.isFinite(monthlyFee) && monthlyFee > 0 ? Math.round(monthlyFee * 100) : 0;
}

export function coachAccessPrice(coach: CoachOption): string {
  if (isIncludedCoach(coach)) return 'Included with ₹49 membership';
  const amount = coachPricePaise(coach);
  return amount > 0 ? `${rupees(amount)}/month` : 'Pricing unavailable';
}

/** A coach's price as it appears on cards and buttons. */
export function coachMonthlyLabel(coach: CoachOption): string {
  return `${rupees(coachPricePaise(coach))}/mo`;
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
