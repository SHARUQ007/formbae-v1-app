import { Animated } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MotionAnimation } from './MotionAnimation';

afterEach(() => jest.restoreAllMocks());

it('stops an unfinished success animation on replacement and unmount', () => {
  const animations: Animated.CompositeAnimation[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation(() => {
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    animations.push(animation);
    return animation;
  });
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<MotionAnimation kind="success" />); });
  const success = animations[0];
  expect(success.start).toHaveBeenCalledTimes(1);
  expect(success.stop).not.toHaveBeenCalled();
  act(() => { tree.update(<MotionAnimation kind="empty" />); });
  expect(success.stop).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<MotionAnimation kind="success" />); });
  const next = animations[animations.length - 1];
  act(() => tree.unmount());
  expect(next.stop).toHaveBeenCalledTimes(1);
});
