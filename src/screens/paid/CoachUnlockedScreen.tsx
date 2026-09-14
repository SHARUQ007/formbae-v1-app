import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Path } from 'react-native-svg';
import { ScreenContainer, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchCoachHub, changeCoach } from '../../services/trainerService';
import { useAuthStore } from '../../store/authStore';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import { coachPricePaise, formatCoachLabel } from '../../utils/coachPresentation';
import type { CoachOption } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<PaidStackParamList, 'CoachUnlocked'>;

export function CoachUnlockedScreen({ navigation, route }: Props) {
  const { trainerId } = route.params;
  const { refreshStatus } = useAuthStore();
  const [coach, setCoach] = useState<CoachOption | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    let hub;
    try {
      hub = await fetchCoachHub();
    } catch {
      return;
    }
    setCoach(hub.trainers.find((entry) => entry.trainerId === trainerId) || hub.currentTrainer || null);
    // Checkout assigns the coach server-side; this is a safety net if it did not. It must
    // never blank the confirmation the trainee just paid for, so it fails quietly.
    if (hub.currentTrainer?.trainerId !== trainerId) {
      await Promise.resolve(changeCoach(trainerId)).catch(() => undefined);
    }
  }, [trainerId]);
  useEffect(() => { sync(); }, [sync]);

  const onContinue = async () => {
    setBusy(true);
    try {
      await refreshStatus().catch(() => undefined);
      navigation.replace('PaidWelcome');
    } finally {
      setBusy(false);
    }
  };

  const art = coach ? getCoachArtworkSource(coach) : null;
  const price = coach ? coachPricePaise(coach) : 0;

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.markWrap}>
          <ConfirmedMark />
        </View>
        <Text style={styles.title}>You&apos;re in{coach ? ` with ${coach.name.trim().split(/\s+/)[0]}` : ''}</Text>
        <Text style={styles.subtitle}>
          Payment confirmed and added to your subscription. Your coach takes it from here.
        </Text>

        {coach ? (
          <Card style={styles.coachCard}>
            <View style={styles.coachRow}>
              {art ? <Image source={art} style={styles.portrait} /> : <View style={styles.fallback}><Feather name="user" size={26} color={colors.gold} /></View>}
              <View style={styles.coachCopy}>
                <Text style={styles.coachName}>{coach.name}</Text>
                <Text style={styles.coachRole}>{formatCoachLabel(coach)}</Text>
              </View>
              <Feather name="check-circle" size={22} color={colors.success} />
            </View>
            {price > 0 ? (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Added to your subscription</Text>
                <Text style={styles.receiptValue}>₹{Math.round(price / 100).toLocaleString('en-IN')}/mo</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.nextCard}>
          <Text style={styles.nextTitle}>What happens next</Text>
          {[
            'Your coach builds your first plan around your assessment',
            'You log workouts, they review and adjust as you go',
            'Message them any time from the Coaching tab',
          ].map((line) => (
            <View key={line} style={styles.nextRow}>
              <Feather name="check" size={15} color={colors.gold} />
              <Text style={styles.nextText}>{line}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>

      <PrimaryButton title="Continue" icon="arrow-right" iconPosition="trailing" loading={busy} onPress={onContinue} size="lg" />
    </ScreenContainer>
  );
}

function ConfirmedMark() {
  return (
    <Svg width="88" height="88" viewBox="0 0 88 88">
      <Circle cx="44" cy="44" r="34" fill="rgba(131,214,164,0.10)" stroke={colors.success} strokeWidth="2.5" />
      <Path d="M30 45.5l9.5 9.5L59 34" fill="none" stroke={colors.success} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M72 18l1.6 3.6 3.6 1.6-3.6 1.6L72 28.4l-1.6-3.6-3.6-1.6 3.6-1.6L72 18z" fill={colors.gold} />
      <Circle cx="14" cy="30" r="2" fill={colors.gold} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
  markWrap: { alignItems: 'center' },
  title: { ...typography.display, fontSize: 28, lineHeight: 34, color: colors.ink, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.inkMuted, textAlign: 'center', lineHeight: 22 },
  coachCard: { gap: spacing.md, marginTop: spacing.xs },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  portrait: { width: 58, height: 66, borderRadius: radius.md },
  fallback: { width: 58, height: 66, borderRadius: radius.md, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' },
  coachCopy: { flex: 1, minWidth: 0, gap: 3 },
  coachName: { ...typography.subtitle, color: colors.ink },
  coachRole: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  receiptLabel: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  receiptValue: { ...typography.bodyBold, color: colors.gold },
  nextCard: { gap: spacing.sm },
  nextTitle: { ...typography.bodyBold, color: colors.ink },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nextText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
});
