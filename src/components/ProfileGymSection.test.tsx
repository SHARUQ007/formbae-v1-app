import TestRenderer, { act } from 'react-test-renderer';
import { ProfileGymSection } from './ProfileGymSection';

it('offers gym selection before a gym has been saved', () => {
  const onSelect = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ProfileGymSection gym={null} saved={false} loading={false} onSelect={onSelect} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'Select your gym' }).props.onPress());
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Choose your gym');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Saved');
  act(() => tree.unmount());
});

it('shows the saved gym, address and attribution with a change action', () => {
  const onSelect = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ProfileGymSection gym={{ placeId: 'gym-1', name: 'Neighbourhood Strength Studio', address: '12 Park Road, Kochi' }} saved loading={false} onSelect={onSelect} />); });
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('Add membership details');
  expect(output).toContain('Neighbourhood Strength Studio');
  expect(output).toContain('12 Park Road, Kochi');
  expect(output).toContain('Google Maps');
  expect(output).not.toContain('Select your gym');
  act(() => tree.root.findByProps({ accessibilityLabel: 'Edit gym details' }).props.onPress());
  expect(onSelect).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('preserves the saved state while details load or are unavailable', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ProfileGymSection gym={null} saved loading onSelect={jest.fn()} />); });
  expect(JSON.stringify(tree.toJSON())).toContain('Loading gym details');
  act(() => tree.update(<ProfileGymSection gym={null} saved loading={false} onSelect={jest.fn()} />));
  expect(JSON.stringify(tree.toJSON())).toContain('Your gym is saved');
  expect(JSON.stringify(tree.toJSON())).toContain('Gym details are unavailable right now.');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Select your gym');
  act(() => tree.unmount());
});
