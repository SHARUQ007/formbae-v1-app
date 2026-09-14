import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
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

  const renderCoach = (coach: CoachOption) => {
    const art = getCoachArtworkSource(coach);
    const included = isIncludedCoach(coach);
    return (
      <TouchableOpacity
        key={coach.trainerId}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`View ${coach.name} coach profile`}
        accessibilityHint={isIncludedCoach(coach) ? 'Read about this coach before choosing' : 'Read about this coach before payment'}
        onPress={() => navigation.navigate('CoachUpgrade', { trainerId: coach.trainerId })}
        style={[styles.card, included && styles.includedCard]}
      >
        <View style={styles.row}>
          {art ? <Image source={art} style={styles.portrait} /> : <View style={styles.fallback}><Feather name="user" size={26} color={colors.gold} /></View>}
          <View style={styles.copy}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.specialty}>{formatCoachLabel(coach)}</Text>
            <Text style={styles.price}>{coachAccessPrice(coach)}</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.inkSubtle} />
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {coach.description || 'Coaching and a workout routine shaped around your goals.'}
        </Text>
        {coach.languages.length ? <Text style={styles.languages} numberOfLines={1}>{coach.languages.join(' · ')}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader title="Choose your coach" onBack={() => navigation.navigate('PaidWelcome')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? <LoadingState message="Loading your coaches…" /> : null}

        {!loading && includedCoaches.length ? (
          <View style={[styles.section, styles.includedSection]}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.includedMark}>
                <Feather name="check" size={14} color={colors.onPrimary} />
              </View>
              <Text style={styles.sectionTitle}>INCLUDED WITH YOUR MEMBERSHIP</Text>
            </View>
            <Text style={styles.sectionNote}>Choose any included coach at no extra cost.</Text>
            {includedCoaches.map(renderCoach)}
          </View>
        ) : null}

        {!loading && personalCoaches.length ? (
          <View style={styles.section}>
            <Text style={styles.personalSectionTitle}>PERSONAL COACHING</Text>
            <Text style={styles.sectionNote}>Open a coach’s profile to learn about their approach and pricing.</Text>
            {personalCoaches.map(renderCoach)}
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
  list: { gap: 12, paddingBottom: 16 },
  section: { gap: 12 },
  includedSection: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(240,206,120,0.28)', backgroundColor: 'rgba(240,206,120,0.05)', padding: 12 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  includedMark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  sectionTitle: { color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  personalSectionTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  sectionNote: { color: colors.inkSubtle, fontSize: 13, lineHeight: 19, marginTop: -6 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14, gap: 10 },
  includedCard: { borderColor: 'rgba(240,206,120,0.42)', backgroundColor: colors.panelWarm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  portrait: { width: 66, height: 74, borderRadius: 18 },
  fallback: { width: 66, height: 74, borderRadius: 18, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  name: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  specialty: { color: colors.gold, fontSize: 12, lineHeight: 17 },
  price: { color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  description: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  languages: { color: colors.inkSubtle, fontSize: 12 },
  error: { color: colors.error, marginBottom: 12 },
});
