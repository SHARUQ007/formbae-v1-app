import { act, create } from 'react-test-renderer';
import { useAsync } from './useAsync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a late initial load cannot overwrite a completed refresh', async () => {
  const first = deferred<string>();
  const next = deferred<string>();
  const load = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
  let state!: ReturnType<typeof useAsync<string>>;
  function Harness() { state = useAsync(load); return null; }
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  expect(state.loading).toBe(true);
  await act(async () => { state.refresh().catch(() => undefined); });
  await act(async () => { next.resolve('fresh'); });
  await act(async () => { first.resolve('old'); });
  expect(state.data).toBe('fresh');
  expect(state.loading).toBe(false);
  act(() => tree.unmount());
});

test('a failed load can retry and a later refresh failure keeps visible content', async () => {
  const load = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce('saved').mockRejectedValueOnce(new Error('Offline'));
  let state!: ReturnType<typeof useAsync<string>>;
  function Harness() { state = useAsync(load); return null; }
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  expect(state.error).toBe('Offline');
  expect(state.loading).toBe(false);
  await act(async () => { await state.refresh(); });
  expect(state.data).toBe('saved');
  await act(async () => { await state.refresh(); });
  expect(state.data).toBe('saved');
  expect(state.error).toBeNull();
  act(() => tree.unmount());
});
