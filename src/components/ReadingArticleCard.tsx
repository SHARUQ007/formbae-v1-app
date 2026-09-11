import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { ReportArticleSource } from '../utils/reportReading';

// Keep a publisher's reused cover on its first article only; never substitute stock art.
export function readingImageAt(articles: ReportArticleSource[], index: number) {
  const url = articles[index]?.imageUrl;
  const key = (value?: string) => value?.split(/[?#]/)[0];
  return url && !articles.slice(0, index).some(article => key(article.imageUrl) === key(url)) ? url : undefined;
}

export function ReadingArticleCard({ article, imageUrl, compact = false, onPress }: {
  article: ReportArticleSource; imageUrl?: string; compact?: boolean; onPress: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const showImage = imageUrl && failedImage !== imageUrl;
  const topic = article.topic === 'training' ? 'Movement' : article.topic === 'nutrition' ? 'Food' : article.topic === 'recovery' ? 'Recovery' : 'Reading';
  const date = article.publishedAt ? new Date(`${article.publishedAt}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.85}
    accessibilityRole="button" accessibilityLabel={`Read ${article.title} from ${article.publisher}`}
    style={[styles.card, compact && styles.compact]}>
    {!compact && showImage ? <Image source={{ uri: imageUrl }} style={styles.cover} resizeMode="cover" accessible={false} onError={() => setFailedImage(imageUrl)} /> : null}
    <View style={[styles.copy, compact && styles.compactCopy]}>
      {compact ? <View style={styles.compactMeta}><Text style={styles.topic}>{topic}</Text><Text style={styles.source}>{article.publisher}</Text></View> : <View style={styles.storyMeta}>
        <Text style={styles.topic}>{topic}</Text>
        <Text style={styles.source}>{article.publisher}</Text>
      </View>}
      <Text style={[styles.title, compact && styles.compactTitle]} numberOfLines={compact ? 3 : undefined}>{article.title}</Text>
      {compact ? (date ? <Text style={styles.date}>{date}</Text> : null) : <View style={styles.footer}>
        <View style={styles.published}>
          {date ? <Text style={styles.publishedDate}>{date}</Text> : null}
        </View>
        <View style={styles.readAction}>
          <Text style={styles.readLabel}>Read article</Text>
          <View style={styles.readArrow}><Svg width={17} height={17} viewBox="0 0 24 24" fill="none" accessible={false}>
            <Path d="M5 12h14m-6-6 6 6-6 6" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg></View>
        </View>
      </View>}
    </View>
    {compact && showImage ? <Image source={{ uri: imageUrl }} style={styles.thumbnail} resizeMode="cover" accessible={false} onError={() => setFailedImage(imageUrl)} /> : null}
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  compact: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderRadius: 16 },
  cover: { width: '100%', aspectRatio: 2.35, backgroundColor: colors.panelRaised },
  thumbnail: { width: 76, height: 80, borderRadius: 10, flexShrink: 0 },
  copy: { padding: 16, gap: 9 },
  compactCopy: { flex: 1, minWidth: 0, padding: 0, gap: 5 },
  source: { ...typography.caption, fontSize: 10, color: colors.inkMuted },
  title: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.ink },
  compactTitle: { ...typography.bodyBold, fontSize: 14, lineHeight: 20 },
  date: { ...typography.caption, fontSize: 11, color: colors.inkSubtle },
  storyMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topic: { ...typography.overline, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.gold },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 9, marginTop: 1 },
  published: { gap: 2 },
  publishedDate: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  readAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readLabel: { ...typography.label, fontSize: 11, color: colors.ink },
  readArrow: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  compactMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 3 },
});
