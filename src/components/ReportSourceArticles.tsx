import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { getReportArticleArt } from '../utils/reportArtworkLibrary';
import { ReportIllustration } from './ReportIllustration';

import { ReportArticleReader, reportArticlePublisher as publisherOf } from './ReportArticleReader';
import { buildReportReading, type ReportArticleSource } from '../utils/reportReading';
export type { ReportArticleSource } from '../utils/reportReading';

function topicOf(source: ReportArticleSource) {
  const topic = source.topic?.trim().toLowerCase();
  if (topic === 'nutrition' || topic === 'training' || topic === 'recovery' || topic === 'habits') return topic;
  if (/sleep|recovery|rest/i.test(`${source.title} ${source.url}`)) return 'recovery';
  return /diet|food|nutrition|plate|protein/i.test(`${source.title} ${source.url}`) ? 'nutrition' : 'training';
}

function Arrow({ back = false }: { back?: boolean }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessible={false}><Path d={back ? 'm14 5-7 7 7 7' : 'M5 12h14m-6-6 6 6-6 6'} stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ReportSourceArticles({ sources, reportKey = '', family = 'weekly' }: { sources: ReportArticleSource[]; reportKey?: string; family?: 'diet' | 'weekly' }) {
  const [selected, setSelected] = useState<ReportArticleSource | null>(null);
  const articles = buildReportReading(sources, family, reportKey);
  const artwork = getReportArticleArt(articles.map(topicOf), reportKey, family);

  return (
    <View style={styles.section} testID="report-source-articles">
      <View style={styles.headingRow}>
        <View style={styles.headingArt}><ReportIllustration kind="reportReading" size={48} reportKey={reportKey} slot={family === 'weekly' ? 1 : 0} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>THE READING ROOM</Text>
          <Text style={styles.heading} accessibilityRole="header">Read & explore</Text>
          <Text style={styles.articleCount}>{articles.length} {articles.length === 1 ? 'article' : 'articles'}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
        {articles.map((source, index) => (
          <TouchableOpacity key={source.url} activeOpacity={0.85} style={styles.card} accessibilityRole="button"
            accessibilityLabel={`Read ${source.title} from ${publisherOf(source)}`}
            onPress={() => setSelected(source)}>
            {artwork[index] ? <Image source={artwork[index]} style={styles.cover} resizeMode="cover" accessible={false} /> : null}
            <View style={styles.cardCopy}>
              <Text style={styles.category}>{source.kind === 'reference' ? 'REPORT SOURCE' : 'FURTHER READING'} · {topicOf(source).toUpperCase()}</Text>
              <Text style={styles.title} numberOfLines={3}>{source.title}</Text>
              {source.description ? <Text style={styles.description} numberOfLines={3}>{source.description}</Text> : null}
              <View style={styles.cardFooter}><Text style={styles.publisher} numberOfLines={2}>{publisherOf(source)}</Text><Arrow /></View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {selected ? <ReportArticleReader key={selected.url} source={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, marginBottom: 24 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  headingArt: { flexShrink: 0, width: 48 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...reportTypography.label, color: colors.inkMuted, letterSpacing: 1.4, marginBottom: 8 },
  heading: { ...reportTypography.heading, color: colors.ink },
  articleCount: { ...reportTypography.label, color: colors.inkMuted, marginTop: 5 },
  cards: { gap: 14, paddingRight: 12, alignItems: 'stretch' },
  card: { width: 266, overflow: 'hidden', borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  cover: { width: '100%', height: 146, backgroundColor: colors.panelMuted },
  cardCopy: { padding: 18, flex: 1 },
  category: { ...reportTypography.label, color: colors.accent, letterSpacing: 1.2, marginBottom: 10 },
  title: { ...reportTypography.heading, color: colors.ink, fontSize: 19, lineHeight: 25, marginBottom: 10 },
  description: { ...reportTypography.body, color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  publisher: { ...reportTypography.label, color: colors.inkMuted, flex: 1 },
});
