import { act, create } from 'react-test-renderer';
import { useReadingFeed } from './useReadingFeed';
import { loadReadingPage, type ReadingPage } from '../services/readingFeedService';

jest.mock('../services/readingFeedService', () => ({ ...jest.requireActual('../services/readingFeedService'), loadReadingPage: jest.fn() }));
const load = jest.mocked(loadReadingPage);
const one = { id: 'one', title: 'First article', url: 'https://www.nhs.uk/one/' };
const two = { id: 'two', title: 'Second article', url: 'https://www.nhs.uk/two/' };
let state!: ReturnType<typeof useReadingFeed>;
function Harness() { state = useReadingFeed([one]); return null; }
beforeEach(() => load.mockReset());

it('serializes pagination and deduplicates pages while keeping earlier cards visible', async () => {
  let finish!: (page: ReadingPage) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness />); });
  let first!: Promise<void>;
  act(() => { first = state.loadMore(); state.loadMore(); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(state.articles).toEqual([one]);
  await act(async () => { finish({ articles: [one, two], nextPage: 2 }); await first; });
  expect(state.articles).toEqual([one, two]);
  load.mockResolvedValueOnce({ articles: [two], nextPage: null });
  await act(() => state.loadMore());
  expect(load.mock.calls[1][0]).toBe(2);
  expect(state.hasMore).toBe(false);
  await act(() => state.loadMore());
  expect(load).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

it('retries the same page after failure and aborts outstanding work on close', async () => {
  load.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ articles: [two], nextPage: 2 });
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness />); });
  await act(() => state.loadMore());
  expect(state.error).toBe(true);
  expect(state.articles).toEqual([one]);
  await act(() => state.loadMore());
  expect(load.mock.calls.map(args => args[0])).toEqual([1, 1]);
  expect(state.error).toBe(false);
  load.mockImplementationOnce(() => new Promise(() => {}));
  act(() => { state.loadMore(); });
  const signal = load.mock.calls[2][1];
  act(() => tree.unmount());
  expect(signal.aborted).toBe(true);
});

it('keeps stories on refresh failure and replaces them only after a successful refresh', async () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness />); });
  let finish!: (page: ReadingPage) => void;
  load.mockRejectedValueOnce(new Error('Offline'));
  await act(() => state.refresh());
  expect(state.articles).toEqual([one]);
  expect(state.refreshError).toBe(true);
  load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let refreshing!: Promise<void>;
  act(() => { refreshing = state.refresh(); });
  expect(state.refreshing).toBe(true);
  expect(state.articles).toEqual([one]);
  await act(async () => { finish({ articles: [two], nextPage: 2 }); await refreshing; });
  expect(state.articles).toEqual([two]);
  expect(state.refreshError).toBe(false);
  expect(state.refreshing).toBe(false);
  load.mockResolvedValueOnce({ articles: [], nextPage: null });
  await act(() => state.loadMore());
  expect(load.mock.calls[2][0]).toBe(2);
  act(() => tree.unmount());
});

it('ignores late pagination after a refresh starts', async () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness />); });
  let finishOld!: (page: ReadingPage) => void;
  let finishNew!: (page: ReadingPage) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
  let old!: Promise<void>;
  let fresh!: Promise<void>;
  act(() => { old = state.loadMore(); });
  act(() => { fresh = state.refresh(); });
  expect(load.mock.calls[0][1].aborted).toBe(true);
  await act(async () => { finishOld({ articles: [one], nextPage: null }); await old; });
  expect(state.refreshing).toBe(true);
  await act(async () => { finishNew({ articles: [two], nextPage: 2 }); await fresh; });
  expect(state.articles).toEqual([two]);
  expect(state.hasMore).toBe(true);
  act(() => tree.unmount());
});
