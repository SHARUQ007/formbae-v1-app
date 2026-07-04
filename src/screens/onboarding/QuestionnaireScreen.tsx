import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { ProgressBar } from '../../components/ProgressBar';
import { LoadingState } from '../../components/States';
import { fetchQuestionnaire, saveQuestionnaireDraft, submitQuestionnaire } from '../../services/questionnaireService';
import { loadQuestionnaireDraft, saveQuestionnaireDraft as saveLocalDraft } from '../../store/onboardingStore';
import type { MobileQuestion } from '../../types/api';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Questionnaire'>;

export function QuestionnaireScreen({ navigation }: Props) {
  const [questions, setQuestions] = useState<MobileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const local = await loadQuestionnaireDraft();
      try {
        const data = await fetchQuestionnaire();
        setQuestions(data.questions);
        setAnswers({ ...local, ...data.answers });
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = questions[index];
  const progress = questions.length ? (index + 1) / questions.length : 0;

  const setAnswer = async (value: string) => {
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    await saveLocalDraft(next);
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
      navigation.replace('AnalysisLoading');
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
                {selected ? <Feather name="check" size={14} color={colors.white} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (loading || !current) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading your questionnaire…" />
      </ScreenContainer>
    );
  }

  const isHealth = /injur|restrict|medical|condition|health/i.test(`${current.id} ${current.title}`);

  return (
    <ScreenContainer withBottomInset>
      <View style={styles.progressHeader}>
        <View style={styles.progressTop}>
          {index > 0 ? (
            <TouchableOpacity onPress={() => setIndex(index - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="chevron-left" size={24} color={colors.ink} />
            </TouchableOpacity>
          ) : (
            <View style={styles.spacer} />
          )}
          <Text style={styles.step}>
            {index + 1} / {questions.length}
          </Text>
        </View>
        <ProgressBar value={progress} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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

      <PrimaryButton
        title={index === questions.length - 1 ? 'Submit answers' : 'Continue'}
        icon={index === questions.length - 1 ? 'check' : 'arrow-right'}
        onPress={onNext}
        loading={submitting}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressHeader: { marginBottom: spacing.lg },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  spacer: { width: 24 },
  step: { ...typography.label, color: colors.inkMuted },
  scroll: { paddingBottom: spacing.lg },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  optionText: { ...typography.body, color: colors.ink, flex: 1, paddingRight: spacing.sm },
  optionTextSelected: { color: colors.accentDarker, fontWeight: '600' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
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
