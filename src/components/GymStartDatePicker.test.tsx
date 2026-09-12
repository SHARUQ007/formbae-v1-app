import { Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GymStartDatePicker } from './GymStartDatePicker';

it('browses years and months and only changes the date after confirmation', () => {
  const onChange = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymStartDatePicker value="2026-09-12" onChange={onChange} />); });
  const press = (label: string) => act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onPress());
  press('Gym membership start date');
  press('Choose year');
  press('Select 2024');
  press('Select Feb');
  press('Select 29 Feb 2024');
  expect(onChange).not.toHaveBeenCalled();
  act(() => tree.root.findByProps({ title: 'Confirm date' }).props.onPress());
  expect(onChange).toHaveBeenCalledWith('2024-02-29');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  act(() => tree.unmount());
});

it('discards a draft on cancel or Android back and reopens on the saved date', () => {
  const onChange = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymStartDatePicker value="2026-09-12" onChange={onChange} />); });
  const press = (label: string) => act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onPress());
  press('Gym membership start date');
  press('Next month');
  press('Select 20 Oct 2026');
  press('Cancel date selection');
  expect(onChange).not.toHaveBeenCalled();
  press('Gym membership start date');
  expect(tree.root.findByProps({ accessibilityLabel: 'Select 12 Sept 2026' }).props.accessibilityState.selected).toBe(true);
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(onChange).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
