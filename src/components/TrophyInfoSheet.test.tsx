import React from 'react';
import { Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { TrophyInfoSheet } from './TrophyInfoSheet';

it('retains the trophy rules, shows the actual safe zones, and closes via either control', () => {
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TrophyInfoSheet visible trophy={{ score: 132, safeZone: 125, nextMilestone: 150, pointsToNext: 18 }} onClose={close} />); });
  const text = JSON.stringify(tree.toJSON());
  for (const value of ['132', '125', '150', '+10', '+1', '−3', '−1', 'Bonus', '3 missed food logs']) expect(text).toContain(value);
  expect(tree.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 28, text: '18 trophies to 150' });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Close trophy information', accessibilityRole: 'button' }).props.onPress());
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});
