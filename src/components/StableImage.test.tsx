import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';
import { StableImage } from './StableImage';
import * as bundledCache from '../services/bundledImageCache';

it('uses bundled artwork as its immediate placeholder and disables fading', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<StableImage source={42} />); });
  expect(tree.root.findByType(Image).props.defaultSource).toBe(42);
  expect(tree.root.findByType(Image).props.fadeDuration).toBe(0);
  act(() => tree.unmount());
});
it('preserves authenticated remote requests without turning them into placeholders', () => {
  const source = { uri: 'https://example.test/photo', headers: { Authorization: 'Bearer test' } };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<StableImage source={source} />); });
  expect(tree.root.findByType(Image).props.source).toBe(source);
  expect(tree.root.findByType(Image).props.defaultSource).toBeUndefined();
  act(() => tree.unmount());
});

it('recovers a missing local cache file without flashing the parent error state', () => {
  const cached = jest.spyOn(bundledCache, 'cachedBundledImage').mockReturnValue({ uri: 'file:///missing-art.jpg' });
  const invalidate = jest.spyOn(bundledCache, 'invalidateBundledImage').mockImplementation(() => undefined);
  const onError = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<StableImage source={99} onError={onError} />); });
  expect(tree.root.findByType(Image).props.source.uri).toBe('file:///missing-art.jpg');
  act(() => tree.root.findByType(Image).props.onError({ nativeEvent: { error: 'missing' } }));
  expect(tree.root.findByType(Image).props.source).toBe(99);
  expect(invalidate).toHaveBeenCalledWith(99);
  expect(onError).not.toHaveBeenCalled();
  act(() => tree.root.findByType(Image).props.onError({ nativeEvent: { error: 'offline' } }));
  expect(onError).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  cached.mockRestore();
  invalidate.mockRestore();
});
