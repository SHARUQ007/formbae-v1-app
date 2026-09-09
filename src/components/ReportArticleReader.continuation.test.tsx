import React from 'react';
import { FlatList, Modal, Share } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { ReportArticleReader } from './ReportArticleReader';
import { loadReadingPage } from '../services/readingFeedService';

jest.mock('../services/readingFeedService', () => ({ ...jest.requireActual('../services/readingFeedService'), loadReadingPage: jest.fn() }));
const load = jest.mocked(loadReadingPage);
const source = { id: 'first', title: 'First article', publisher: 'NHS', url: 'https://www.nhs.uk/first/' };
const next = { id: 'next', title: 'A new publisher article', publisher: 'Harvard', url: 'https://nutritionsource.hsph.harvard.edu/next/', publishedAt: '2026-01-09' };
beforeEach(() => load.mockReset().mockResolvedValue({ articles: [next], nextPage: null }));

it('loads suggestions only at the end, opens the next article, and excludes visited URLs', async () => {
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ReportArticleReader source={source} onClose={close} />); });
  const web = () => tree.root.findByType(WebView);
  expect(tree.root.findAllByProps({ testID: 'article-read-next' })).toHaveLength(0);
  await act(() => {
    web().props.onMessage({ nativeEvent: { data: 'invalid' } });
    web().props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'reading-end', url: 'https://unrelated.example/' }) } });
  });
  expect(load).not.toHaveBeenCalled();
  await act(() => web().props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'reading-end', url: source.url }) } }));
  expect(load).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
  await act(() => tree.root.findByProps({ accessibilityLabel: 'Keep reading', accessibilityRole: 'button' }).props.onPress());
  let list = tree.root.findByType(FlatList);
  expect(list.props.data.map((item: typeof source) => item.url)).not.toContain(source.url);
  const card = list.props.renderItem({ item: next });
  act(() => card.props.onPress());
  expect(web().props.source.uri).toBe(next.url);
  expect(tree.root.findAllByProps({ testID: 'article-read-next' })).toHaveLength(0);
  // A delayed message from the old WebView must not reopen recommendations.
  await act(() => web().props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'reading-end', url: source.url }) } }));
  expect(tree.root.findAllByProps({ testID: 'article-read-next' })).toHaveLength(0);
  await act(() => web().props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'reading-end', url: next.url }) } }));
  await act(() => tree.root.findByProps({ accessibilityLabel: 'Keep reading', accessibilityRole: 'button' }).props.onPress());
  list = tree.root.findByType(FlatList);
  expect(list.props.data.map((item: typeof source) => item.url)).not.toContain(next.url);
  act(() => tree.root.findByProps({ accessibilityLabel: 'Hide suggestions', accessibilityRole: 'button' }).props.onPress());
  expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
  act(() => tree.root.findByProps({ accessibilityLabel: 'Previous article', accessibilityRole: 'button' }).props.onPress());
  expect(web().props.source.uri).toBe(source.url);
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('retries a failed article and shares the current source', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<ReportArticleReader source={source} onClose={() => {}} latestOnly />); });
  await act(() => tree.root.findByType(WebView).props.onError());
  expect(tree.root.findAllByType(WebView)).toHaveLength(0);
  act(() => tree.root.findByProps({ accessibilityLabel: 'Retry opening article', accessibilityRole: 'button' }).props.onPress());
  expect(tree.root.findByType(WebView).props.source.uri).toBe(source.url);
  await act(() => tree.root.findByProps({ accessibilityLabel: 'Share article', accessibilityRole: 'button' }).props.onPress());
  expect(share).toHaveBeenCalledWith({ title: source.title, message: `${source.title}\n${source.url}` });
  act(() => tree.unmount());
  share.mockRestore();
});

it('keeps the article open for failed subresources and offers retry when its renderer stops', async () => {
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<ReportArticleReader source={source} onClose={() => {}} />); });
  act(() => tree.root.findByType(WebView).props.onHttpError({ nativeEvent: { statusCode: 404, url: 'https://www.nhs.uk/missing-image.png' } }));
  expect(tree.root.findAllByType(WebView)).toHaveLength(1);
  await act(() => tree.root.findByType(WebView).props.onContentProcessDidTerminate());
  expect(tree.root.findByProps({ accessibilityLabel: 'Retry opening article', accessibilityRole: 'button' })).toBeTruthy();
  act(() => tree.unmount());
});

it('supports native scroll-end detection when a publisher does not send a message', async () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ReportArticleReader source={source} onClose={() => {}} />); });
  const scroll = (y: number) => tree.root.findByType(WebView).props.onScroll({ nativeEvent: { contentOffset: { y }, contentSize: { height: 2000 }, layoutMeasurement: { height: 700 } } });
  act(() => scroll(100));
  expect(load).not.toHaveBeenCalled();
  await act(() => scroll(1300));
  expect(load).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
