import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType, type ImageStyle } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { StableImage } from '../../components/StableImage';
import { LoadingState } from '../../components/States';
import { fetchCoachHub } from '../../services/trainerService';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import { coachAccessPrice, coachCheckoutPlan, formatCoachLabel, isIncludedCoach } from '../../utils/coachPresentation';
import type { CoachOption } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

export function FindingTrainerScreen({ navigation }: NativeStackScreenProps<PaidStackParamList, 'FindingTrainer'>) {
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const hub = await fetchCoachHub();
      setCoaches(hub.trainers);
    } catch { setError('We couldn’t load your coaches. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visibleCoaches = useMemo(
    () => coaches.filter(coach => isIncludedCoach(coach) || coach.canSelect || Boolean(coachCheckoutPlan(coach))),
    [coaches],
  );
  const includedCoaches = useMemo(() => visibleCoaches.filter(isIncludedCoach), [visibleCoaches]);
  const personalCoaches = useMemo(() => visibleCoaches.filter(coach => !isIncludedCoach(coach)), [visibleCoaches]);

  const openCoach = (coach: CoachOption) => navigation.navigate('CoachUpgrade', { trainerId: coach.trainerId });

  const coachArtwork = (coach: CoachOption, featured = false) => {
    const art = getCoachArtworkSource(coach);
    const sizeStyle = featured ? styles.featuredPortrait : styles.portrait;
    return art
      ? <StableImage source={art as Exclude<ImageSourcePropType, ImageSourcePropType[]>} resizeMode="cover" style={sizeStyle as ImageStyle} />
      : <View style={[styles.fallback, sizeStyle]}><Text style={styles.fallbackText}>{coach.name.slice(0, 1).toUpperCase()}</Text></View>;
  };

  const coachArrow = () => (
    <View style={styles.arrowFrame}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Path d="M6.5 3.5L12 9l-5.5 5.5" fill="none" stroke={colors.inkMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );

  const renderIncludedCoach = (coach: CoachOption) => (
    <TouchableOpacity
      key={coach.trainerId}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`View ${coach.name} coach profile`}
      accessibilityHint="Read about this coach before choosing"
      onPress={() => openCoach(coach)}
      style={styles.featuredCard}
    >
      <View style={styles.featuredRow}>
        {coachArtwork(coach, true)}
        <View style={styles.featuredCopy}>
          <View style={styles.includedBadge}><Text style={styles.includedBadgeText}>Included</Text></View>
          <Text style={styles.featuredName}>{coach.name}</Text>
          <Text style={styles.specialty}>{formatCoachLabel(coach)}</Text>
          <Text style={styles.featuredDescription} numberOfLines={3}>
            {coach.description || 'Coaching and a workout routine shaped around your goals.'}
          </Text>
        </View>
      </View>
      <View style={styles.profilePrompt}>
        <Text style={styles.profilePromptText}>View profile and choose</Text>
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Path d="M3 9h11M10 5l4 4-4 4" fill="none" stroke={colors.gold} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </TouchableOpacity>
  );

  const renderPersonalCoach = (coach: CoachOption, index: number) => {
    const isLast = index === personalCoaches.length - 1;
    return (
      <TouchableOpacity
        key={coach.trainerId}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`View ${coach.name} coach profile`}
        accessibilityHint="Read about this coach before payment"
        onPress={() => openCoach(coach)}
        style={[styles.coachRow, !isLast && styles.coachRowDivider]}
      >
        {coachArtwork(coach)}
        <View style={styles.copy}>
          <View style={styles.coachHeading}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.price}>{coachAccessPrice(coach)}</Text>
          </View>
          <Text style={styles.specialty}>{formatCoachLabel(coach)}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {coach.description || 'Personal coaching shaped around your goals.'}
          </Text>
          {coach.languages.length ? <Text style={styles.languages} numberOfLines={1}>{coach.languages.join(' · ')}</Text> : null}
        </View>
        {coachArrow()}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader title="Choose your coach" onBack={() => navigation.navigate('PaidWelcome')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? <LoadingState message="Loading your coaches…" /> : null}

        {!loading && includedCoaches.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Included in your plan</Text>
                <Text style={styles.sectionNote}>Ready to choose at no extra cost</Text>
              </View>
              <Text style={styles.sectionCount}>{includedCoaches.length} {includedCoaches.length === 1 ? 'option' : 'options'}</Text>
            </View>
            {includedCoaches.map(renderIncludedCoach)}
          </View>
        ) : null}

        {!loading && personalCoaches.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.personalSectionTitle}>Personal coaches</Text>
                <Text style={styles.sectionNote}>Explore their approach before you pay</Text>
              </View>
              <Text style={styles.sectionCount}>{personalCoaches.length} available</Text>
            </View>
            <View style={styles.coachList}>{personalCoaches.map(renderPersonalCoach)}</View>
          </View>
        ) : null}

        {!loading && !visibleCoaches.length ? (
          <View style={styles.card}>
            <Text style={styles.name}>Your coaches aren’t available right now</Text>
            <Text style={styles.description}>Your membership and setup are saved. Check again shortly.</Text>
            <PrimaryButton title="Check again" variant="secondary" onPress={load} />
          </View>
        ) : null}
      </ScrollView>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 34, paddingTop: 8, paddingBottom: 24 },
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  personalSectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  sectionNote: { color: colors.inkSubtle, fontSize: 12, lineHeight: 18, marginTop: 3 },
  sectionCount: { color: colors.inkSubtle, fontSize: 12, fontWeight: '600', paddingBottom: 2 },
  featuredCard: { overflow: 'hidden', borderRadius: 24, backgroundColor: colors.panelWarm },
  featuredRow: { minHeight: 168, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  featuredPortrait: { width: 104, height: 132, borderRadius: 18, backgroundColor: colors.panelRaised },
  featuredCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  includedBadge: { alignSelf: 'flex-start', borderRadius: 99, backgroundColor: colors.gold, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 9 },
  includedBadgeText: { color: colors.onPrimary, fontSize: 10, lineHeight: 13, fontWeight: '800' },
  featuredName: { color: colors.ink, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.35 },
  featuredDescription: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  profilePrompt: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(240,206,120,0.22)', paddingHorizontal: 16 },
  profilePromptText: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  coachList: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  coachRow: { minHeight: 126, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  coachRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14, gap: 10 },
  portrait: { width: 76, height: 92, borderRadius: 16, backgroundColor: colors.panelRaised },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  fallbackText: { color: colors.gold, fontSize: 24, fontWeight: '700' },
  copy: { flex: 1 },
  coachHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  name: { flexShrink: 1, color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.15 },
  specialty: { color: colors.gold, fontSize: 12, lineHeight: 17, marginTop: 2 },
  price: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  description: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  languages: { color: colors.inkSubtle, fontSize: 11, marginTop: 6 },
  arrowFrame: { width: 24, alignItems: 'flex-end', justifyContent: 'center' },
  error: { color: colors.error, marginBottom: 12 },
});
