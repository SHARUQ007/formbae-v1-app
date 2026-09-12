import { act, create } from 'react-test-renderer';
import { GymSetupDetails } from './GymSetupDetails';

it('infers the saved duration and preserves membership dates and provider', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipProvider: 'Cult', gymMembershipStart: '2026-09-01', gymMembershipExpiry: '2027-09-01' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenCalledWith({ gymMembership: 'Active', gymMembershipProvider: 'Cult', gymMembershipStart: '2026-09-01', gymMembershipMonths: '12', gymMembershipExpiry: '2027-09-01' });
  expect(tree.root.findByProps({ accessibilityLabel: '12 months' }).props.accessibilityState.selected).toBe(true);
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Gym membership expiry date' })).toHaveLength(0);
  act(() => tree.unmount());
});
it('requires a selected start date before saving', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipExpiry: '2026-02-30' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Choose your start date.');
  act(() => tree.unmount());
});

it('saves the selected calendar date and computes the duration including month-end starts', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipStart: '2026-01-01' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Gym membership start date' }).props.onPress());
  act(() => tree.root.findByProps({ accessibilityLabel: 'Select 31 Jan 2026' }).props.onPress());
  act(() => tree.root.findByProps({ title: 'Confirm date' }).props.onPress());
  act(() => tree.root.findByProps({ accessibilityLabel: '1 month' }).props.onPress());
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ gymMembershipStart: '2026-01-31', gymMembershipMonths: '1', gymMembershipExpiry: '2026-02-28' }));
  act(() => tree.unmount());
});

it('accepts custom months and blocks invalid durations', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipStart: '2026-09-12' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Custom' }).props.onPress());
  for (const value of ['0', '-1', '2.5', 'abc', '121']) {
    act(() => tree.root.findByProps({ accessibilityLabel: 'Subscription duration in months' }).props.onChangeText(value));
    act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
    expect(save).not.toHaveBeenCalled();
  }
  act(() => tree.root.findByProps({ accessibilityLabel: 'Subscription duration in months' }).props.onChangeText('9'));
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ gymMembershipMonths: '9', gymMembershipExpiry: '2027-06-12' }));
  act(() => tree.unmount());
});

it('retains older irregular expiry dates when only the provider changes', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipStart: '2026-09-01', gymMembershipExpiry: '2027-08-31' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Membership plan or provider' }).props.onChangeText('Cult'));
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ gymMembershipProvider: 'Cult', gymMembershipExpiry: '2027-08-31', gymMembershipMonths: '' }));
  act(() => tree.unmount());
});

it('saves a day pass for a single date and clears dates for not joined', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipStart: '2026-09-12', gymMembershipMonths: '6' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Day pass' }).props.onPress());
  expect(tree.root.findAllByProps({ accessibilityLabel: '6 months' })).toHaveLength(0);
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ gymMembership: 'Day pass', gymMembershipStart: '2026-09-12', gymMembershipExpiry: '2026-09-12', gymMembershipMonths: '' }));
  act(() => tree.root.findByProps({ accessibilityLabel: 'Not joined' }).props.onPress());
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ gymMembership: 'Not joined', gymMembershipStart: '', gymMembershipExpiry: '', gymMembershipMonths: '' }));
  act(() => tree.unmount());
});
