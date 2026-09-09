import type { AccountabilitySummary } from '../types/api';
import { setCachedResource } from './appCache';
import { fetchAccountability, peekAccountability, updateAccountability } from './accountabilityService';

const legacy: AccountabilitySummary = {
  streak: 2, keptCount: 3, commitmentCount: 4,
  today: {
    date: '2026-09-09', status: 'active', targetKind: 'workout', targetId: 'day+2',
    title: 'Full Body Strength + Fat Burn', committedAt: '', completedAt: '',
  },
};
const expectedTitle = 'Full Body Strength and Fat Burn';

afterEach(() => jest.restoreAllMocks());

it('formats saved commitments on immediate and async cache reads without changing IDs or counts', async () => {
  setCachedResource('accountability:summary:v1', legacy);
  const expected = { ...legacy, today: { ...legacy.today, title: expectedTitle } };
  expect(peekAccountability()).toEqual(expected);
  expect(await fetchAccountability()).toEqual(expected);
  expect(legacy.today?.title).toBe('Full Body Strength + Fat Burn');
});

it('formats API responses and new workout commitments before saving', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, text: async () => JSON.stringify(legacy),
  } as Response);
  expect((await fetchAccountability({ force: true })).today?.title).toBe(expectedTitle);
  const updated = await updateAccountability({ action: 'commit', targetKind: 'workout', targetId: 'day+2', title: legacy.today!.title });
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ title: expectedTitle, targetId: 'day+2' });
  expect(updated.today?.title).toBe(expectedTitle);
  expect(peekAccountability()?.today?.title).toBe(expectedTitle);
});

it('leaves non-workout commitment text unchanged', async () => {
  const diet = { ...legacy, today: { ...legacy.today!, targetKind: 'diet', title: 'Log 3+ meals' } };
  setCachedResource('accountability:summary:v1', diet);
  expect(peekAccountability()).toEqual(diet);
  expect(await fetchAccountability()).toEqual(diet);
});
