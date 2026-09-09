import type { WeeklyProgressReview } from '../types/api';
import { weeklyReportSchedule } from './weeklyReportSchedule';

const now = Date.parse('2026-09-10T08:00:00Z');
const review = (value: Partial<WeeklyProgressReview>) => value as WeeklyProgressReview;

it('honors the due timestamp over contradictory cached flags and day counts', () => {
  expect(weeklyReportSchedule(review({ nextReviewAt: '2026-09-17T08:00:00Z', nextInDays: 0, generationPending: true }), now))
    .toMatchObject({ days: 7, preparing: false, countdown: '7 days to next review' });
  expect(weeklyReportSchedule(review({ nextReviewAt: '2026-09-11T07:59:59Z' }), now).days).toBe(1);
});

it('distinguishes due generation from a retry without inventing another countdown', () => {
  expect(weeklyReportSchedule(review({ nextReviewAt: '2026-09-10T08:00:00Z', generationPending: true }), now))
    .toMatchObject({ days: 0, preparing: true, countdown: 'Preparing next report' });
  expect(weeklyReportSchedule(review({ nextReviewAt: '2026-09-09T08:00:00Z', cycleState: 'retry_wait' }), now))
    .toMatchObject({ days: 0, preparing: false, countdown: 'Report update pending' });
});

it('supports older responses that only provide a day count', () => {
  expect(weeklyReportSchedule(review({ nextInDays: 5 }), now).days).toBe(5);
  expect(weeklyReportSchedule(review({ nextInDays: -1 }), now).days).toBe(0);
});
