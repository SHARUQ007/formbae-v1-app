import { membershipExpiry, parseMembershipDate, savedMembershipMonths } from './gymMembership';

it.each([
  ['2026-01-31', 1, '2026-02-28'],
  ['2028-01-31', 1, '2028-02-29'],
  ['2028-02-29', 12, '2029-02-28'],
  ['2026-12-31', 3, '2027-03-31'],
  ['2026-03-31', 6, '2026-09-30'],
  ['2026-09-12', 9, '2027-06-12'],
])('adds calendar months to %s without rolling into the following month', (start, months, end) => {
  expect(membershipExpiry(start, months)).toBe(end);
  expect(savedMembershipMonths({ gymMembershipStart: start, gymMembershipExpiry: end })).toBe(String(months));
});

it('rejects impossible dates and preserves irregular legacy intervals for the form', () => {
  expect(parseMembershipDate('2026-02-30')).toBeNull();
  expect(parseMembershipDate('2026-13-01')).toBeNull();
  expect(parseMembershipDate('12/09/2026')).toBeNull();
  expect(savedMembershipMonths({ gymMembershipStart: '2026-09-12', gymMembershipExpiry: '2027-09-11' })).toBe('');
  expect(membershipExpiry('2026-02-30', 1)).toBe('');
});
