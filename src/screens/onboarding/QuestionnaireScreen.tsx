import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { fetchQuestionnaire, saveQuestionnaireDraft, submitQuestionnaire } from '../../services/questionnaireService';
import { loadQuestionnaireDraft, saveQuestionnaireDraft as saveLocalDraft } from '../../store/onboardingStore';
import type { MobileQuestion } from '../../types/api';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

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
      return <FormInput value={answers[current.id] || ''} onChangeText={setAnswer} placeholder="Optional notes" />;
    }
    return (
      <View style={styles.options}>
        {current.options?.map((opt) => {
          const selected = answers[current.id] === opt.value;
          return (
            <TouchableOpacity key={opt.value} style={[styles.option, selected && styles.optionSelected]} onPress={() => setAnswer(opt.value)}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (loading || !current) {
    return (
      <ScreenContainer>
        <ScreenTitle>Loading questionnaire…</ScreenTitle>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.step}>Question {index + 1} of {questions.length}</Text>
      <ScreenTitle>{current.title}</ScreenTitle>
      {current.subtitle ? <ScreenSubtitle>{current.subtitle}</ScreenSubtitle> : null}
      <ScrollView>
        {renderBody()}
        {/injur|restrict|medical|condition|health/i.test(`${current.id} ${current.title}`) ? (
          <Text style={styles.disclaimer}>
            FormBae provides fitness coaching, not medical advice. If you have an injury or medical condition, please
            consult a qualified healthcare professional before starting any program.
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.actions}>
        {index > 0 ? <PrimaryButton title="Back" variant="secondary" onPress={() => setIndex(index - 1)} /> : null}
        <PrimaryButton title={index === questions.length - 1 ? 'Submit' : 'Continue'} onPress={onNext} loading={submitting} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 99, marginBottom: 16 },
  progressFill: { height: 6, backgroundColor: colors.accent, borderRadius: 99 },
  step: { color: colors.inkMuted, marginBottom: 8 },
  options: { gap: 10 },
  option: { backgroundColor: colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  optionText: { fontSize: 16, color: colors.ink },
  optionTextSelected: { color: colors.accentDark, fontWeight: '600' },
  actions: { gap: 10, marginTop: 12 },
  disclaimer: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 16, fontStyle: 'italic' },
});
