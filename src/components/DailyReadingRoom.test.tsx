jest.mock('../services/readingFeedService', () => ({ ...jest.requireActual('../services/readingFeedService'), loadReadingPage: jest.fn(), peekReadingPage: jest.fn() }));
import React from 'react';
import { AppState, FlatList, Modal, TouchableOpacity, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { DailyReadingRoom } from './DailyReadingRoom';
import { ReadingArticleCard } from './ReadingArticleCard';
import { loadReadingPage, peekReadingPage } from '../services/readingFeedService';

const articles = Array.from({ length: 12 }, (_, i) => ({ id: `article-${i}`, title: `Article ${i}`, url: `https://news.harvard.edu/article-${i}/`, publisher: 'Harvard Gazette', publishedAt: '2026-09-02' }));
beforeEach(() => {
  jest.mocked(peekReadingPage).mockReset();
  jest.mocked(loadReadingPage).mockReset().mockResolvedValue({ articles, nextPage: 2 });
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 10, 12));
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
const press = (tree: ReturnType<typeof create>, label: string) => tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityLabel === label)!.props.onPress();

it('renders preloaded cards immediately without fetching more on mount or when returning to My day', () => {
  jest.mocked(peekReadingPage).mockReturnValue({ articles, nextPage: 2 });
  let tree!: ReturnType<typeof create>;
  for (let visit = 0; visit < 2; visit += 1) {
    act(() => { tree = create(<DailyReadingRoom />); });
    expect(tree.root.findAllByType(ReadingArticleCard).map(node => node.props.article.id)).toEqual(['article-0', 'article-1', 'article-2']);
    expect(loadReadingPage).not.toHaveBeenCalled();
    act(() => tree.unmount());
  }
});

it('opens the preloaded full feed and continues from its next page', async () => {
  jest.mocked(peekReadingPage).mockReturnValue({ articles, nextPage: 2 });
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  await act(() => press(tree, 'Read more in the reading room'));
  expect(tree.root.findByType(FlatList).props.data).toEqual(articles);
  expect(loadReadingPage).not.toHaveBeenCalled();
  jest.mocked(loadReadingPage).mockResolvedValueOnce({ articles: [{ ...articles[0], id: 'next', url: 'https://news.harvard.edu/next/' }], nextPage: null });
  await act(() => tree.root.findByType(FlatList).props.onEndReached());
  expect(loadReadingPage).toHaveBeenCalledWith(2, expect.anything());
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(13);
  await act(() => tree.unmount());
});

it('preserves feed stories after a failed refresh and allows opening and returning to a story', async () => {
  jest.mocked(peekReadingPage).mockReturnValue({ articles, nextPage: 2 });
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  await act(() => press(tree, 'Read more in the reading room'));
  jest.mocked(loadReadingPage).mockRejectedValueOnce(new Error('Offline'));
  await act(() => tree.root.findByType(FlatList).props.onRefresh());
  expect(tree.root.findByType(FlatList).props.data).toEqual(articles);
  expect(tree.root.findByType(FlatList).props.refreshing).toBe(false);
  const card = tree.root.findByType(FlatList).props.renderItem({ item: articles[2], index: 2 });
  await act(() => card.props.onPress());
  expect(tree.root.findByType(WebView).props.source.uri).toBe(articles[2].url);
  await act(() => press(tree, 'Back to reading room'));
  expect(tree.root.findByType(FlatList).props.data).toEqual(articles);
  await act(() => tree.unmount());
});

it('shows only three latest articles and opens a vertically paginated reading page', async () => {
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  expect(tree.root.findAllByType(ReadingArticleCard).map(node => node.props.article.id)).toEqual(['article-0', 'article-1', 'article-2']);
  expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
  await act(() => press(tree, 'Read more in the reading room'));
  const list = tree.root.findByType(FlatList);
  expect(list.props.horizontal).not.toBe(true);
  expect(list.props.data).toHaveLength(12);
  jest.mocked(loadReadingPage).mockResolvedValueOnce({ articles: [articles[11], { ...articles[0], id: 'new', url: 'https://news.harvard.edu/new/' }], nextPage: null });
  await act(() => list.props.onEndReached());
  expect(tree.root.findByType(FlatList).props.data).toHaveLength(13);
  await act(() => press(tree, 'Back to accountability'));
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(tree.root.findAllByType(ReadingArticleCard)).toHaveLength(3);
  await act(() => tree.unmount());
});

it('opens the original article and returns to the same preview', async () => {
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  await act(() => press(tree, 'Read Article 0 from Harvard Gazette'));
  expect(tree.root.findByType(WebView).props.source.uri).toBe(articles[0].url);
  await act(() => press(tree, 'Back to reading room'));
  expect(tree.root.findAllByType(ReadingArticleCard)).toHaveLength(3);
  await act(() => tree.unmount());
});

it('retries a failed preview without substituting old curated articles', async () => {
  jest.mocked(loadReadingPage).mockRejectedValueOnce(new Error('Offline'));
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  expect(tree.root.findAllByType(ReadingArticleCard)).toHaveLength(0);
  await act(() => press(tree, 'Retry loading articles'));
  expect(tree.root.findAllByType(ReadingArticleCard)).toHaveLength(3);
  await act(() => tree.unmount());
});

it('reloads at midnight and cancels its timer when unmounted', async () => {
  jest.setSystemTime(new Date(2026, 8, 10, 23, 59, 59));
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  expect(loadReadingPage).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTime(1100));
  expect(loadReadingPage).toHaveBeenCalledTimes(2);
  await act(() => tree.unmount());
  await act(() => jest.runOnlyPendingTimers());
  expect(jest.getTimerCount()).toBe(0);
});

it('refreshes after a suspended app resumes on another day', async () => {
  let onChange!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onChange = listener; return { remove }; });
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<DailyReadingRoom />); });
  jest.setSystemTime(new Date(2026, 8, 11, 9));
  await act(() => onChange('active'));
  expect(loadReadingPage).toHaveBeenCalledTimes(2);
  await act(() => tree.unmount());
  expect(remove).toHaveBeenCalledTimes(1);
});
