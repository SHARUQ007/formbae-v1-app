import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState, ErrorState } from '../../components/States';
import { fetchCoachQuestions, saveCoachQuestions } from '../../services/onboardingService';
import { useAuthStore } from '../../store/authStore';
import type { MobileQuestion } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<PaidStackParamList, 'CoachQuestions'>;

export function CoachQuestionsScreen({ navigation }: Props) {
  const { refreshStatus } = useAuthStore();
  const [questions, setQuestions] = useState<MobileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fetchCoachQuestions();
      setQuestions(data.questions || []);
      setAnswers(data.answers || {});
      // Resume on the first thing they have not answered rather than starting over.
      const next = (data.questions || []).findIndex((question) => !(data.answers || {})[question.id]?.trim());
      setIndex(next === -1 ? 0 : next);
    } catch {
      setError('We couldn’t load your coach’s questions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = questions[index];
  const progress = questions.length ? (index + 1) / questions.length : 0;
  const answered = useMemo(() => Boolean(current && answers[current.id]?.trim()), [current, answers]);
  const isLast = index === questions.length - 1;

  const onNext = async () => {
    if (!current || !answered) return;
    if (!isLast) { setIndex(index + 1); return; }
    setSubmitting(true); setError('');
    try {
      await saveCoachQuestions(answers);
      const fresh = await refreshStatus();
      navigation.replace(fresh?.recommendedNextScreen === 'plan_preparing' ? 'PlanPreparing' : 'PaidWelcome');
    } catch {
      setError('Your answers couldn’t be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="A few questions" />
        <LoadingState message="Loading your coach’s questions…" />
      </ScreenContainer>
    );
  }

  if (!current) {
    return (
      <ScreenContainer withBottomInset>
        <ScreenHeader title="A few questions" />
        <ErrorState message={error || 'No questions to answer right now.'} onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader
        title="A few questions"
        onBack={index > 0 && !submitting ? () => setIndex(index - 1) : undefined}
      />
      <View style={styles.progressRow}>
        <Text style={styles.step}>Question {index + 1} of {questions.length}</Text>
        <ProgressBar value={progress} trackColor={colors.panelRaised} fillColor={colors.gold} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <Text style={styles.intro}>Your coach writes your first plan from these.</Text>
          <Text style={styles.title}>{current.title}</Text>
          {current.subtitle ? <Text style={styles.subtitle}>{current.subtitle}</Text> : null}

          {current.type === 'text' ? (
            <FormInput
              value={answers[current.id] || ''}
              onChangeText={(text) => setAnswers((state) => ({ ...state, [current.id]: text }))}
              placeholder="Tell your coach in your own words"
              multiline
              autoCapitalize="sentences"
              maxLength={400}
            />
          ) : (
            <View style={styles.options}>
              {(current.options || []).map((option) => {
                const selected = answers[current.id] === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected }}
                    onPress={() => setAnswers((state) => ({ ...state, [current.id]: option.value }))}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          title={isLast ? 'Build my plan' : 'Continue'}
          icon={isLast ? 'check' : 'arrow-right'}
          iconPosition="trailing"
          disabled={!answered}
          loading={submitting}
          onPress={onNext}
          size="lg"
          style={styles.cta}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressRow: { gap: spacing.sm, marginBottom: spacing.md },
  step: { ...typography.caption, color: colors.inkSubtle },
  scroll: { paddingBottom: spacing.md },
  intro: { ...typography.caption, color: colors.gold, fontWeight: '700', letterSpacing: 0.3, marginBottom: spacing.sm },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted, lineHeight: 19, marginTop: 6 },
  options: { gap: spacing.sm, marginTop: spacing.md },
  option: {
    minHeight: 56,
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
  },
  optionSelected: { borderColor: colors.gold, backgroundColor: colors.accentLight },
  optionText: { ...typography.body, color: colors.ink },
  optionTextSelected: { color: colors.gold, fontWeight: '700' },
  error: { color: colors.error, ...typography.caption, marginBottom: spacing.sm },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
