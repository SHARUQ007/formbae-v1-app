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
  const [currentTrainer, setCurrentTrainer] = useState<CoachOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const hub = await fetchCoachHub();
      setCoaches(hub.trainers);
      setCurrentTrainer(hub.currentTrainer);
    } catch { setError('We couldn’t load your coaches. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visibleCoaches = useMemo(
    () => {
      const browseable = coaches.filter(coach => isIncludedCoach(coach) || coach.canSelect || Boolean(coachCheckoutPlan(coach)));
      if (currentTrainer && !browseable.some(coach => coach.trainerId === currentTrainer.trainerId)) return [currentTrainer, ...browseable];
      return browseable;
    },
    [coaches, currentTrainer],
  );
  const includedCoaches = useMemo(() => visibleCoaches.filter(coach => (
    isIncludedCoach(coach) || coach.trainerId === currentTrainer?.trainerId
  )).sort((a, b) => Number(b.trainerId === currentTrainer?.trainerId) - Number(a.trainerId === currentTrainer?.trainerId)), [currentTrainer?.trainerId, visibleCoaches]);
  const upgradeCoaches = useMemo(() => visibleCoaches.filter(coach => (
    !isIncludedCoach(coach) && coach.trainerId !== currentTrainer?.trainerId
  )), [currentTrainer?.trainerId, visibleCoaches]);

  const openCoach = (coach: CoachOption) => navigation.navigate('CoachUpgrade', { trainerId: coach.trainerId });

  const coachArtwork = (coach: CoachOption) => {
    const art = getCoachArtworkSource(coach);
    return art
      ? <StableImage source={art as Exclude<ImageSourcePropType, ImageSourcePropType[]>} resizeMode="cover" style={styles.portrait as ImageStyle} />
      : <View style={[styles.fallback, styles.portrait]}><Text style={styles.fallbackText}>{coach.name.slice(0, 1).toUpperCase()}</Text></View>;
  };

  const coachArrow = () => (
    <View style={styles.arrowFrame}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Path d="M6.5 3.5L12 9l-5.5 5.5" fill="none" stroke={colors.inkMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );

  const renderCoach = (coach: CoachOption, index: number, list: CoachOption[]) => {
    const isLast = index === list.length - 1;
    const current = coach.trainerId === currentTrainer?.trainerId;
    const included = isIncludedCoach(coach);
    return (
      <TouchableOpacity
        key={coach.trainerId}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`View ${coach.name} coach profile`}
        accessibilityHint={included || current ? 'Read about this coach before choosing' : 'Read about this coach before payment'}
        onPress={() => openCoach(coach)}
        style={[styles.coachRow, !isLast && styles.coachRowDivider]}
      >
        {coachArtwork(coach)}
        <View style={styles.copy}>
          <View style={styles.coachHeading}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.price}>{current ? 'Current' : coachAccessPrice(coach)}</Text>
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
                <Text style={styles.sectionTitle}>Included with your plan</Text>
                <Text style={styles.sectionNote}>Browse a profile, choose, or keep your current coach</Text>
              </View>
            </View>
            <View style={styles.coachList}>{includedCoaches.map((coach, index) => renderCoach(coach, index, includedCoaches))}</View>
          </View>
        ) : null}

        {!loading && upgradeCoaches.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.personalSectionTitle}>Coach upgrades</Text>
                <Text style={styles.sectionNote}>Open a profile, then pay only if you decide to upgrade</Text>
              </View>
            </View>
            <View style={styles.coachList}>{upgradeCoaches.map((coach, index) => renderCoach(coach, index, upgradeCoaches))}</View>
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
      {!loading && currentTrainer ? (
        <View style={styles.continueDock}>
          <PrimaryButton title={`Continue with ${currentTrainer.name}`} onPress={() => navigation.navigate('PaidWelcome')} />
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 34, paddingTop: 8, paddingBottom: 24 },
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  personalSectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  sectionNote: { color: colors.inkSubtle, fontSize: 12, lineHeight: 18, marginTop: 3 },
  coachList: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 14 },
  coachRow: { minHeight: 126, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
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
  continueDock: { paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  error: { color: colors.error, marginBottom: 12 },
});
