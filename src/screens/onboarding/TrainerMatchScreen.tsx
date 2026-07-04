import { ScrollView, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchRecommendedTrainer } from '../../services/trainerService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'TrainerMatch'>;

export function TrainerMatchScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsync(() => fetchRecommendedTrainer());
  const trainer = data?.trainer ?? null;

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your recommended trainer</ScreenTitle>
        <LoadingState message="Matching you with the right coach…" />
      </ScreenContainer>
    );
  }

  if (error || !trainer) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your recommended trainer</ScreenTitle>
        <ErrorState message={error || 'We could not load your trainer match yet.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView>
        <ScreenTitle>Your recommended trainer</ScreenTitle>
        <Card>
          <Text style={styles.badge}>{trainer.badge}</Text>
          <Text style={styles.name}>{trainer.name}</Text>
          <Text style={styles.coach}>{trainer.coachType}</Text>
          <Text style={styles.body}>{trainer.description}</Text>
          <Text style={styles.why}>{trainer.why}</Text>
        </Card>
        <PrimaryButton title="Continue with this trainer" onPress={() => navigation.navigate('PaymentRequired')} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  badge: { color: colors.accent, fontWeight: '700', marginBottom: 8 },
  name: { fontSize: 24, fontWeight: '700', color: colors.ink },
  coach: { color: colors.inkMuted, marginBottom: 12 },
  body: { color: colors.ink, lineHeight: 22, marginBottom: 12 },
  why: { color: colors.accentDark, lineHeight: 21 },
});
