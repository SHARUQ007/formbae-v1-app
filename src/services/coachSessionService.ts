/**
 * Booking a live session with your coach.
 *
 * The same bookings the web trainer page creates and the web booking calendar claims -
 * one `trainer_bookings` row, two clients. Anything that behaves differently here to
 * there is a bug, including the twenty-four hour cutoff on changing a session, which the
 * web page states as "Updates close 24h before".
 */
import { apiRequest } from './apiClient';

export type CoachSlot = {
  bookingId: string;
  trainerId: string;
  trainerName: string;
  slotStart: string;
  slotEnd: string;
  status: string;
};

export type CoachSession = CoachSlot & {
  /** Present only once the session is close enough to join. */
  meetingUrl?: string;
  joinable: boolean;
};

/** When this coach is free, soonest first. */
export async function fetchCoachSlots(trainerId: string): Promise<CoachSlot[]> {
  const result = await apiRequest<{ slots: CoachSlot[] }>(`/coach/${encodeURIComponent(trainerId)}/slots`);
  return result.slots || [];
}

/** Sessions booked and not yet had. */
export async function fetchMySessions(): Promise<CoachSession[]> {
  const result = await apiRequest<{ sessions: CoachSession[] }>('/coach/sessions');
  return result.sessions || [];
}

/**
 * Claim a slot.
 *
 * Can fail with SLOT_TAKEN even from a list that looked free a moment ago: the server
 * claims conditionally so two trainees never land in one session, and somebody else may
 * have got there first.
 */
export async function bookCoachSession(bookingId: string): Promise<CoachSession> {
  const result = await apiRequest<{ session: CoachSession }>('/coach/sessions', {
    method: 'POST',
    body: { bookingId },
  });
  return result.session;
}

/** Give the time back, so the coach keeps the hour and somebody else can take it. */
export async function cancelCoachSession(bookingId: string): Promise<void> {
  await apiRequest(`/coach/sessions/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST' });
}

/** "Thu, 18 Sep · 6:00 pm – 7:00 pm", the same shape the web calendar prints. */
export function formatSlotRange(slotStart: string, slotEnd: string): string {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return 'Time not set';
  const date = start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const from = start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const end = new Date(slotEnd);
  if (Number.isNaN(end.getTime())) return `${date} · ${from}`;
  const to = end.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${from} – ${to}`;
}

/** Just the start time, for a slot button. */
export function formatSlotTime(slotStart: string): string {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return 'Time not set';
  return start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Whether a booked session can still be changed. Twenty-four hours, as on the web. */
export function canStillChange(slotStart: string, now = Date.now()): boolean {
  const start = new Date(slotStart).getTime();
  return Number.isFinite(start) && start - now > 24 * 60 * 60 * 1000;
}

/** The calendar groups by day, so slots need a stable local day key. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
