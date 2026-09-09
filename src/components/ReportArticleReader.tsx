import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, ScrollView, Share, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { REPORT_READING_LIBRARY, type ReportArticleSource } from '../utils/reportReading';
import { useReadingFeed } from '../hooks/useReadingFeed';
import { peekReadingPage, readingUrlKey } from '../services/readingFeedService';
import { ARTICLE_END_SCRIPT } from '../utils/articleEndScript';
import { ReportIllustration } from './ReportIllustration';
import { ReadingFeedStatus } from './ReadingFeedStatus';

export function reportArticlePublisher(source: ReportArticleSource) {
  return source.publisher || source.url.replace(/^https:\/\//i, '').split('/')[0].replace(/^www\./, '');
}

export function ReportArticleReader({ source, onClose, backLabel = 'Back to report', latestOnly = false }: { source: ReportArticleSource; onClose: () => void; backLabel?: string; latestOnly?: boolean }) {
  const [current, setCurrent] = useState(source);
  const [opened, setOpened] = useState(() => new Set([readingUrlKey(source.url)]));
  const [atEnd, setAtEnd] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previous, setPrevious] = useState<ReportArticleSource[]>([]);
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const requestedMore = useRef(false);
  const [initialPage] = useState(() => peekReadingPage(1));
  const feed = useReadingFeed(latestOnly ? [] : [...REPORT_READING_LIBRARY.weekly, ...REPORT_READING_LIBRARY.diet], initialPage);
  const nextArticles = feed.articles.filter(article => !opened.has(readingUrlKey(article.url)));
  const { width, height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const reachEnd = () => {
    setAtEnd(true);
    if (!requestedMore.current || nextArticles.length < 6) {
      requestedMore.current = true;
      if (!feed.error) feed.loadMore();
    }
  };
  const openNext = (article: ReportArticleSource) => {
    setPrevious(history => [...history, current]);
    setCurrent(article);
    setOpened(seen => new Set([...seen, readingUrlKey(article.url)]));
    setAtEnd(false);
    setFailed(false);
    setExpanded(false);
    setProgress(0);
  };
  const pdf = /\.pdf(?:[?#]|$)/i.test(current.url);
  const { loadMore } = feed;
  useEffect(() => { if ((pdf || failed) && !initialPage) loadMore(); }, [pdf, failed, initialPage, loadMore]);
  const showMore = () => { setExpanded(true); if (!feed.articles.length && !feed.error) loadMore(); };
  const goPrevious = () => {
    const article = previous[previous.length - 1];
    if (!article) return;
    setPrevious(history => history.slice(0, -1));
    setCurrent(article);
    setAtEnd(false);
    setExpanded(false);
    setFailed(false);
    setProgress(0);
  };
  const shareArticle = async () => {
    try { await Share.share({ title: current.title, message: `${current.title}\n${current.url}` }); }
    catch { Alert.alert('Could not share article', 'Please try again.'); }
  };
  const openOriginal = async () => {
    try { await Linking.openURL(current.url); } catch { Alert.alert('Could not open article', 'Please try again when you are connected.'); }
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    {/* A native modal has its own window geometry, independent of the report's provider. */}
    <SafeAreaProvider style={styles.reader}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.reader} edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal>
        <View style={styles.header} testID="article-reader-header">
          <TouchableOpacity style={styles.back} hitSlop={6} onPress={onClose} accessibilityRole="button" accessibilityLabel={backLabel}>
            <Feather name="chevron-left" size={24} color={colors.ink} accessible={false} />
          </TouchableOpacity>
          <View style={styles.headingCopy}>
            <Text style={styles.publisher} numberOfLines={1}>{reportArticlePublisher(current)}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{current.title}</Text>
            {current.publishedAt ? <Text style={styles.subtitle}>Published {current.publishedAt}</Text> : null}
          </View>
          <TouchableOpacity style={styles.external} onPress={shareArticle} accessibilityRole="button" accessibilityLabel="Share article">
            <Feather name="share-2" size={19} color={colors.ink} accessible={false} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.external} hitSlop={6} onPress={openOriginal} accessibilityRole="link" accessibilityLabel="Open original source in browser">
            <Feather name="external-link" size={20} color={colors.ink} accessible={false} />
          </TouchableOpacity>
        </View>
        <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Reading progress" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.content}>
          {!failed && !pdf ? <WebView key={`${current.url}:${attempt}`} source={{ uri: current.url }} style={styles.webview} startInLoadingState
            injectedJavaScript={ARTICLE_END_SCRIPT}
            onMessage={event => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === 'reading-end' && typeof message.url === 'string' && readingUrlKey(message.url) === readingUrlKey(current.url)) reachEnd();
              } catch { /* Ignore unrelated messages from publisher pages. */ }
            }}
            onScroll={({ nativeEvent: event }) => {
              const scrollable = event.contentSize.height - event.layoutMeasurement.height;
              setProgress(scrollable > 0 ? Math.max(0, Math.min(100, Math.round(event.contentOffset.y / scrollable * 100))) : 0);
              if (event.contentOffset.y > 0 && event.contentSize.height > 0 && event.contentOffset.y + event.layoutMeasurement.height >= event.contentSize.height - 64) reachEnd();
            }}
            originWhitelist={['https://*']} sharedCookiesEnabled={false} incognito
            onShouldStartLoadWithRequest={request => request.url === 'about:blank' || /^https:\/\//i.test(request.url)}
            onError={() => setFailed(true)} onHttpError={event => { if (event.nativeEvent.statusCode >= 400 && readingUrlKey(event.nativeEvent.url) === readingUrlKey(current.url)) setFailed(true); }}
            onContentProcessDidTerminate={() => setFailed(true)} onRenderProcessGone={() => setFailed(true)}
            renderLoading={() => <View style={styles.loading}><ReportIllustration kind="reportReading" size={48} /><Text style={styles.publisher}>Opening your read</Text><Text style={styles.description}>{reportArticlePublisher(current)}</Text><ActivityIndicator color={colors.gold} accessibilityLabel="Loading source article" /></View>} />
            : <ScrollView contentContainerStyle={styles.unavailable}>
              <Text style={styles.title}>{current.title}</Text>
              <Text style={styles.description}>{pdf ? 'This reading is a PDF. Open the complete document in your browser.' : 'This publisher could not load in the reader. Open the original article in your browser.'}</Text>
              {!pdf ? <TouchableOpacity style={styles.retryButton} onPress={() => { setFailed(false); setAttempt(value => value + 1); }} accessibilityRole="button" accessibilityLabel="Retry opening article"><Text style={styles.retryText}>Try again</Text></TouchableOpacity> : null}
              <TouchableOpacity style={styles.browserButton} onPress={openOriginal} accessibilityRole="link" accessibilityLabel="Read article in browser">
                <Text style={styles.publisher}>Open article</Text><Feather name="external-link" size={20} color={colors.ink} accessible={false} />
              </TouchableOpacity>
            </ScrollView>}
        </View>
        <View style={styles.readerTools} testID={atEnd || failed || pdf || expanded ? 'article-read-next' : undefined}>
          {previous.length ? <TouchableOpacity onPress={goPrevious} style={styles.toolButton} accessibilityRole="button" accessibilityLabel="Previous article"><Feather name="arrow-left" size={16} color={colors.inkMuted} /><Text style={styles.subtitle}>Previous article</Text></TouchableOpacity> : <Text style={styles.subtitle}>{atEnd ? 'A little reading, every day' : 'From the original publisher'}</Text>}
          <TouchableOpacity onPress={expanded ? () => setExpanded(false) : showMore} style={styles.toolButton} accessibilityRole="button" accessibilityLabel={expanded ? 'Hide suggestions' : atEnd ? 'Keep reading' : 'Explore more stories'} accessibilityState={{ expanded }}><Text style={styles.nextTopic}>{expanded ? 'Close' : atEnd ? 'Keep reading' : 'More stories'}</Text><Feather name={expanded ? 'chevron-down' : 'chevron-up'} size={18} color={colors.gold} /></TouchableOpacity>
        </View>
        {expanded ? <View style={[styles.readNext, { height: Math.min(270, height * 0.4) }]} testID="article-suggestions">
          <View style={styles.nextHeading}><Text style={styles.publisher}>Your next read</Text><Text style={styles.subtitle}>Food · Movement · Recovery</Text></View>
          <FlatList horizontal data={nextArticles} keyExtractor={article => readingUrlKey(article.url)} showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nextList} onEndReachedThreshold={0.5} onEndReached={() => { if (!feed.error) feed.loadMore(); }}
            renderItem={({ item }) => <TouchableOpacity style={[styles.nextCard, { width: Math.min(240, width - 64) }]} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={`Read next: ${item.title} from ${reportArticlePublisher(item)}`} onPress={() => openNext(item)}>
              <Text style={styles.nextTopic}>{(item.topic || 'Further reading').toUpperCase()}</Text>
              <Text style={styles.nextTitle} numberOfLines={3}>{item.title}</Text>
              <Text style={styles.nextPublisher} numberOfLines={2}>{reportArticlePublisher(item)}{item.publishedAt ? ` · ${item.publishedAt}` : ''}</Text>
            </TouchableOpacity>}
            ListFooterComponent={<ReadingFeedStatus {...feed} empty={!nextArticles.length} onLoadMore={feed.loadMore} />} />
        </View> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  reader: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bg },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.panel, flexShrink: 0 },
  headingCopy: { flex: 1, minWidth: 0, gap: 3 },
  publisher: { ...reportTypography.bodyStrong, color: colors.ink },
  subtitle: { ...reportTypography.label, color: colors.inkMuted },
  external: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1 },
  webview: { flex: 1, backgroundColor: colors.bg },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.bg },
  unavailable: { padding: 28, gap: 18 },
  title: { ...reportTypography.heading, color: colors.ink },
  description: { ...reportTypography.body, color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  browserButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: colors.panel, borderRadius: 12 },
  readNext: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, gap: 8, backgroundColor: colors.bg },
  nextHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  nextList: { paddingHorizontal: 16, gap: 10 },
  nextCard: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.panel, gap: 8 },
  nextTopic: { ...reportTypography.label, fontSize: 10, color: colors.gold },
  nextTitle: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 20, color: colors.ink },
  nextPublisher: { ...reportTypography.label, fontSize: 10, color: colors.inkMuted, marginTop: 'auto' },
  progressTrack: { height: 2, backgroundColor: colors.border },
  progressFill: { height: 2, backgroundColor: colors.gold },
  readerTools: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 },
  toolButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  retryText: { ...reportTypography.bodyStrong, color: colors.onPrimary },
});
