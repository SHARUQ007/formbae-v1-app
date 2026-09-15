import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, StyleSheet, View, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState } from '../../components/States';
import { ApiError } from '../../services/apiClient';
import { answerProblem, rejectedQuestionIds, restoreQuestionnaireAnswers } from '../../utils/questionnaire';
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

/** Multi-select answers travel as one comma-separated string, the way the backend reads them. */
const pickedOptions = (answer: string) => answer.split(',').map((part) => part.trim()).filter(Boolean);

const toggleOption = (answer: string, value: string) => {
  const picked = pickedOptions(answer);
  const next = picked.includes(value) ? picked.filter((option) => option !== value) : [...picked, value];
  return next.join(', ');
};

const COACH_NOTE_PROMPTS = [
  { label: 'No injuries', icon: 'shield', value: 'No injuries or movement limitations.' },
  { label: 'Knee or back discomfort', icon: 'activity', value: 'I have knee or back discomfort.' },
  { label: 'Limited movement', icon: 'move', value: 'I have some movement limitations.' },
  { label: 'Home equipment', icon: 'home', value: 'I train at home with limited equipment.' },
] as const;

export function QuestionnaireScreen({ navigation }: Props) {
  return <QuestionnaireFlow onComplete={(answers) => navigation.replace('AnalysisLoading', { answers })} />;
}

