import { apiRequest } from './apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

import { dismissPendingTrophyInvite, fetchPendingTrophyInvite, parseStoredInvite, trophyInviteCodeFromUrl, readLocalInvite, saveLocalInvite } from './trophyInviteService';

it('accepts canonical app and website invites with tracking parameters', () => {
  expect(trophyInviteCodeFromUrl('https://formbae.in/invite/trophy/abc123?utm_source=friend')).toBe('ABC123');
  expect(trophyInviteCodeFromUrl('formbae://invite/trophy/ABC123')).toBe('ABC123');
});
it.each([
  'http://formbae.in/invite/trophy/ABC123', 'https://formbae.in.evil.test/invite/trophy/ABC123',
  'https://evil.test/invite/trophy/ABC123', 'https://formbae.in@evil.test/invite/trophy/ABC123',
  'https://formbae.in/invite/trophy/ABC123/welcome', 'formbae://admin/ABC123',
  'formbae://invite/trophy/12345', 'formbae://invite/trophy/ABC%20123',
])('ignores unsupported or malformed link %s', url => expect(trophyInviteCodeFromUrl(url)).toBeNull());
it('expires old pending invitations and rejects invalid disk state', () => {
  const now = Date.now();
  const invite = { code: 'ABC123', savedAt: now, userId: 'me' };
  expect(parseStoredInvite(JSON.stringify(invite), now)).toEqual(invite);
  expect(parseStoredInvite(JSON.stringify(invite), now + 31 * 86400000)).toBeNull();
  expect(parseStoredInvite(JSON.stringify(invite), now - 1)).toBeNull();
  expect(parseStoredInvite('not JSON')).toBeNull();
  expect(parseStoredInvite('{"code":"ABC123"}')).toBeNull();
});
it('serializes a new link and dismissal so it cannot reappear after restart', async () => {
  const save = saveLocalInvite({ code: 'ABC123', savedAt: Date.now() });
  const dismiss = saveLocalInvite(null);
  await Promise.all([save, dismiss]);
  expect(await readLocalInvite()).toBeNull();
});

it('keeps offline dismissals closed and retries on the next account lookup', async () => {
  const preview = { code: 'DEF456', displayName: 'Maya', trophies: 50, isOwnInvite: false, alreadyConnected: false };
  jest.mocked(apiRequest).mockRejectedValueOnce(new Error('offline'));
  await expect(dismissPendingTrophyInvite('DEF456', 'token', 'me')).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem('formbae_dismissed_invite:me:DEF456')).toBe('1');
  jest.mocked(apiRequest).mockResolvedValueOnce({ invite: preview }).mockResolvedValueOnce({ ok: true });
  expect(await fetchPendingTrophyInvite('token', 'me')).toEqual({ invite: null });
  expect(apiRequest).toHaveBeenLastCalledWith('/trophies/invite/DEF456/pending', { method: 'DELETE', token: 'token' });
  jest.mocked(apiRequest).mockResolvedValueOnce({ invite: preview });
  expect(await fetchPendingTrophyInvite('other-token', 'another-user')).toEqual({ invite: preview });
});
