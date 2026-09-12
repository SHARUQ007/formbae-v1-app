export function parseMembershipDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && membershipDateKey(date) === value ? date : null;
}

export function membershipDateKey(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatMembershipDate(value: string) {
  return parseMembershipDate(value)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) || '';
}

export function parseMembershipMonths(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const months = Number(value);
  return months >= 1 && months <= 120 ? months : null;
}

export function membershipExpiry(started: string, months: number): string {
  const start = parseMembershipDate(started);
  if (!start || !Number.isInteger(months) || months < 1 || months > 120) return '';
  // Clamp month-end starts to February / shorter months instead of rolling over.
  const end = new Date(start.getFullYear(), start.getMonth() + months, 1, 12);
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0, 12).getDate();
  end.setDate(Math.min(start.getDate(), lastDay));
  return membershipDateKey(end);
}

export function savedMembershipMonths(initial: Record<string, unknown>): string {
  const saved = String(initial.gymMembershipMonths || '');
  if (parseMembershipMonths(saved)) return saved;
  const start = parseMembershipDate(String(initial.gymMembershipStart || ''));
  const end = parseMembershipDate(String(initial.gymMembershipExpiry || ''));
  if (!start || !end) return '';
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  // Never silently round an older saved expiry to a different date.
  return membershipExpiry(membershipDateKey(start), months) === membershipDateKey(end) ? String(months) : '';
}
