import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { fetchCoachHub, changeCoach } from '../../services/trainerService';
import { useAuthStore } from '../../store/authStore';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import type { CoachOption } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

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
      setCoaches(hub.trainers.filter(coach => coach.canSelect && !coach.requiresUpgrade));
      setSelected(hub.currentTrainer?.trainerId || '');
    } catch { setError('We couldn’t load your coaches. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!selected || saving) return;
    setSaving(true); setError('');
    try {
      await changeCoach(selected);
      await refreshStatus();
      navigation.replace('PaidWelcome');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your coach couldn’t be saved. Please try again.'); }
    finally { setSaving(false); }
  };
  return <ScreenContainer withBottomInset>
    <ScreenHeader title="Choose your coach" onBack={saving ? undefined : () => navigation.navigate('PaidWelcome')} />
    <Text style={styles.intro}>Included in your membership. Find the approach that feels right for you.</Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
      {loading ? <LoadingState message="Loading your coaches…" /> : coaches.map(coach => {
        const chosen = selected === coach.trainerId;
        const art = getCoachArtworkSource(coach);
        return <TouchableOpacity key={coach.trainerId} disabled={saving} activeOpacity={0.85}
          accessibilityRole="radio" accessibilityState={{ selected: chosen, disabled: saving }} accessibilityLabel={`${coach.name}, ${coach.expertise}`}
          onPress={() => setSelected(coach.trainerId)} style={[styles.card, chosen && styles.chosen]}>
          <View style={styles.row}>
            {art ? <Image source={art} style={styles.portrait} /> : <View style={styles.fallback}><Feather name="user" size={26} color={colors.gold} /></View>}
            <View style={styles.copy}><Text style={styles.name}>{coach.name}</Text><Text style={styles.specialty}>{coach.expertise}</Text></View>
            <Feather name={chosen ? 'check-circle' : 'circle'} size={24} color={chosen ? colors.gold : colors.inkSubtle} />
          </View>
          <Text style={styles.description}>{coach.description || 'Coaching and a workout routine shaped around your goals.'}</Text>
          {coach.languages.length ? <Text style={styles.languages}>{coach.languages.join(' · ')}</Text> : null}
        </TouchableOpacity>;
      })}
      {!loading && !coaches.length ? <View style={styles.card}>
        <Text style={styles.name}>Your coaches aren’t available right now</Text>
        <Text style={styles.description}>Your membership and setup are saved. Check again shortly.</Text>
        <PrimaryButton title="Check again" variant="secondary" onPress={load} />
      </View> : null}
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton title="Continue with this coach" icon="arrow-right" iconPosition="trailing" onPress={save} loading={saving} disabled={!selected || loading} style={styles.cta} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  intro: { fontSize: 15, lineHeight: 22, color: colors.inkMuted, marginBottom: 20 },
  list: { gap: 14, paddingBottom: 20 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 18, gap: 14 },
  chosen: { borderColor: colors.gold, backgroundColor: colors.panelWarm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  portrait: { width: 66, height: 74, borderRadius: 18 },
  fallback: { width: 66, height: 74, borderRadius: 18, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 },
  name: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  specialty: { color: colors.gold, fontSize: 12, lineHeight: 17 },
  description: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  languages: { color: colors.inkSubtle, fontSize: 12 },
  error: { color: colors.error, marginBottom: 12 },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
