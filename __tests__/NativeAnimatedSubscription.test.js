/* global beforeEach, afterEach, expect, it, jest */

// Exercise the installed AnimatedValue, helper and event emitter. Only the
// native module is simulated: observation changes run in a later UI batch,
// whereas NativeEventEmitter's listener count changes immediately on iOS.
const { Animated, DeviceEventEmitter, NativeModules, Platform } = require('react-native');
const AnimatedValue = Animated.Value;
// The dependency patch test needs to flush React Native's actual native queue.
// eslint-disable-next-line @react-native/no-deep-imports
const NativeAnimatedHelper = require('react-native/src/private/animated/NativeAnimatedHelper').default;

const native = NativeModules.NativeAnimatedModule;
const originalOS = Platform.OS;
const warning = jest.fn();
let operations;
let nodes;
let observing;
let receivers;

function flushNative() {
  NativeAnimatedHelper.API.flushQueue();
  while (operations.length) operations.shift()();
}

function frame(tag, value = 1) {
  if (!observing.has(tag)) return;
  if (!receivers) {
    warning('Sending `onAnimatedValueUpdate` with no listeners registered.');
    return;
  }
  DeviceEventEmitter.emit('onAnimatedValueUpdate', { tag, value });
}

beforeEach(() => {
  Platform.OS = 'ios';
  jest.clearAllMocks();
  operations = [];
  nodes = new Set();
  observing = new Set();
  receivers = 0;
  native.addListener.mockImplementation(() => { receivers += 1; });
  native.removeListeners.mockImplementation(count => { receivers -= count; });
  native.createAnimatedNode.mockImplementation(tag => { operations.push(() => nodes.add(tag)); });
  native.startListeningToAnimatedNodeValue.mockImplementation(tag => { operations.push(() => observing.add(tag)); });
  native.stopListeningToAnimatedNodeValue.mockImplementation(tag => { operations.push(() => observing.delete(tag)); });
  native.getValue.mockImplementation((tag, callback) => {
    operations.push(() => {
      expect(nodes.has(tag)).toBe(true);
      callback(1);
    });
  });
  native.dropAnimatedNode.mockImplementation(tag => {
    operations.push(() => {
      observing.delete(tag);
      nodes.delete(tag);
    });
  });
});

afterEach(() => {
  flushNative();
  expect(receivers).toBe(0);
  expect(DeviceEventEmitter.listenerCount('onAnimatedValueUpdate')).toBe(0);
  expect(warning).not.toHaveBeenCalled();
  Platform.OS = originalOS;
});

it('registers a receiver before native observation can emit its first frame', () => {
  native.startListeningToAnimatedNodeValue.mockImplementation(tag => {
    observing.add(tag);
    frame(tag);
  });
  const value = new AnimatedValue(0, { useNativeDriver: true });
  const listener = jest.fn();
  value.addListener(listener);
  expect(listener).toHaveBeenCalledWith({ value: 1 });
  value.__detach();
});

it('keeps native updates safe until the queued stop runs, without calling removed listeners', () => {
  const value = new AnimatedValue(0, { useNativeDriver: true });
  const listener = jest.fn();
  const id = value.addListener(listener);
  const tag = value.__getNativeTag();
  flushNative();
  value.removeListener(id);
  frame(tag);
  expect(listener).not.toHaveBeenCalled();
  expect(receivers).toBe(1);
  flushNative();
  expect(receivers).toBe(0);
  expect(observing.has(tag)).toBe(false);
  value.__detach();
});

it('keeps observation active while another value listener still needs it', () => {
  const value = new AnimatedValue(0, { useNativeDriver: true });
  const first = jest.fn();
  const second = jest.fn();
  const firstId = value.addListener(first);
  value.addListener(second);
  flushNative();
  value.removeListener(firstId);
  frame(value.__getNativeTag(), 2);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith({ value: 2 });
  expect(native.stopListeningToAnimatedNodeValue).not.toHaveBeenCalled();
  value.__detach();
});

it('supports rapid resubscription without duplicate callbacks or removing the new receiver', () => {
  const value = new AnimatedValue(0, { useNativeDriver: true });
  value.addListener(jest.fn());
  flushNative();
  value.removeAllListeners();
  const next = jest.fn();
  value.addListener(next);
  frame(value.__getNativeTag(), 2);
  expect(next).toHaveBeenCalledTimes(1);
  flushNative();
  expect(receivers).toBe(1);
  frame(value.__getNativeTag(), 3);
  expect(next).toHaveBeenCalledTimes(2);
  value.__detach();
});

it('acknowledges removal before detaching the node and releases every receiver across repeated mounts', () => {
  for (let index = 0; index < 50; index += 1) {
    const value = new AnimatedValue(0, { useNativeDriver: true });
    value.addListener(jest.fn());
    const tag = value.__getNativeTag();
    flushNative();
    value.__detach();
    frame(tag);
    flushNative();
    expect(receivers).toBe(0);
    expect(nodes.size).toBe(0);
    expect(observing.size).toBe(0);
  }
});

it('does not add a getValue acknowledgement to Android subscription cleanup', () => {
  Platform.OS = 'android';
  const value = new AnimatedValue(0, { useNativeDriver: true });
  value.addListener(jest.fn());
  flushNative();
  value.removeAllListeners();
  expect(native.getValue).not.toHaveBeenCalled();
  expect(receivers).toBe(0);
  value.__detach();
});
