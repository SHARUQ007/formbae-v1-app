import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function ReadingFeedStatus({ loading, error, hasMore, onLoadMore, empty = false }: {
  loading: boolean; error: boolean; hasMore: boolean; onLoadMore: () => void; empty?: boolean;
}) {
  return <View style={styles.status}>
    {loading ? <ActivityIndicator color={colors.gold} accessibilityLabel="Loading more reading" /> :
      error ? <><Text style={styles.copy}>{empty ? 'Stories couldn’t load. Check your connection and try again.' : 'More stories couldn’t load. Your current reads are still here.'}</Text><TouchableOpacity onPress={onLoadMore} style={styles.button} accessibilityRole="button" accessibilityLabel="Retry loading articles"><Text style={styles.action}>Try again</Text></TouchableOpacity></> :
        hasMore ? <TouchableOpacity onPress={onLoadMore} style={styles.button} accessibilityRole="button" accessibilityLabel="Load more articles"><Text style={styles.action}>More to explore →</Text></TouchableOpacity> :
          <Text style={styles.copy}>{empty ? 'No stories available right now. Check back soon.' : 'You’re all caught up. Come back for fresh stories.'}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  status: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, minHeight: 48, maxWidth: 240 },
  copy: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  action: { ...typography.label, color: colors.gold },
});
