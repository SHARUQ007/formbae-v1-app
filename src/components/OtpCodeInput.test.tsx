import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtpCodeInput } from './OtpCodeInput';

let renderer: ReactTestRenderer;
const onChangeText = jest.fn();
const onComplete = jest.fn();

function render(value = '') {
  act(() => {
    renderer = create(<OtpCodeInput value={value} onChangeText={onChangeText} onComplete={onComplete} />);
  });
  return renderer.root.findByType(TextInput);
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => renderer.unmount()));

it('keeps the code to digits and to its length', () => {
  const input = render();
  act(() => input.props.onChangeText('1a2-3'));
  expect(onChangeText).toHaveBeenCalledWith('123');

  onChangeText.mockClear();
  act(() => input.props.onChangeText('1234567890'));
  expect(onChangeText).toHaveBeenCalledWith('123456');
});

it('a pasted or autofilled code arrives complete, and only once', () => {
  // The SMS autofill delivers all six digits in one change; a re-render must not read as
  // a second arrival and submit twice.
  const input = render();
  act(() => input.props.onChangeText('123456'));
  act(() => input.props.onChangeText('123456'));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith('123456');
});

it('deleting a digit and retyping it counts as a fresh answer', () => {
  const input = render();
  act(() => input.props.onChangeText('123456'));
  act(() => input.props.onChangeText('12345'));
  act(() => input.props.onChangeText('123456'));
  expect(onComplete).toHaveBeenCalledTimes(2);
});

it('an incomplete code is never submitted', () => {
  const input = render();
  act(() => input.props.onChangeText('12345'));
  expect(onComplete).not.toHaveBeenCalled();
});

it('reads as one field rather than six', () => {
  // Six separately focusable boxes is the classic screen-reader failure for this pattern.
  render('12');
  // Host elements only: react-test-renderer also surfaces the composite wrapper.
  const labelled = renderer.root.findAll(node => typeof node.type === 'string' && !!node.props.accessibilityLabel);
  expect(labelled).toHaveLength(1);
  expect(labelled[0].props.accessibilityLabel).toBe('Verification code');
});

it('shows the digits entered so far in the boxes', () => {
  render('12');
  const digits = renderer.root
    .findAllByType(require('react-native').Text)
    .map(node => node.props.children)
    .filter(Boolean);
  expect(digits).toEqual(['1', '2']);
});

it('stays reachable by the keyboard rather than hidden from it', () => {
  // opacity, not display: the field has to stay focusable for typing to work at all.
  const input = render();
  expect(input.props.editable).toBe(true);
  expect(input.props.keyboardType).toBe('number-pad');
  expect(input.props.textContentType).toBe('oneTimeCode');
  expect(input.props.autoComplete).toBe('sms-otp');
});
