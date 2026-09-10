import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Linking, Text, TouchableOpacity } from 'react-native';
import { TrophyInviteGate } from './TrophyInviteGate';
import * as invites from '../services/trophyInviteService';

jest.mock('../services/trophyInviteService', () => ({
  ...jest.requireActual('../services/trophyInviteService'),
  readLocalInvite: jest.fn(), saveLocalInvite: jest.fn(),
  previewTrophyInvite: jest.fn(), fetchPendingTrophyInvite: jest.fn(),
  confirmTrophyInvite: jest.fn(), dismissPendingTrophyInvite: jest.fn(),
}));
const preview = { code: 'ABC123', displayName: 'Maya', trophies: 50, isOwnInvite: false, alreadyConnected: false };
const props = { token: 'session', userId: 'me', active: true, canViewLeaderboard: true, onViewLeaderboard: jest.fn(), onSignIn: jest.fn() };
let renderer: Renderer.ReactTestRenderer;
const button = (text: string) => renderer.root.findAllByType(TouchableOpacity).find(node => node.findAllByType(Text).some(label => label.props.children === text))!;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('https://formbae.in/invite/trophy/ABC123');
  jest.mocked(invites.readLocalInvite).mockResolvedValue(null);
  jest.mocked(invites.saveLocalInvite).mockResolvedValue(undefined);
  jest.mocked(invites.previewTrophyInvite).mockResolvedValue(preview);
  jest.mocked(invites.fetchPendingTrophyInvite).mockResolvedValue({ invite: null });
  jest.mocked(invites.confirmTrophyInvite).mockResolvedValue({ ok: true });
  jest.mocked(invites.dismissPendingTrophyInvite).mockResolvedValue(undefined);
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.restoreAllMocks(); });

it('requires an explicit confirmation before connecting either leaderboard', async () => {
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  expect(invites.previewTrophyInvite).toHaveBeenCalledWith('ABC123', 'session');
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
  await act(async () => button('Join leaderboard').props.onPress());
  expect(invites.confirmTrophyInvite).toHaveBeenCalledTimes(1);
  expect(invites.confirmTrophyInvite).toHaveBeenCalledWith('ABC123', 'session');
  await act(async () => button('View leaderboard').props.onPress());
  expect(props.onViewLeaderboard).toHaveBeenCalledTimes(1);
});
it('preserves an invitation through sign-in and still asks for confirmation', async () => {
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} token={null} userId={undefined} />); });
  expect(invites.previewTrophyInvite).not.toHaveBeenCalled();
  await act(async () => button('Sign in to continue').props.onPress());
  expect(props.onSignIn).toHaveBeenCalled();
  await act(async () => renderer.update(<TrophyInviteGate {...props} />));
  expect(button('Join leaderboard')).toBeDefined();
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
});
it('dismisses without adding either person', async () => {
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  await act(async () => button('Not now').props.onPress());
  expect(invites.dismissPendingTrophyInvite).toHaveBeenCalledWith('ABC123', 'session', 'me');
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
  expect(invites.saveLocalInvite).toHaveBeenLastCalledWith(null);
});
it('loads an account-bound invite after web checkout without an incoming link', async () => {
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  jest.mocked(invites.fetchPendingTrophyInvite).mockResolvedValue({ invite: preview });
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  expect(button('Join leaderboard')).toBeDefined();
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
});
it('does not offer to join your own invitation', async () => {
  jest.mocked(invites.previewTrophyInvite).mockResolvedValue({ ...preview, isOwnInvite: true });
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  expect(button('Join leaderboard')).toBeUndefined();
  expect(button('Got it')).toBeDefined();
});
it('does not carry a previously bound invitation into another account', async () => {
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  jest.mocked(invites.readLocalInvite).mockResolvedValue({ code: 'ABC123', userId: 'someone-else', savedAt: Date.now() });
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  expect(invites.previewTrophyInvite).not.toHaveBeenCalled();
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
});

it('handles warm links and ignores duplicate delivery while confirmation is open', async () => {
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  let receive!: (event: { url: string }) => void;
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, handler) => {
    receive = handler;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  await act(async () => receive({ url: 'https://formbae.in/invite/trophy/ABC123' }));
  await act(async () => receive({ url: 'formbae://invite/trophy/ABC123' }));
  expect(invites.previewTrophyInvite).toHaveBeenCalledTimes(1);
  expect(button('Join leaderboard')).toBeDefined();
  expect(invites.confirmTrophyInvite).not.toHaveBeenCalled();
});
it('ignores a second tap while the reciprocal connection request is in flight', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(invites.confirmTrophyInvite).mockReturnValue(new Promise(done => { resolve = done; }));
  await act(async () => { renderer = Renderer.create(<TrophyInviteGate {...props} />); });
  await act(async () => {
    const press = button('Join leaderboard').props.onPress;
    press(); press();
  });
  expect(invites.confirmTrophyInvite).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true }));
  expect(button('View leaderboard')).toBeDefined();
});
