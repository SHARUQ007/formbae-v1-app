import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useDailyReadingDate } from '../hooks/useDailyReadingDate';
import type { ReportArticleSource } from '../utils/reportReading';
import { ReportIllustration } from './ReportIllustration';
import { ReportArticleReader } from './ReportArticleReader';
import { useReadingFeed } from '../hooks/useReadingFeed';
import { ReadingFeedStatus } from './ReadingFeedStatus';
import { ReadingArticleCard, readingImageAt } from './ReadingArticleCard';
import { ReadingRoomPage } from './ReadingRoomPage';
import { peekReadingPage } from '../services/readingFeedService';
import { ReadingRoomArtwork } from './ReadingRoomArtwork';
import { ReadingSkeleton } from './ReadingSkeleton';

export function DailyReadingRoom() {
  const dateKey = useDailyReadingDate();
  const [selected, setSelected] = useState<ReportArticleSource | null>(null);
  const [roomOpen, setRoomOpen] = useState(false);
  return <View style={styles.section} testID="daily-reading-room">
    <View style={styles.heading}>
      <ReportIllustration kind="reportReading" size={36} reportKey={dateKey} />
      <View style={styles.headingCopy}>
        <Text style={styles.title} accessibilityRole="header">The reading room</Text>
        <Text style={styles.subtitle}>The latest from Harvard Gazette</Text>
      </View>
    </View>
    <LatestReadingCards key={dateKey} onSelect={setSelected} />
    <TouchableOpacity style={styles.more} activeOpacity={0.75} onPress={() => setRoomOpen(true)} accessibilityRole="button" accessibilityLabel="Read more in the reading room" accessibilityHint="Opens the full article feed">
      <ReadingRoomArtwork />
      <View style={styles.headingCopy}><Text style={styles.moreTitle}>Read more</Text><Text style={styles.subtitle}>More stories to explore</Text></View>
      <View style={styles.moreArrow}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessible={false}><Path d="M5 12h14m-6-6 6 6-6 6" stroke={colors.onPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </View>
    </TouchableOpacity>
    {roomOpen ? <ReadingRoomPage onClose={() => setRoomOpen(false)} /> : null}
    {selected ? <ReportArticleReader key={selected.url} source={selected} onClose={() => setSelected(null)} backLabel="Back to reading room" latestOnly /> : null}
  </View>;
}

function LatestReadingCards({ onSelect }: { onSelect: (article: ReportArticleSource) => void }) {
  const [initialPage] = useState(() => peekReadingPage(1));
  const feed = useReadingFeed([], initialPage);
  const { loadMore } = feed;
  useEffect(() => { if (!initialPage) loadMore(); }, [initialPage, loadMore]);
  const articles = feed.articles.slice(0, 3);
  return <View style={styles.cards} testID="daily-reading-cards">
    {articles.map((article, index) => <ReadingArticleCard key={article.url} compact article={article} imageUrl={readingImageAt(articles, index)} onPress={() => onSelect(article)} />)}
    {!articles.length ? feed.loading ? <ReadingSkeleton compact /> : <ReadingFeedStatus loading={false} error={feed.error} hasMore={false} empty onLoadMore={loadMore} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 22 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted },
  cards: { gap: 10 },
  more: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.panel },
  moreTitle: { ...typography.bodyBold, color: colors.ink },
  moreArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
