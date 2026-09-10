import { ActivityIndicator, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import { PrimaryButton } from './PrimaryButton';
import { getAccountabilityBaeArtwork } from '../utils/accountabilityBaeArtwork';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  preference: 'male' | 'female';
  compact: boolean;
  busy: boolean;
  onChangePreference: () => void;
  onInviteFriend: () => void;
};

export function PartnerMatchWaitingCard({ preference, compact, busy, onChangePreference, onInviteFriend }: Props) {
  const artwork = getAccountabilityBaeArtwork('inactive');
  return (
    <View style={styles.layout}>
      <View style={styles.card}>
        <ImageBackground source={artwork} defaultSource={artwork} fadeDuration={0} resizeMode="cover" style={styles.artwork}>
          <LinearGradient
            colors={['rgba(5,6,10,0.94)', 'rgba(5,6,10,0.58)', 'rgba(5,6,10,0.12)']}
            locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill} pointerEvents="none"
          />
          <LinearGradient colors={['transparent', colors.panel]} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusLabel}>AUTO-MATCH ACTIVE</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>Finding your fit</Text>
              <Text style={styles.subtitle}>A partner who shares your goals and your rhythm.</Text>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.details} accessibilityLiveRegion="polite">
          <View style={[styles.preferenceRow, compact && styles.preferenceRowCompact]}>
            <View style={styles.preferenceCopy}>
              <View style={styles.savedLabel}>
                <Feather name="check-circle" size={13} color={colors.gold} />
                <Text style={styles.caption}>Preference saved</Text>
              </View>
              <Text style={styles.preference}>{preference === 'female' ? 'Female' : 'Male'} partner</Text>
            </View>
            <TouchableOpacity
              onPress={onChangePreference} disabled={busy} activeOpacity={0.7}
              style={[styles.changeButton, busy && styles.disabled]}
              accessibilityRole="button" accessibilityLabel="Change match preference" accessibilityState={{ disabled: busy }}
            >
              <Feather name="sliders" size={13} color={colors.inkMuted} />
              <Text style={styles.changeLabel}>Change</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.matchRow}>
            <View style={styles.searchIcon}>
              {busy ? <ActivityIndicator size="small" color={colors.gold} /> : <Feather name="search" size={19} color={colors.gold} />}
            </View>
            <View style={styles.matchCopy}>
              <Text style={styles.matchTitle}>{busy ? 'Updating your preference' : 'Matching your routine'}</Text>
              <Text style={styles.caption}>Shared goals. Similar training habits.</Text>
            </View>
          </View>
          <View style={styles.nextRow}>
            <Feather name="users" size={15} color={colors.inkMuted} />
            <Text style={styles.nextLabel}>Up next</Text>
            <Text style={styles.nextTitle}>Meet your partner</Text>
          </View>
        </View>
      </View>

      <View style={styles.inviteSection}>
        <Text style={styles.inviteTitle}>Have someone in mind?</Text>
        <Text style={styles.inviteBody}>Share challenges and a place on each other’s leaderboard.</Text>
        <PrimaryButton
          title="Invite a friend instead" icon="user-plus" onPress={onInviteFriend}
          disabled={busy} style={styles.inviteButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 18 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, overflow: 'hidden' },
  artwork: { backgroundColor: colors.panel },
  heroContent: { minHeight: 192, padding: 18, paddingBottom: 12, justifyContent: 'space-between', gap: 32 },
  heroContentCompact: { minHeight: 180, padding: 16, gap: 24 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(5,6,10,0.7)', borderWidth: 1, borderColor: 'rgba(240,206,120,0.22)' },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  statusLabel: { ...typography.overline, fontSize: 10, letterSpacing: 1.2, color: colors.gold, flexShrink: 1 },
  heroCopy: { maxWidth: '82%', gap: 6 },
  title: { ...typography.hero, color: colors.inkStrong },
  subtitle: { ...typography.label, fontWeight: '400', color: colors.inkMuted },
  details: { paddingHorizontal: 18, paddingBottom: 16 },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14, paddingTop: 8 },
  preferenceRowCompact: { flexWrap: 'wrap' },
  preferenceCopy: { flexGrow: 1, flexShrink: 1, gap: 4 },
  savedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  preference: { ...typography.bodyBold, color: colors.ink },
  changeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.panelRaised },
  changeLabel: { ...typography.caption, color: colors.ink },
  disabled: { opacity: 0.5 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 16 },
  searchIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  matchCopy: { flex: 1, minWidth: 0, gap: 3 },
  matchTitle: { ...typography.bodyBold, color: colors.ink },
  nextRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  nextLabel: { ...typography.caption, color: colors.inkMuted },
  nextTitle: { ...typography.caption, color: colors.ink, flexShrink: 1 },
  inviteSection: { gap: 5, paddingHorizontal: 2 },
  inviteTitle: { ...typography.subtitle, color: colors.ink },
  inviteBody: { ...typography.caption, color: colors.inkMuted },
  inviteButton: { backgroundColor: colors.gold, borderColor: colors.gold, borderRadius: 16, marginTop: 9 },
});
