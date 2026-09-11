import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

/** Static placeholders avoid flashing animation and respect reduced motion. */
export function ReadingSkeleton({ compact = false }: { compact?: boolean }) {
  return <View style={styles.list} accessible accessibilityLabel="Loading latest stories" testID="reading-skeleton">
    {Array.from({ length: compact ? 3 : 2 }, (_, index) => <View key={index} style={[styles.card, compact && styles.compact]}>
      {!compact ? <View style={styles.cover} /> : null}
      <View style={styles.copy}><View style={styles.short} /><View style={styles.line} /><View style={styles.line} /><View style={styles.short} /></View>
      {compact ? <View style={styles.thumbnail} /> : null}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  compact: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  cover: { width: '100%', aspectRatio: 2.35, backgroundColor: colors.panelRaised },
  copy: { padding: 16, gap: 10, flex: 1 },
  line: { height: 12, borderRadius: 4, backgroundColor: colors.panelRaised },
  short: { height: 8, width: '45%', borderRadius: 4, backgroundColor: colors.panelRaised },
  thumbnail: { width: 76, height: 80, borderRadius: 10, backgroundColor: colors.panelRaised },
});
