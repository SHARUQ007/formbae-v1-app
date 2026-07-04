import { ScrollView, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchAnalysis } from '../../services/questionnaireService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AnalysisReport'>;

export function AnalysisReportScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsync(() => fetchAnalysis());
  const report = data?.report ?? null;

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your free fitness analysis</ScreenTitle>
        <LoadingState message="Preparing your personalized report…" />
      </ScreenContainer>
    );
  }

  if (error || !report) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your free fitness analysis</ScreenTitle>
        <ErrorState message={error || 'We could not load your report yet.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const sections = [
    { label: 'Goal', value: report.goalSummary },
    { label: 'Starting point', value: report.startingPoint },
    { label: 'Workout direction', value: report.workoutDirection },
    { label: 'Weekly schedule', value: report.weeklySchedule },
    { label: 'Home / gym fit', value: report.locationSuitability },
    { label: 'Trainer type', value: report.trainerType },
    { label: 'Budget fit', value: report.budgetRecommendation },
  ];

  return (
    <ScreenContainer>
      <ScrollView>
        <ScreenTitle>Your free fitness analysis</ScreenTitle>
        <Card style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Readiness score</Text>
          <Text style={styles.scoreValue}>{report.readinessScore}/100</Text>
        </Card>
        {sections.map((s) => (
          <Card key={s.label} style={styles.section}>
            <Text style={styles.sectionLabel}>{s.label}</Text>
            <Text style={styles.sectionValue}>{s.value}</Text>
          </Card>
        ))}
        <PrimaryButton title="See recommended trainer" onPress={() => navigation.navigate('TrainerMatch')} />
        <Text style={styles.disclaimer}>
          This report is general fitness guidance based on your answers and is not medical advice. Consult a qualified
          healthcare professional before starting any exercise or nutrition program.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scoreCard: { alignItems: 'center', marginBottom: 12 },
  scoreLabel: { color: colors.inkMuted },
  scoreValue: { fontSize: 36, fontWeight: '700', color: colors.accent },
  section: { marginBottom: 10 },
  sectionLabel: { fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sectionValue: { color: colors.inkMuted, lineHeight: 21 },
  disclaimer: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 16, fontStyle: 'italic' },
});
