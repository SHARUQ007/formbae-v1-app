import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useRestTimer } from '../hooks/useRestTimer';
import { WorkoutRestDock } from './WorkoutRestDock';

function Workout({ onComplete }: { onComplete: () => void }) {
  const timer = useRestTimer(onComplete);
  const [playing, setPlaying] = useState(false);
  const { start } = timer;
  useEffect(() => { start(90); }, [start]);
  return <View>
    <ScrollView><TouchableOpacity accessibilityLabel="Play exercise video" onPress={() => setPlaying(true)}>
      <Text>{playing ? 'Video playing' : 'Play video'}</Text>
    </TouchableOpacity></ScrollView>
    {timer.running ? <WorkoutRestDock remaining={timer.remaining} nextLabel="Set 3 of Chest Press"
      onAddTime={() => timer.addTime(15)} onSkip={timer.stop} /> : null}
  </View>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('keeps the video available while counting down, extending and skipping rest', async () => {
  const onComplete = jest.fn();
  let tree!: ReactTestRenderer;
  await act(() => { tree = create(<Workout onComplete={onComplete} />); });
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(tree.root.findByType(WorkoutRestDock).props.remaining).toBe(90);
  const press = (label: string) => tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label)!.props.onPress();
  await act(() => press('Play exercise video'));
  await act(() => jest.advanceTimersByTime(15000));
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Video playing')).toBe(true);
  expect(tree.root.findByType(WorkoutRestDock).props.remaining).toBe(75);
  await act(() => press('Add fifteen seconds'));
  expect(tree.root.findByType(WorkoutRestDock).props.remaining).toBe(90);
  await act(() => press('Skip rest'));
  expect(tree.root.findAllByType(WorkoutRestDock)).toHaveLength(0);
  await act(() => jest.advanceTimersByTime(100000));
  expect(onComplete).not.toHaveBeenCalled();
  await act(() => tree.unmount());
  await act(() => jest.runOnlyPendingTimers());
  expect(jest.getTimerCount()).toBe(0);
});

it('finishes rest once while video playback remains available', async () => {
  const onComplete = jest.fn();
  let tree!: ReactTestRenderer;
  await act(() => { tree = create(<Workout onComplete={onComplete} />); });
  await act(() => jest.advanceTimersByTime(90000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(WorkoutRestDock)).toHaveLength(0);
  expect(tree.root.findByType(ScrollView)).toBeTruthy();
  await act(() => jest.advanceTimersByTime(10000));
  expect(onComplete).toHaveBeenCalledTimes(1);
  await act(() => tree.unmount());
});