export function QuestionnaireFlow({ onComplete }: {
  onComplete: (answers: Record<string, string>) => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stackCoachOptions = width < 360 || fontScale > 1.2;
  const { user, status } = useAuthStore();
  const userId = user?.userId || status?.userId || '';
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<MobileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  // A measurement is only marked wrong once they have tried to move on, so the very first
  // keystroke is not met with an error.
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectedField, setRejectedField] = useState('');
  const acceptedAnswers = useRef<Record<string, string> | null>(null);
  const submitInFlight = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [local, data] = await Promise.all([loadQuestionnaireDraft(userId), fetchQuestionnaire()]);
      const merged = restoreQuestionnaireAnswers(data.questions, data.answers, local);
      if (!data.questions.length) throw new Error('No questions');
      setQuestions(data.questions);
      setAnswers(merged);
      const nextIndex = data.questions.findIndex(question => answerProblem(question, merged[question.id] || '') || !merged[question.id]?.trim());
      setIndex(nextIndex < 0 ? 0 : nextIndex);
    } catch {
      setError('We couldn’t load your setup. Please try again.');
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [index]);

  const current = questions[index];
  const progress = questions.length ? (index + 1) / questions.length : 0;

  const setAnswer = async (value: string) => {
    setTouched(false);
    setRejectedField('');
    setError('');
    acceptedAnswers.current = null;
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    await saveLocalDraft(userId, next).catch(() => undefined);
    try {
      await saveQuestionnaireDraft(next);
    } catch {
      // offline ok
    }
  };

  const toggleCoachNote = (value: string) => {
    const existing = answers[current.id]?.trim() || '';
    if (value === COACH_NOTE_PROMPTS[0].value) {
      setAnswer(existing === value ? '' : value);
      return;
    }
    const withoutNone = existing.replace(COACH_NOTE_PROMPTS[0].value, '').trim();
    if (withoutNone.includes(value)) {
      setAnswer(withoutNone.replace(value, '').replace(/\s{2,}/g, ' ').trim());
      return;
    }
    setAnswer([withoutNone, value].filter(Boolean).join(' '));
  };

  const onNext = async () => {
    if (!current || submitInFlight.current) return;
    setError('');
    if (answerProblem(current, answers[current.id] || '')) {
      setTouched(true);
      return;
    }
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setTouched(false);
      return;
    }
    const invalidIndex = questions.findIndex(question => answerProblem(question, answers[question.id] || ''));
    if (invalidIndex >= 0) {
      setIndex(invalidIndex);
      setTouched(true);
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      if (acceptedAnswers.current !== answers) {
        await submitQuestionnaire(answers);
        acceptedAnswers.current = answers;
        await clearQuestionnaireDraft(userId).catch(() => undefined);
      }
      await onComplete(answers);
    } catch (failure) {
      if (acceptedAnswers.current === answers) {
        setError('Your answers are saved. We couldn’t open the next step. Please try again.');
      } else if (failure instanceof ApiError) {
        const rejected = rejectedQuestionIds(failure.payload);
        const rejectedIndex = questions.findIndex(question => rejected.includes(question.id));
        if (rejectedIndex >= 0) {
          setIndex(rejectedIndex);
          setTouched(true);
          setRejectedField(questions[rejectedIndex].id);
        } else if (failure.isNetwork) {
          setError('We couldn’t connect. Check your connection and try again. Your answers are still here.');
        } else if (failure.status >= 500) {
          setError('The server couldn’t save your answers. Please try again shortly.');
        } else {
          setError(failure.status === 401 ? 'Your session has expired. Please sign in again.' : `Your answers couldn’t be submitted (${failure.status}). Please try again.`);
        }
      } else {
        setError('Your answers couldn’t be submitted. Please try again.');
      }
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const renderBody = () => {
    if (!current) return null;
    if (current.type === 'number') {
      const answer = answers[current.id] || '';
      const problem = touched ? answerProblem(current, answer) || (rejectedField === current.id ? 'Check this value and enter it again.' : '') : '';
      return (
        <View style={styles.measureBlock}>
          <FormInput
            value={answer}
            onChangeText={(value) => setAnswer(value.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder={current.placeholder || ''}
            keyboardType="numeric"
            maxLength={3}
            suffix={current.unit}
            size="lg"
            accessibilityLabel={current.title}
            error={problem}
            helperText={`Between ${current.min} and ${current.max} ${current.unit || ''}`.trim()}
          />
        </View>
      );
    }
    if (current.type === 'multi') {
      const picked = pickedOptions(answers[current.id] || '');
      return (
        <View style={styles.quickOptions}>
          {current.options?.map((opt) => {
            const selected = picked.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                accessibilityRole="checkbox"
                accessibilityLabel={opt.label}
                accessibilityState={{ checked: selected }}
                activeOpacity={0.82}
                onPress={() => setAnswer(toggleOption(answers[current.id] || '', opt.value))}
                style={[styles.quickOption, selected && styles.quickOptionSelected]}
              >
                <Text style={[styles.quickOptionText, selected && styles.quickOptionTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    if (current.type === 'text') {
      return (
        <View style={styles.textAnswerBlock}>
          {current.id === 'injuries' ? (
            <View>
              <Text style={styles.quickPrompt}>Choose any that apply</Text>
              <View style={styles.coachOptions}>
                {COACH_NOTE_PROMPTS.map(prompt => {
                  const selected = (answers[current.id] || '').includes(prompt.value);
                  return (
                    <TouchableOpacity
                      key={prompt.label}
                      accessibilityRole="checkbox"
                      accessibilityLabel={prompt.label}
                      accessibilityState={{ checked: selected }}
                      activeOpacity={0.82}
                      onPress={() => toggleCoachNote(prompt.value)}
                      style={[styles.coachOption, stackCoachOptions && styles.coachOptionStacked, selected && styles.quickOptionSelected]}
                    >
                      <View style={styles.coachOptionTop}>
                        <Feather name={prompt.icon} size={20} color={selected ? colors.gold : colors.inkMuted} />
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                          {selected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
                        </View>
                      </View>
                      <Text style={[styles.coachOptionText, selected && styles.quickOptionTextSelected]}>{prompt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          <FormInput
            value={answers[current.id] || ''}
            onChangeText={setAnswer}
            label={current.required === false ? 'Notes for your coach · Optional' : 'Notes for your coach'}
            placeholder="Anything that would help us tailor your plan…"
            multiline
            autoCapitalize="sentences"
          />
        </View>
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
                {selected ? <Feather name="check" size={18} color={colors.onPrimary} /> : null}
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      {/* Keep safe-area padding separate: keyboard avoidance owns its own bottom padding. */}
      <View style={[styles.safeArea, { paddingTop: insets.top + spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTop}>
          <TouchableOpacity
            onPress={() => { if (index > 0) { setIndex(index - 1); setTouched(false); setError(''); } }}
            disabled={index === 0}
            style={[styles.backButton, index === 0 && styles.backButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Previous question"
            accessibilityState={{ disabled: index === 0 }}
          >
            <Feather name="chevron-left" size={24} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>YOUR PROFILE</Text>
            <Text style={styles.progressCount}>Step {index + 1} of {questions.length}</Text>
          </View>
        </View>
        <ProgressBar value={progress} height={4} trackColor="rgba(255,255,255,0.10)" fillColor={colors.gold} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.questionScroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.title}>{current.title}</Text>
        {current.id === 'injuries' ? (
          <Text style={styles.subtitle}>Tell your coach about any injuries, movement limits or your home setup.</Text>
        ) : current.subtitle ? <Text style={styles.subtitle}>{current.subtitle}</Text> : null}
        {renderBody()}
        {touched && current.type !== 'number' && (answerProblem(current, answers[current.id] || '') || rejectedField === current.id) ? (
          <Text accessibilityRole="alert" style={styles.fieldError}>{answerProblem(current, answers[current.id] || '') || 'Please review this answer and choose it again.'}</Text>
        ) : null}
        {isHealth ? (
          <View style={styles.disclaimer}>
            <Feather name="info" size={16} color={colors.inkSubtle} />
            <Text style={styles.disclaimerText}>
              FormBae provides fitness coaching, not medical advice. If you have an injury or medical condition, consult a
              qualified healthcare professional before starting any program.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
      {error ? (
        <View style={styles.submitError}>
          <Feather name="alert-circle" size={18} color={colors.error} />
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.submitErrorText}>{error}</Text>
        </View>
      ) : null}
      <PrimaryButton
        disabled={current.required !== false && current.type !== 'number' && !answers[current.id]?.trim()}
        title={error ? 'Try again' : index === questions.length - 1 ? 'Submit answers' : 'Continue'}
        icon={error ? 'refresh-cw' : index === questions.length - 1 ? 'check' : 'arrow-right'}
        iconPosition="trailing"
        onPress={onNext}
        loading={submitting}
        variant="inverted"
        size="lg"
        style={styles.continueButton}
      />
      </View>
      </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: spacing.lg },
  progressHeader: { marginBottom: spacing.md, flexShrink: 0 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  progressMeta: { alignItems: 'flex-end', gap: 2 },
  progressLabel: { ...typography.overline, color: colors.inkSubtle },
  progressCount: { ...typography.caption, color: colors.inkMuted },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  backButtonDisabled: { opacity: 0.28 },
  continueButton: { minHeight: 60, borderRadius: 18 },
  footer: { flexShrink: 0, paddingTop: 12, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  submitError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 12, borderRadius: 12, backgroundColor: colors.errorLight },
  fieldError: { ...typography.caption, color: colors.error, marginTop: spacing.sm },
  submitErrorText: { ...typography.caption, color: colors.error, flex: 1 },
  questionScroll: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, paddingBottom: spacing.md },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: colors.white, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.62)', marginBottom: spacing.lg },
  measureBlock: { marginTop: spacing.md },
  options: { flexGrow: 1, gap: 12, marginTop: spacing.sm },
  option: {
    flexGrow: 1,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optionSelected: { borderColor: colors.gold, backgroundColor: colors.panelWarm },
  optionText: { ...typography.bodyBold, fontSize: 18, lineHeight: 26, color: colors.white, flex: 1, paddingRight: spacing.sm },
  optionTextSelected: { color: colors.white, fontWeight: '700' },
  textAnswerBlock: { gap: spacing.lg },
  quickPrompt: { ...typography.label, color: colors.inkMuted, marginBottom: 12 },
  coachOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  coachOption: { width: '48%', flexGrow: 1, minHeight: 98, padding: 14, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  coachOptionStacked: { width: '100%' },
  coachOptionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coachOptionText: { ...typography.bodyBold, color: colors.inkMuted },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  quickOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickOption: {
    minHeight: 54,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  quickOptionSelected: { borderColor: colors.gold, backgroundColor: colors.panelWarm },
  quickOptionText: { ...typography.body, color: 'rgba(255,255,255,0.74)', fontWeight: '600' },
  quickOptionTextSelected: { color: colors.gold },
  radio: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  disclaimerText: { ...typography.caption, color: colors.inkSubtle, flex: 1, lineHeight: 17 },
});
