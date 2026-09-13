import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState } from '../../components/States';
import { fetchQuestionnaire, saveQuestionnaireDraft, submitQuestionnaire } from '../../services/questionnaireService';
import { clearQuestionnaireDraft, loadQuestionnaireDraft, saveQuestionnaireDraft as saveLocalDraft } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';
import type { MobileQuestion } from '../../types/api';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Questionnaire'>;

export function QuestionnaireScreen({ navigation }: Props) {
  return <QuestionnaireFlow onComplete={() => navigation.replace('AnalysisLoading')} />;
}

export function QuestionnaireFlow({ onComplete }: {
  onComplete: () => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const userId = user?.userId || '';
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<MobileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [local, data] = await Promise.all([loadQuestionnaireDraft(userId), fetchQuestionnaire()]);
      const merged = { ...data.answers, ...local };
      if (!data.questions.length) throw new Error('No questions');
      setQuestions(data.questions);
      setAnswers(merged);
      const nextIndex = data.questions.findIndex(question => !merged[question.id]?.trim());
      setIndex(nextIndex < 0 ? 0 : nextIndex);
    } catch {
      setError('We couldn’t load your setup. Please try again.');
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const current = questions[index];
  const progress = questions.length ? (index + 1) / questions.length : 0;

  const setAnswer = async (value: string) => {
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    await saveLocalDraft(userId, next).catch(() => undefined);
    try {
      await saveQuestionnaireDraft(next);
    } catch {
      // offline ok
    }
  };

  const onNext = async () => {
    if (!current) return;
    if (current.required !== false && current.type === 'single' && !answers[current.id]) return;
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    setSubmitting(true);
    try {
      await submitQuestionnaire(answers);
      await clearQuestionnaireDraft(userId).catch(() => undefined);
      await onComplete();
    } catch {
      setError('Your answers couldn’t be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBody = () => {
    if (!current) return null;
    if (current.type === 'text') {
      return (
        <FormInput
          value={answers[current.id] || ''}
          onChangeText={setAnswer}
          placeholder="Type your answer"
          multiline
          autoCapitalize="sentences"
        />
      );
    }
    return (
      <View style={styles.options}>
        {current.options?.map((opt) => {
          const selected = answers[current.id] === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.8}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setAnswer(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (!loading && !current) {
    return <ScreenContainer withBottomInset>
      <Text style={styles.title}>Let’s try that again</Text>
      <Text style={styles.subtitle}>{error}</Text>
      <PrimaryButton title="Retry" onPress={load} />
    </ScreenContainer>;
  }
  if (loading || !current) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading your questionnaire…" />
      </ScreenContainer>
    );
  }

  const isHealth = /injur|restrict|medical|condition|health/i.test(`${current.id} ${current.title}`);

  return (
    <LinearGradient colors={['#05070c', '#02040a']} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.safeArea, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTop}>
          <TouchableOpacity
            onPress={() => index > 0 && setIndex(index - 1)}
            disabled={index === 0}
            style={[styles.backButton, index === 0 && styles.backButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Previous question"
            accessibilityState={{ disabled: index === 0 }}
          >
            <Feather name="chevron-left" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        <ProgressBar value={progress} trackColor="rgba(255,255,255,0.12)" fillColor={colors.white} />
      </View>

      <ScrollView
        style={styles.questionScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, current.type === 'single' && styles.scrollSingle]}
      >
        <Text style={styles.title}>{current.title}</Text>
        {current.subtitle ? <Text style={styles.subtitle}>{current.subtitle}</Text> : null}
        {renderBody()}
        {isHealth ? (
          <View style={styles.disclaimer}>
            <Feather name="info" size={16} color={colors.warn} />
            <Text style={styles.disclaimerText}>
              FormBae provides fitness coaching, not medical advice. If you have an injury or medical condition, consult a
              qualified healthcare professional before starting any program.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {error ? <Text accessibilityRole="alert" style={styles.subtitle}>{error}</Text> : null}
      <PrimaryButton
        disabled={current.required !== false && !answers[current.id]?.trim()}
        title={index === questions.length - 1 ? 'Submit answers' : 'Continue'}
        icon={index === questions.length - 1 ? 'check' : 'arrow-right'}
        onPress={onNext}
        loading={submitting}
        variant="inverted"
        size="lg"
        style={styles.continueButton}
      />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: spacing.lg },
  progressHeader: { marginBottom: spacing.xl },
  progressTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  backButtonDisabled: { opacity: 0.28 },
  continueButton: { minHeight: 62, borderRadius: 18 },
  questionScroll: { flex: 1 },
  scroll: { paddingBottom: spacing.lg },
  scrollSingle: { flexGrow: 1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, color: colors.white, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.62)', marginBottom: spacing.lg },
  options: { flex: 1, gap: spacing.sm, marginTop: spacing.sm },
  option: {
    flex: 1,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optionSelected: { borderColor: 'rgba(255,255,255,0.64)', backgroundColor: 'rgba(255,255,255,0.12)' },
  optionText: { ...typography.bodyBold, color: colors.white, flex: 1, paddingRight: spacing.sm },
  optionTextSelected: { color: colors.white, fontWeight: '700' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.white, borderColor: colors.white },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warnLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  disclaimerText: { ...typography.caption, color: colors.warn, flex: 1, lineHeight: 17 },
});
