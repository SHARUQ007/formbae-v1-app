import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { GymPlace } from '../services/gymService';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  gym: GymPlace | null;
  saved: boolean;
  loading: boolean;
  onSelect: () => void;
  membership?: string;
  provider?: string;
};

export function ProfileGymSection({ gym, saved, loading, onSelect, membership, provider }: Props) {
  return <View style={styles.section}>
    <View style={styles.heading}>
      <Text style={styles.overline}>YOUR GYM</Text>

    </View>
    <View style={styles.content}>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>{saved ? gym?.name || 'Your gym is saved' : 'Your training place'}</Text>
        {loading ? <View style={styles.loading}><ActivityIndicator size="small" color={colors.gold} /><Text style={styles.caption}>Loading gym details…</Text></View>
          : <Text style={styles.caption} numberOfLines={1}>{saved ? gym?.address || 'Gym details are unavailable right now.' : 'Add your gym and membership.'}</Text>}
        {saved ? <Text style={styles.caption}>{[membership, provider].filter(Boolean).join(' · ') || 'Add membership details'}</Text> : null}
        {gym && !loading ? <Text style={styles.attribution}>Google Maps</Text> : null}
      </View>
    </View>
    <TouchableOpacity onPress={onSelect} style={[styles.action, !saved && styles.primaryAction]} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={saved ? 'Edit gym details' : 'Select your gym'}>
      <Text style={[styles.actionText, !saved && styles.primaryActionText]}>{saved ? 'Gym details' : 'Select your gym'}</Text>
      <Feather name="arrow-right" size={20} color={saved ? colors.gold : colors.onPrimary} />
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  section: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  overline: { ...typography.overline, color: colors.gold },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.panelRaised },
  savedText: { ...typography.caption, color: colors.gold },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  title: { ...typography.bodyBold, fontSize: 16, lineHeight: 23, color: colors.ink },
  caption: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  attribution: { fontSize: 12, lineHeight: 16, color: colors.inkSubtle },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.panelRaised },
  actionText: { ...typography.label, color: colors.gold, flexShrink: 1 },
  primaryAction: { minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.gold },
  primaryActionText: { ...typography.bodyBold, color: colors.onPrimary },
});
