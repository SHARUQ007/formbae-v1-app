import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState, ErrorState } from '../../components/States';
import { fetchCoachQuestions, saveCoachQuestions, type CoachAnswer } from '../../services/onboardingService';
import { useAuthStore } from '../../store/authStore';
import { advancePaidSetup } from '../../utils/paidSetupFlow';
import type { MobileQuestion } from '../../types/api';
import type { PaidStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<PaidStackParamList, 'CoachQuestions'>;

const answered = (answer: CoachAnswer | undefined) => Boolean(answer && (answer.options.length || answer.notes.trim()));

export function CoachQuestionsScreen({ navigation }: Props) {
  const { refreshStatus } = useAuthStore();
  const [questions, setQuestions] = useState<MobileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, CoachAnswer>>({});
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
      const next = (data.questions || []).findIndex((question) => !answered(data.answers?.[question.id]));
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
  const isLast = index === questions.length - 1;
  const answer = current ? answers[current.id] : undefined;
  const chosenOptions = useMemo(() => new Set(answer?.options || []), [answer]);
  const notes = answer?.notes || '';
  const canContinue = Boolean(current && (current.required === false || answered(answer)));

  const writeAnswer = (question: MobileQuestion, options: string[], freeText: string) => {
    setAnswers((state) => ({ ...state, [question.id]: { options, notes: freeText } }));
  };

  const toggleOption = (value: string) => {
    if (!current) return;
    if (current.type === 'single') {
      writeAnswer(current, [value], notes);
      return;
    }
    // Keep the order the options are offered in, however they were tapped.
    const picked = new Set(chosenOptions);
    if (picked.has(value)) picked.delete(value); else picked.add(value);
    writeAnswer(current, (current.options || []).map((option) => option.value).filter((option) => picked.has(option)), notes);
  };

  const onNext = async () => {
    if (!current || !canContinue) return;
    if (!isLast) { setIndex(index + 1); return; }
    setSubmitting(true); setError('');
    try {
      await saveCoachQuestions(answers);
      const fresh = await refreshStatus().catch(() => undefined);
      // They just asked for a plan, so go and build it rather than back to the checklist.
      if (!fresh) { navigation.replace('PlanPreparing', { autoStart: true }); return; }
      if (!advancePaidSetup(navigation, fresh, 'CoachQuestions')) {
        setError('Your answers were saved, but setup hasn’t caught up yet. Please try again.');
      }
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
              value={notes}
              onChangeText={(text) => writeAnswer(current, [], text)}
              placeholder={current.notesPlaceholder || 'Tell your coach in your own words'}
              multiline
              autoCapitalize="sentences"
              maxLength={400}
            />
          ) : (
            <>
              {current.type === 'multi' ? <Text style={styles.hint}>Pick as many as apply</Text> : null}
              <View style={styles.options}>
                {(current.options || []).map((option) => {
                  const picked = chosenOptions.has(option.value);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      activeOpacity={0.85}
                      accessibilityRole={current.type === 'multi' ? 'checkbox' : 'radio'}
                      accessibilityLabel={option.label}
                      accessibilityState={current.type === 'multi' ? { checked: picked } : { selected: picked }}
                      onPress={() => toggleOption(option.value)}
                      style={[styles.option, picked && styles.optionSelected]}
                    >
                      <Text style={[styles.optionText, picked && styles.optionTextSelected]}>{option.label}</Text>
                      <View style={styles.optionTick}>
                        {picked ? <Feather name={current.type === 'multi' ? 'check-square' : 'check'} size={17} color={colors.gold} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {current.allowNotes ? (
                <View style={styles.notes}>
                  <FormInput
                    label="Anything else?"
                    value={notes}
                    onChangeText={(text) => writeAnswer(current, answer?.options || [], text)}
                    placeholder={current.notesPlaceholder || 'Add it in your own words'}
                    multiline
                    autoCapitalize="sentences"
                    maxLength={240}
                  />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          title={isLast ? 'Build my plan' : current.required === false && !answered(answer) ? 'Skip' : 'Continue'}
          icon={isLast ? 'check' : 'arrow-right'}
          iconPosition="trailing"
          disabled={!canContinue}
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
  hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  notes: { marginTop: spacing.md },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
  },
  optionSelected: { borderColor: colors.gold, backgroundColor: colors.accentLight },
  optionText: { ...typography.body, color: colors.ink, flex: 1 },
  optionTick: { width: 17, alignItems: 'center', flexShrink: 0 },
  optionTextSelected: { color: colors.gold, fontWeight: '700' },
  error: { color: colors.error, ...typography.caption, marginBottom: spacing.sm },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
