jest.mock('../services/readingFeedService', () => ({ ...jest.requireActual('../services/readingFeedService'), loadReadingPage: jest.fn().mockResolvedValue({ articles: [], nextPage: null }) }));
import React from 'react';
import { Linking, Modal, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ReportSourceArticles } from './ReportSourceArticles';

const source = { id: 'who', title: 'Healthy diet', publisher: 'World Health Organization', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet', description: 'The foundations of a varied eating pattern.', topic: 'nutrition' as const };
// Rejection fixture only; this URL is never executed.
// eslint-disable-next-line no-script-url
const unsafeUrl = 'javascript:alert(1)';

describe('report reading room', () => {
  it('deduplicates sources and excludes unsupported URLs', () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ReportSourceArticles sources={[source, { ...source, id: 'duplicate' }, { ...source, id: 'unsafe', url: unsafeUrl }]} />); });
    expect(tree!.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityLabel === 'Read Healthy diet from World Health Organization')).toHaveLength(1);
  });

  it('opens the original article in a native reader and returns to the report', () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ReportSourceArticles sources={[source]} />); });
    act(() => tree!.root.findByProps({ accessibilityLabel: 'Read Healthy diet from World Health Organization', accessibilityRole: 'button' }).props.onPress());
    const reader = tree!.root.findByType(WebView);
    const modal = tree!.root.findByType(Modal);
    expect(modal.findAllByType(SafeAreaProvider)).toHaveLength(1);
    expect(modal.findByType(SafeAreaView).props.edges).toEqual(['top', 'bottom', 'left', 'right']);
    expect(reader.props.source).toEqual({ uri: source.url });
    expect(reader.props.onShouldStartLoadWithRequest({ url: 'https://www.who.int/' })).toBe(true);
    expect(reader.props.onShouldStartLoadWithRequest({ url: 'file:///private' })).toBe(false);
    expect(reader.props.onShouldStartLoadWithRequest({ url: unsafeUrl })).toBe(false);
    act(() => tree!.root.findByProps({ accessibilityLabel: 'Back to report', accessibilityRole: 'button' }).props.onPress());
    expect(tree!.root.findAllByType(Modal)).toHaveLength(0);
    expect(tree!.root.findAllByType(WebView)).toHaveLength(0);
  });

  it('closes through Android back while the article is still loading', () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ReportSourceArticles sources={[source]} />); });
    act(() => tree!.root.findByProps({ accessibilityLabel: 'Read Healthy diet from World Health Organization', accessibilityRole: 'button' }).props.onPress());
    act(() => tree!.root.findByType(Modal).props.onRequestClose());
    expect(tree!.root.findAllByType(Modal)).toHaveLength(0);
  });

  it('offers the original page when a publisher cannot load in the reader', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ReportSourceArticles sources={[source]} />); });
    act(() => tree!.root.findByProps({ accessibilityLabel: 'Read Healthy diet from World Health Organization', accessibilityRole: 'button' }).props.onPress());
    act(() => tree!.root.findByType(WebView).props.onError());
    await act(async () => tree!.root.findByProps({ accessibilityLabel: 'Read article in browser', accessibilityRole: 'link' }).props.onPress());
    expect(open).toHaveBeenCalledWith(source.url);
    act(() => tree!.root.findByProps({ accessibilityLabel: 'Back to report', accessibilityRole: 'button' }).props.onPress());
    expect(tree!.root.findAllByType(Modal)).toHaveLength(0);
    open.mockRestore();
  });
});
