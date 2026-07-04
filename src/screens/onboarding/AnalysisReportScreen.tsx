import { ScrollView, Text, View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GradientHero } from '../../components/GradientHero';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchAnalysis } from '../../services/questionnaireService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AnalysisReport'>;

export function AnalysisReportScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsync(() => fetchAnalysis());
  const report = data?.report ?? null;

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your fitness analysis</ScreenTitle>
        <LoadingState message="Preparing your personalized report…" />
      </ScreenContainer>
    );
  }

  if (error || !report) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your fitness analysis</ScreenTitle>
        <ErrorState message={error || 'We could not load your report yet.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const sections: { icon: string; label: string; value: string }[] = [
    { icon: 'target', label: 'Goal', value: report.goalSummary },
    { icon: 'flag', label: 'Starting point', value: report.startingPoint },
    { icon: 'trending-up', label: 'Workout direction', value: report.workoutDirection },
    { icon: 'calendar', label: 'Weekly schedule', value: report.weeklySchedule },
    { icon: 'home', label: 'Home / gym fit', value: report.locationSuitability },
    { icon: 'user', label: 'Trainer type', value: report.trainerType },
    { icon: 'tag', label: 'Budget fit', value: report.budgetRecommendation },
  ];

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenTitle>Your fitness analysis</ScreenTitle>

        <GradientHero eyebrow="Readiness score">
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>{report.readinessScore}</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <Text style={styles.scoreHint}>Based on your goals, schedule and current fitness.</Text>
        </GradientHero>

        <View style={styles.sections}>
          {sections.map((s) => (
            <Card key={s.label} style={styles.section}>
              <View style={styles.sectionIcon}>
                <Feather name={s.icon} size={18} color={colors.accent} />
              </View>
              <View style={styles.sectionBody}>
                <Text style={styles.sectionLabel}>{s.label}</Text>
                <Text style={styles.sectionValue}>{s.value}</Text>
              </View>
            </Card>
          ))}
        </View>

        <PrimaryButton title="See recommended trainer" icon="arrow-right" onPress={() => navigation.navigate('TrainerMatch')} style={styles.cta} />
        <Text style={styles.disclaimer}>
          This report is general fitness guidance based on your answers and is not medical advice. Consult a qualified
          healthcare professional before starting any exercise or nutrition program.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  scoreValue: { fontSize: 52, fontWeight: '800', color: colors.white, letterSpacing: -1 },
  scoreMax: { ...typography.subtitle, color: colors.onAccentMuted, marginLeft: 6 },
  scoreHint: { ...typography.caption, color: colors.onAccentMuted, marginTop: 4 },
  sections: { marginTop: spacing.lg, gap: spacing.sm },
  section: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBody: { flex: 1 },
  sectionLabel: { ...typography.label, color: colors.inkSubtle, textTransform: 'uppercase', marginBottom: 2 },
  sectionValue: { ...typography.body, color: colors.ink },
  cta: { marginTop: spacing.lg },
  disclaimer: { ...typography.caption, color: colors.inkSubtle, lineHeight: 17, marginTop: spacing.md, fontStyle: 'italic' },
});
