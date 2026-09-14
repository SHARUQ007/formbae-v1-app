import { coachAccessPrice, coachCheckoutPlan, coachPricePaise, formatCoachLabel, isIncludedCoach } from './coachPresentation';
import type { CoachOption } from '../types/api';

const coach = (overrides: Partial<CoachOption> = {}): CoachOption => ({
  trainerId: 'coach-1',
  name: 'Manisha',
  gender: '',
  photoUrl: '',
  expertise: 'Strength and Training Coach',
  description: '',
  detailedDescription: '',
  languages: [],
  monthlyFee: '999',
  availableSlotCount: 0,
  nextSlotAt: '',
  changeKind: 'swap',
  blockedUntil: '',
  canSelect: false,
  reason: '',
  paywallId: 'trainer-coach-1',
  ...overrides,
});

const ava = () => coach({
  trainerId: 'ava', name: 'Ava', trainerKind: 'ai', trainerPersona: 'female_ai',
  expertise: 'AI Trainer', monthlyFee: '0', canSelect: true, includedInMembership: true, paywallId: '',
});

it('leaves a label the backend already wrote for a reader alone', () => {
  expect(formatCoachLabel({ expertise: 'Strength and Training Coach', trainerPersona: '', trainerKind: 'human' })).toBe('Strength and Training Coach');
  expect(formatCoachLabel({ expertise: 'AI coach', trainerPersona: '', trainerKind: 'human' })).toBe('AI coach');
});

it('never shows a stored persona key to a trainee', () => {
  expect(formatCoachLabel({ expertise: '', trainerPersona: 'strength_training_coach', trainerKind: 'human' })).toBe('Strength Training Coach');
  expect(formatCoachLabel({ expertise: '', trainerPersona: 'nutrition_coach', trainerKind: 'human' })).toBe('Nutrition Coach');
  expect(formatCoachLabel({ expertise: '', trainerPersona: 'female_ai', trainerKind: 'ai' })).toBe('AI trainer');
  expect(formatCoachLabel({ expertise: '', trainerPersona: '', trainerKind: 'human' })).toBe('Personal trainer');
  for (const persona of ['strength_training_coach', 'accountability_coach', 'personal_trainer']) {
    expect(formatCoachLabel({ expertise: '', trainerPersona: persona, trainerKind: 'human' })).not.toContain('_');
  }
});

it('only Ava is included with the membership', () => {
  expect(isIncludedCoach(ava())).toBe(true);
  expect(isIncludedCoach(coach())).toBe(false);
  // A paid coach the backend happens to mark selectable is still not "included".
  expect(isIncludedCoach(coach({ canSelect: true }))).toBe(false);
  // Without the backend flag, only an AI coach actually named Ava counts.
  expect(isIncludedCoach(coach({ name: 'Ava', includedInMembership: undefined }))).toBe(false);
  expect(isIncludedCoach(coach({ name: 'Ava', trainerKind: 'ai', includedInMembership: undefined }))).toBe(true);
});

it('prices a paid coach from the server amount, falling back to their monthly fee', () => {
  expect(coachPricePaise(coach({ upgradeAmountPaise: 99900 }))).toBe(99900);
  expect(coachPricePaise(coach({ monthlyFee: '1,499' }))).toBe(149900);
  expect(coachPricePaise(coach({ monthlyFee: '', upgradeAmountPaise: 0 }))).toBe(0);
  expect(coachAccessPrice(ava())).toBe('Included with ₹49 membership');
  expect(coachAccessPrice(coach({ upgradeAmountPaise: 99900 }))).toBe('₹999/month');
  expect(coachAccessPrice(coach({ monthlyFee: '', upgradeAmountPaise: 0 }))).toBe('Pricing unavailable');
});

it('builds a checkout plan only when a coach can actually be bought', () => {
  const plan = coachCheckoutPlan(coach({ upgradeAmountPaise: 99900 }));
  expect(plan).toMatchObject({ amount: 99900, paywallId: 'trainer-coach-1', billing: 'one_time', memberLimit: 1 });
  // No paywall configured, or no price, means there is nothing to charge.
  expect(coachCheckoutPlan(coach({ paywallId: '', upgradeAmountPaise: 99900 }))).toBeNull();
  expect(coachCheckoutPlan(coach({ monthlyFee: '', upgradeAmountPaise: 0 }))).toBeNull();
  expect(coachCheckoutPlan(ava())).toBeNull();
});
