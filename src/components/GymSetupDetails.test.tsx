import { act, create } from 'react-test-renderer';
import { GymSetupDetails } from './GymSetupDetails';

it('saves membership dates, and provider', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipProvider: 'Cult', gymMembershipStart: '2026-09-01', gymMembershipExpiry: '2027-09-01' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).toHaveBeenCalledWith({ gymMembership: 'Active', gymMembershipProvider: 'Cult', gymMembershipStart: '2026-09-01', gymMembershipExpiry: '2027-09-01' });
  act(() => tree.unmount());
});
it('rejects an impossible expiry date before saving', () => {
  const save = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<GymSetupDetails initial={{ gymMembership: 'Active', gymMembershipExpiry: '2026-02-30' }} busy={false} onSave={save} />); });
  act(() => tree.root.findByProps({ title: 'Save details' }).props.onPress());
  expect(save).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Enter dates as YYYY-MM-DD.');
  act(() => tree.unmount());
});
