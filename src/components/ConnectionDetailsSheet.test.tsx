import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ConnectionDetailsSheet } from './ConnectionDetailsSheet';
import {
  fetchConnection,
  removeConnection,
} from '../services/connectionService';
jest.mock('../services/connectionService', () => ({
  fetchConnection: jest.fn(),
  removeConnection: jest.fn(),
}));
const details = {
  userId: 'friend',
  displayName: 'Priya K.',
  trophyCount: 87,
  isPartner: true,
  onLeaderboard: true,
  connectedSince: '',
  sharedDays: 4,
};

it('shows connection details and confirms the exact relationship to remove', async () => {
  jest.mocked(fetchConnection).mockResolvedValue(details);
  jest.mocked(removeConnection).mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert');
  const onChanged = jest.fn(),
    onClose = jest.fn();
  let tree!: ReactTestRenderer;
  await act(() => {
    tree = create(
      <ConnectionDetailsSheet
        userId="friend"
        onChanged={onChanged}
        onClose={onClose}
      />,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain('87');
  expect(
    tree.root
      .findAllByType(Text)
      .map(node => [node.props.children].flat().join(''))
      .join(' '),
  ).toContain('4 shared days');
  await act(() => {
    tree.root
      .findByProps({ accessibilityLabel: 'Remove from leaderboard' })
      .props.onPress();
  });
  expect(alert.mock.calls[0][1]).toContain('Partner mode connection stays');
  expect(removeConnection).not.toHaveBeenCalled();
  await act(async () => {
    await alert.mock.calls[0][2]!.find(button => button.text === 'Remove')!
      .onPress!();
  });
  expect(removeConnection).toHaveBeenCalledWith('friend', 'leaderboard');
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

it('does not offer partner removal for a leaderboard-only friend', async () => {
  jest
    .mocked(fetchConnection)
    .mockResolvedValue({ ...details, isPartner: false });
  let tree!: ReactTestRenderer;
  await act(() => {
    tree = create(
      <ConnectionDetailsSheet
        userId="friend"
        onChanged={jest.fn()}
        onClose={jest.fn()}
      />,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Remove from leaderboard');
  expect(JSON.stringify(tree.toJSON())).not.toContain('End Partner mode');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Remove from both');
});
