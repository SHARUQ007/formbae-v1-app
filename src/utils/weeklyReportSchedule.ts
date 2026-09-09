import type { WeeklyProgressReview } from '../types/api';

/** The server's due timestamp owns the countdown; a background job cannot shorten it. */
export function weeklyReportSchedule(review?: WeeklyProgressReview, now = Date.now()) {
  const due = Date.parse(review?.nextReviewAt || '');
  const days = Number.isFinite(due)
    ? Math.max(0, Math.ceil((due - now) / 86_400_000))
    : Math.max(0, review?.nextInDays ?? 7);
  const preparing = days === 0 && Boolean(review?.generationPending);
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  const countdown = days > 0 ? `${dayLabel} to next review`
    : preparing ? 'Preparing next report'
      : review?.cycleState === 'retry_wait' ? 'Report update pending' : 'Weekly review due';
  return { days, dayLabel, preparing, countdown };
}
