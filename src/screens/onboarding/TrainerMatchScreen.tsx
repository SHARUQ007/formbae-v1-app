import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchRecommendedTrainer } from '../../services/trainerService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { getCoachArtworkSource } from '../../utils/coachArtwork';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'TrainerMatch'>;

export function TrainerMatchScreen({ navigation }: Props) {
  const { fontScale } = useWindowDimensions();
  const { data, loading, error, reload } = useAsync(() => fetchRecommendedTrainer());
  const trainer = data?.trainer ?? null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const trainerName = String(trainer?.name || '').trim() || 'Your coach';
  const trainerPhoto = useMemo(
    () => getCoachArtworkSource({ name: trainerName, photoUrl: trainer?.photoUrl }),
    [trainer?.photoUrl, trainerName],
  );
  const coachType = String(trainer?.coachType || '').trim() || 'FormBae trainer';
  const description = String(trainer?.description || '').trim();
  const whyThisMatch = String(trainer?.why || '').trim();
  const trainerBadge = String(trainer?.badge || '').trim();
  const largeText = fontScale >= 1.2;

  useEffect(() => setPhotoFailed(false), [trainerPhoto]);

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Meet your trainer</ScreenTitle>
        <LoadingState message="Matching you with the right coach…" />
      </ScreenContainer>
    );
  }

  if (error || !trainer) {
    return (
      <ScreenContainer>
        <ScreenTitle>Meet your trainer</ScreenTitle>
        <ErrorState message={error || 'We could not load your trainer match yet.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenTitle>Meet your trainer</ScreenTitle>

        <Card style={styles.card}>
          <View style={[styles.visual, largeText && styles.visualLargeText]}>
            {trainerPhoto && !photoFailed ? (
              <Image
                source={trainerPhoto}
                style={styles.photo}
                resizeMode="cover"
                onError={() => setPhotoFailed(true)}
                accessibilityLabel={`Photo of ${trainerName}`}
              />
            ) : (
              <View style={styles.photoFallback}>
                <View style={styles.fallbackDisc} />
                <Avatar name={trainerName} size={92} />
              </View>
            )}
            {trainerBadge && !largeText ? (
              <View style={styles.badgeWrap}>
                <Badge label={trainerBadge} tone="accent" icon="award" />
              </View>
            ) : null}
            {!largeText ? (
              <View style={styles.identity}>
                <Text style={styles.matchLabel}>YOUR MATCH</Text>
                <Text style={styles.name}>{trainerName}</Text>
                <Text style={styles.coach}>{coachType}</Text>
              </View>
            ) : null}
          </View>

          {largeText ? (
            <View style={[styles.identityFlow, !(description || whyThisMatch) && styles.identityFlowLast]}>
              {trainerBadge ? <Badge label={trainerBadge} tone="accent" icon="award" /> : null}
              <Text style={styles.matchLabel}>YOUR MATCH</Text>
              <Text style={styles.name}>{trainerName}</Text>
              <Text style={styles.coach}>{coachType}</Text>
            </View>
          ) : null}

          {description || whyThisMatch ? (
            <View style={styles.cardBody}>
              {description ? <Text style={styles.body}>{description}</Text> : null}

              {whyThisMatch ? (
                <View style={styles.whyBox}>
                  <View style={styles.whyHeader}>
                    <Feather name="check-circle" size={16} color={colors.gold} />
                    <Text style={styles.whyTitle}>Why this match</Text>
                  </View>
                  <Text style={styles.why}>{whyThisMatch}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>

        <PrimaryButton
          title="Continue with this trainer"
          icon="arrow-right"
          onPress={() => navigation.navigate('PaymentRequired')}
          style={styles.cta}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg },
  card: { overflow: 'hidden', padding: 0, borderRadius: radius.xl },
  visual: { aspectRatio: 1.18, overflow: 'hidden', backgroundColor: colors.panelMuted },
  visualLargeText: { aspectRatio: 1.45 },
  photo: { width: '100%', height: '100%' },
  photoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallbackDisc: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: colors.panelWarm,
  },
  badgeWrap: { position: 'absolute', top: spacing.md, right: spacing.md },
  identity: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(5,6,10,0.84)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  identityFlow: { alignItems: 'flex-start', gap: 4, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  identityFlowLast: { paddingBottom: spacing.lg },
  matchLabel: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  name: { ...typography.title, color: colors.inkStrong, marginTop: 2 },
  coach: { ...typography.caption, color: colors.onAccentMuted, marginTop: 2 },
  cardBody: { gap: spacing.md, padding: spacing.lg },
  body: { ...typography.body, color: colors.ink, lineHeight: 23 },
  whyBox: { backgroundColor: colors.panelMuted, borderRadius: radius.md, padding: spacing.md },
  whyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  whyTitle: { ...typography.label, color: colors.ink },
  why: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  cta: { marginTop: spacing.lg },
});
