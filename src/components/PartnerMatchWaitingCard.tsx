import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    const updateMotion = (reduceMotion: boolean) => {
      if (!mounted) return;
      animation?.stop();
      pulse.setValue(1);
      if (!reduceMotion) {
        animation = Animated.loop(Animated.sequence([
          Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true, isInteraction: false }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true, isInteraction: false }),
        ]));
        animation.start();
      }
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(updateMotion).catch(() => updateMotion(true));
    return () => {
      mounted = false;
      subscription.remove();
      animation?.stop();
    };
  }, [pulse]);
  return (
    <View style={styles.layout}>
      <ImageBackground source={artwork} defaultSource={artwork} fadeDuration={0} resizeMode="cover" style={styles.card}>
          <LinearGradient
            colors={['rgba(5,6,10,0.65)', 'rgba(5,6,10,0.18)', 'rgba(5,6,10,0.04)']}
            locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill} pointerEvents="none"
          />
          <LinearGradient colors={['rgba(5,6,10,0.08)', 'rgba(5,6,10,0.96)']} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <Animated.View style={[styles.statusDot, { opacity: pulse }]} />
              <Text style={styles.statusLabel}>{busy ? 'Updating search' : 'Matching in progress'}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>Finding your fit</Text>
              <Text style={styles.subtitle}>Your training partner will appear here.</Text>
            </View>
          </View>

        <View style={styles.details} accessibilityLiveRegion="polite">
          <View style={[styles.preferenceRow, compact && styles.preferenceRowCompact]}>
            <View style={styles.preferenceCopy}>
              <View style={styles.savedLabel}>
                <Text style={styles.caption}>Looking for</Text>
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


        </View>
      </ImageBackground>

      <View style={styles.inviteSection}>
        <PrimaryButton
          title="Invite a friend instead" icon="user-plus" onPress={onInviteFriend}
          disabled={busy} variant="primary" style={styles.inviteButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexGrow: 1, flexShrink: 0, gap: 12 },
  card: { flexGrow: 1, flexShrink: 0, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, overflow: 'hidden' },
  heroContent: { flexGrow: 1, minHeight: 280, padding: 18, paddingBottom: 22, justifyContent: 'space-between', gap: 20 },
  heroContentCompact: { minHeight: 260, padding: 16, gap: 24 },
  statusRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  statusLabel: { ...typography.caption, fontWeight: '600', color: colors.gold, flexShrink: 1 },
  heroCopy: { maxWidth: '100%', gap: 6 },
  title: { ...typography.hero, color: colors.inkStrong },
  subtitle: { ...typography.label, fontWeight: '400', color: colors.inkMuted },
  details: { paddingHorizontal: 18, paddingBottom: 2 },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  preferenceRowCompact: { flexWrap: 'wrap' },
  preferenceCopy: { flexGrow: 1, flexShrink: 1, gap: 4 },
  savedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  preference: { ...typography.bodyBold, color: colors.ink },
  changeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.panelRaised },
  changeLabel: { ...typography.caption, color: colors.ink },
  disabled: { opacity: 0.5 },
  inviteSection: { gap: 5, paddingHorizontal: 2 },
  inviteButton: { backgroundColor: colors.gold, borderColor: colors.gold, borderRadius: 16 },
});
