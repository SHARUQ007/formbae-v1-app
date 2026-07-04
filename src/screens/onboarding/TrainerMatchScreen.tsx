import { ScrollView, Text, View, StyleSheet } from 'react-native';
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
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenTitle>Your recommended trainer</ScreenTitle>

        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Avatar name={trainer.name} size={64} />
            <View style={styles.headerText}>
              {trainer.badge ? <Badge label={trainer.badge} tone="accent" icon="award" /> : null}
              <Text style={styles.name}>{trainer.name}</Text>
              <Text style={styles.coach}>{trainer.coachType}</Text>
            </View>
          </View>

          <Text style={styles.body}>{trainer.description}</Text>

          <View style={styles.whyBox}>
            <View style={styles.whyHeader}>
              <Feather name="check-circle" size={16} color={colors.accent} />
              <Text style={styles.whyTitle}>Why this match</Text>
            </View>
            <Text style={styles.why}>{trainer.why}</Text>
          </View>
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
  card: { gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 4 },
  name: { ...typography.title, color: colors.ink },
  coach: { ...typography.caption, color: colors.inkMuted },
  body: { ...typography.body, color: colors.ink },
  whyBox: { backgroundColor: colors.accentLight, borderRadius: 14, padding: spacing.md },
  whyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  whyTitle: { ...typography.label, color: colors.accentDarker },
  why: { ...typography.body, color: colors.accentDarker },
  cta: { marginTop: spacing.lg },
});
