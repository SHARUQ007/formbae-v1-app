import { useEffect, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useReadingFeed } from '../hooks/useReadingFeed';
import { useDailyReadingDate } from '../hooks/useDailyReadingDate';
import { peekReadingPage } from '../services/readingFeedService';
import type { ReportArticleSource } from '../utils/reportReading';
import { ReadingArticleCard, readingImageAt } from './ReadingArticleCard';
import { ReadingFeedStatus } from './ReadingFeedStatus';
import { ReportArticleReader } from './ReportArticleReader';
import { ReadingRoomArtwork } from './ReadingRoomArtwork';
import { ReadingSkeleton } from './ReadingSkeleton';

export function ReadingRoomPage({ onClose }: { onClose: () => void }) {
  const dateKey = useDailyReadingDate();
  const [selected, setSelected] = useState<ReportArticleSource | null>(null);
  return <Modal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={onClose}>
    <SafeAreaProvider><SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to accountability">
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessible={false}><Path d="m14 6-6 6 6 6" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </TouchableOpacity>
        <View style={styles.heading}><Text style={styles.title} accessibilityRole="header">The reading room</Text><Text style={styles.caption}>A little reading, every day</Text></View>
        <ReadingRoomArtwork size={36} />
      </View>
      <ReadingRoomFeed key={dateKey} onSelect={setSelected} />
      {selected ? <ReportArticleReader key={selected.url} source={selected} onClose={() => setSelected(null)} backLabel="Back to reading room" latestOnly /> : null}
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

function ReadingRoomFeed({ onSelect }: { onSelect: (article: ReportArticleSource) => void }) {
  const [initialPage] = useState(() => peekReadingPage(1));
  const feed = useReadingFeed([], initialPage);
  const { loadMore } = feed;
  useEffect(() => { if (!initialPage) loadMore(); }, [initialPage, loadMore]);
  return <FlatList testID="reading-room-feed" data={feed.articles} keyExtractor={article => article.url}
    contentContainerStyle={styles.feed} showsVerticalScrollIndicator={false}
    refreshing={feed.refreshing} onRefresh={feed.refresh}
    initialNumToRender={4} maxToRenderPerBatch={4} windowSize={7}
    onEndReachedThreshold={0.5} onEndReached={() => { if (!feed.error) loadMore(); }}
    ListHeaderComponent={<View style={styles.intro}>
      <Text style={styles.topics}>FOOD · MOVEMENT · RECOVERY</Text>
      <View style={styles.introHeading}>
        <Text style={styles.feedTitle} accessibilityRole="header">Latest stories</Text>
      </View>
      <Text style={styles.caption}>Ideas and research from Harvard Gazette.</Text>
      {feed.refreshError ? <TouchableOpacity onPress={feed.refresh} style={styles.refreshNotice} accessibilityRole="button" accessibilityLabel="Retry refreshing stories">
        <Text style={styles.caption}>Couldn’t refresh. Your stories are still here.</Text><Text style={styles.retry}>Try again</Text>
      </TouchableOpacity> : null}
    </View>}
    ListEmptyComponent={feed.loading || feed.refreshing ? <ReadingSkeleton /> : null}
    ListFooterComponent={!(feed.loading || feed.refreshing) || feed.articles.length ? <View style={styles.footer}><ReadingFeedStatus {...feed} empty={!feed.articles.length} onLoadMore={loadMore} /></View> : null}
    renderItem={({ item, index }) => <ReadingArticleCard article={item} imageUrl={readingImageAt(feed.articles, index)} onPress={() => onSelect(item)} />} />;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  heading: { flex: 1, minWidth: 0, gap: 3 },
  title: { ...typography.title, color: colors.ink },
  caption: { ...typography.caption, color: colors.inkMuted },
  feed: { padding: 20, gap: 20, paddingBottom: 32, width: '100%', maxWidth: 680, alignSelf: 'center' },
  intro: { gap: 9, paddingTop: 4, paddingBottom: 4 },
  topics: { ...typography.overline, fontSize: 9, letterSpacing: 1.2, color: colors.gold },
  introHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  feedTitle: { ...typography.hero, color: colors.ink },
  footer: { alignItems: 'center', paddingVertical: 12 },
  refreshNotice: { padding: 12, borderRadius: 12, backgroundColor: colors.panel, gap: 6 },
  retry: { ...typography.label, color: colors.gold },
});
