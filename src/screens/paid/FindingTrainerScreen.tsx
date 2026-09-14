import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchCoachHub, changeCoach } from '../../services/trainerService';
import { useAuthStore } from '../../store/authStore';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import { resolvePaidInitialRoute } from '../../utils/routing';
import { coachCheckoutPlan, coachPricePaise, formatCoachLabel } from '../../utils/coachPresentation';
import type { CoachOption } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

const monthlyPrice = (coach: CoachOption) => `₹${Math.round(coachPricePaise(coach) / 100).toLocaleString('en-IN')}/mo`;

export function FindingTrainerScreen({ navigation }: NativeStackScreenProps<PaidStackParamList, 'FindingTrainer'>) {
  const { refreshStatus } = useAuthStore();
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const hub = await fetchCoachHub();
      setCoaches(hub.trainers);
      setSelected((current) => current || hub.currentTrainer?.trainerId || '');
    } catch { setError('We couldn’t load your coaches. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A coach already covered can be picked outright; anyone else is an upgrade.
  const readyCoaches = useMemo(() => coaches.filter((coach) => coach.canSelect), [coaches]);
  const upgradeCoaches = useMemo(
    () => coaches.filter((coach) => !coach.canSelect && coachCheckoutPlan(coach)),
    [coaches],
  );

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true); setError('');
    try {
      await changeCoach(selected);
      const fresh = await refreshStatus();
      // An AI coach asks its own questions before any plan is built.
      navigation.replace(resolvePaidInitialRoute(fresh?.recommendedNextScreen || 'paid_welcome'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your coach couldn’t be saved. Please try again.'); }
    finally { setSaving(false); }
  };

  const renderCoach = (coach: CoachOption, upgrade: boolean) => {
    const chosen = !upgrade && selected === coach.trainerId;
    const art = getCoachArtworkSource(coach);
    return (
      <TouchableOpacity
        key={coach.trainerId}
        disabled={saving}
        activeOpacity={0.85}
        accessibilityRole={upgrade ? 'button' : 'radio'}
        accessibilityState={{ selected: chosen, disabled: saving }}
        accessibilityLabel={`${coach.name}, ${formatCoachLabel(coach)}${upgrade ? `, ${monthlyPrice(coach)}` : ''}`}
        accessibilityHint={upgrade ? 'Opens their profile, then payment' : undefined}
        onPress={() => (upgrade ? navigation.navigate('CoachUpgrade', { trainerId: coach.trainerId }) : setSelected(coach.trainerId))}
        style={[styles.card, chosen && styles.chosen]}
      >
        <View style={styles.row}>
          {art ? <Image source={art} style={styles.portrait} /> : <View style={styles.fallback}><Feather name="user" size={26} color={colors.gold} /></View>}
          <View style={styles.copy}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.specialty}>{formatCoachLabel(coach)}</Text>
            {upgrade ? <Text style={styles.price}>{monthlyPrice(coach)}</Text> : null}
          </View>
          {upgrade
            ? <Feather name="chevron-right" size={22} color={colors.inkSubtle} />
            : <Feather name={chosen ? 'check-circle' : 'circle'} size={24} color={chosen ? colors.gold : colors.inkSubtle} />}
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
      <ScreenHeader title="Choose your coach" onBack={saving ? undefined : () => navigation.navigate('PaidWelcome')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? <LoadingState message="Loading your coaches…" /> : null}

        {!loading && readyCoaches.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>INCLUDED IN YOUR MEMBERSHIP</Text>
            <Text style={styles.sectionNote}>Ready to start today, at no extra cost.</Text>
            {readyCoaches.map((coach) => renderCoach(coach, false))}
          </View>
        ) : null}

        {!loading && upgradeCoaches.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UPGRADE TO A PERSONAL COACH</Text>
            {upgradeCoaches.map((coach) => renderCoach(coach, true))}
          </View>
        ) : null}

        {!loading && !coaches.length ? (
          <View style={styles.card}>
            <Text style={styles.name}>Your coaches aren’t available right now</Text>
            <Text style={styles.description}>Your membership and setup are saved. Check again shortly.</Text>
            <PrimaryButton title="Check again" variant="secondary" onPress={load} />
          </View>
        ) : null}
      </ScrollView>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        title="Continue with this coach"
        icon="arrow-right"
        iconPosition="trailing"
        onPress={save}
        loading={saving}
        disabled={!selected || loading}
        style={styles.cta}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingBottom: 4 },
  section: { gap: 12 },
  sectionTitle: { color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  sectionNote: { color: colors.inkSubtle, fontSize: 13, lineHeight: 19, marginTop: -6 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14, gap: 10 },
  chosen: { borderColor: colors.gold, backgroundColor: colors.panelWarm },
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
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
