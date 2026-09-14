import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState } from '../../components/States';
import { fetchCoachHub } from '../../services/trainerService';
import { runNativeCheckout } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import { coachCheckoutPlan, coachPricePaise, formatCoachLabel } from '../../utils/coachPresentation';
import type { CoachOption } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<PaidStackParamList, 'CoachUpgrade'>;

const monthly = (coach: CoachOption) => `₹${Math.round(coachPricePaise(coach) / 100).toLocaleString('en-IN')}/mo`;

const WHAT_YOU_GET = [
  'A plan written for you by your coach, not a template',
  'Form and progress reviewed as you log your workouts',
  'Message your coach when something is not working',
];

export function CoachUpgradeScreen({ navigation, route }: Props) {
  const { trainerId } = route.params;
  const { user, status, refreshStatus } = useAuthStore();
  const [coach, setCoach] = useState<CoachOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const hub = await fetchCoachHub();
      const found = hub.trainers.find((entry) => entry.trainerId === trainerId) || null;
      setCoach(found);
      if (!found) setError('This coach is no longer available.');
    } catch {
      setError('We couldn’t load this coach. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [trainerId]);
  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    if (!coach) return;
    const plan = coachCheckoutPlan(coach);
    if (!plan) { setError('This coach does not have pricing set up yet.'); return; }
    setPaying(true); setError('');
    try {
      const result = await runNativeCheckout({
        plan,
        paywallId: coach.paywallId,
        selectedTrainerId: coach.trainerId,
        user: {
          name: status?.name || user?.name || 'FormBae Trainee',
          mobile: status?.phone || user?.mobile || '',
          email: status?.email,
        },
      });
      if (result.cancelled) return;
      if (!result.success) {
        setError(result.error || 'Payment could not be completed. Please try again.');
        return;
      }
      // Verification already recorded the coach against the subscription; pull it through
      // so the rest of the flow sees the new coach before moving on.
      await refreshStatus().catch(() => undefined);
      navigation.replace('CoachUnlocked', { trainerId: coach.trainerId });
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="Coach profile" onBack={() => navigation.goBack()} />
        <LoadingState message="Loading this coach…" />
      </ScreenContainer>
    );
  }

  if (!coach) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="Coach profile" onBack={() => navigation.goBack()} />
        <ErrorState message={error || 'This coach is no longer available.'} onRetry={load} />
      </ScreenContainer>
    );
  }

  const art = getCoachArtworkSource(coach);
  const firstName = coach.name.trim().split(/\s+/)[0] || 'coach';

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader title="Coach profile" onBack={paying ? undefined : () => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          {art ? <Image source={art} style={styles.portrait} /> : <View style={styles.fallback}><Feather name="user" size={34} color={colors.gold} /></View>}
          <View style={styles.heroCopy}>
            <Text style={styles.name}>{coach.name}</Text>
            <Text style={styles.role}>{formatCoachLabel(coach)}</Text>
            <Text style={styles.price}>{monthly(coach)}</Text>
          </View>
        </View>

        <Card style={styles.block}>
          <Text style={styles.blockTitle}>About {firstName}</Text>
          <Text style={styles.body}>
            {coach.detailedDescription || coach.description || 'Personal guidance, workout reviews, and plan adjustments from your coach.'}
          </Text>
          {coach.languages.length ? <Text style={styles.languages}>Speaks {coach.languages.join(' · ')}</Text> : null}
        </Card>

        <Card style={styles.block}>
          <Text style={styles.blockTitle}>What you get</Text>
          {WHAT_YOU_GET.map((line) => (
            <View key={line} style={styles.benefitRow}>
              <Feather name="check" size={15} color={colors.gold} />
              <Text style={styles.benefitText}>{line}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.block}>
          <Text style={styles.blockTitle}>What you pay</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{coach.name} personal coaching</Text>
            <Text style={styles.priceValue}>{monthly(coach)}</Text>
          </View>
          <Text style={styles.fineprint}>
            Charged monthly on top of your membership, and added to the same subscription. Cancel anytime.
          </Text>
        </Card>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <PrimaryButton
        title={`Unlock ${firstName} · ${monthly(coach)}`}
        icon="lock"
        loading={paying}
        onPress={pay}
        size="lg"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.md, gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  portrait: { width: 92, height: 104, borderRadius: radius.lg },
  fallback: { width: 92, height: 104, borderRadius: radius.lg, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0, gap: 4 },
  name: { ...typography.title, color: colors.ink },
  role: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  price: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  block: { gap: spacing.sm },
  blockTitle: { ...typography.bodyBold, color: colors.ink },
  body: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  languages: { ...typography.caption, color: colors.inkSubtle },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  priceLabel: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  priceValue: { ...typography.bodyBold, color: colors.gold },
  fineprint: { ...typography.caption, color: colors.inkSubtle, lineHeight: 17 },
  error: { color: colors.error, ...typography.caption },
});
