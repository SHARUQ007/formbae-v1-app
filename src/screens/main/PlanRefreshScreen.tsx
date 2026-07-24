import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormInput } from '../../components/FormInput';
import { LoadingState } from '../../components/States';
import { PrimaryButton } from '../../components/PrimaryButton';
import { loadWorkoutPlanCached } from '../../services/preloadService';
import { requestAiPlanRefresh } from '../../services/workoutService';
import type { AiPlanRefresh, PlanDay } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import {
  buildAiPlanRefreshPayload,
  buildAiPlanRefreshQuestions,
  emptyAiPlanRefreshAnswers,
  isAiPlanRefreshComplete,
  splitRefreshSelections,
  toggleRefreshSelection,
  type AiPlanRefreshAnswers,
  type AiPlanRefreshKey,
  type AiPlanRefreshQuestion,
} from '../../constants/aiPlanRefreshQuestionnaire';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'PlanRefresh'>;

function isRestLikeFocus(value?: string) {
  return /^(rest|recovery|off|reset|deload)$/i.test(String(value || '').trim());
}

export function PlanRefreshScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<PlanDay[]>([]);
  const [aiPlanRefresh, setAiPlanRefresh] = useState<AiPlanRefresh | null>(null);
  const [answers, setAnswers] = useState<AiPlanRefreshAnswers>(emptyAiPlanRefreshAnswers);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadWorkoutPlanCached({ force: true });
      const plan = (data.plan || data.today?.plan) as { days?: PlanDay[] } | undefined;
      setDays(plan?.days || []);
      setAiPlanRefresh(data.aiPlanRefresh || null);
    } catch (error) {
      Alert.alert('Could not load check-in', error instanceof Error ? error.message : 'Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const questions = useMemo(() => {
    const missedDays = days
      .filter((day) => !day.completed && !isRestLikeFocus(day.focus) && !isRestLikeFocus(day.notes))
      .map((day) => ({ dayNumber: String(day.dayNumber || ''), focus: String(day.focus || 'Workout') }));
    const focusCounts = new Map<string, number>();
    for (const day of missedDays) {
      const focus = day.focus.trim();
      if (!focus) continue;
      focusCounts.set(focus, (focusCounts.get(focus) || 0) + 1);
    }
    const repeatedMissedFocuses = Array.from(focusCounts.entries())
      .filter(([, count]) => count > 1 || missedDays.length >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([focus]) => focus);
    return buildAiPlanRefreshQuestions({ missedDays, repeatedMissedFocuses });
  }, [days]);

  const submit = async () => {
    const compactAnswers = Object.fromEntries(
      Object.entries(answers).map(([key, value]) => [key, value.trim()]),
    ) as AiPlanRefreshAnswers;
    if (!isAiPlanRefreshComplete(compactAnswers, questions)) {
      Alert.alert('Complete the check-in', 'Complete each step so Ava can rebuild the next two-week plan properly.');
      return;
    }
    if (!aiPlanRefresh?.planId) {
      Alert.alert('Plan not ready', 'Refresh your workout screen and try again.');
      return;
    }

    setSaving(true);
    try {
      await requestAiPlanRefresh({
        planId: aiPlanRefresh.planId,
        aiTrainerAnswers: buildAiPlanRefreshPayload(compactAnswers),
      });
      await loadWorkoutPlanCached({ force: true });
      Alert.alert('New plan built', `${aiPlanRefresh.trainerName || 'Your AI trainer'} rebuilt your workout plan for the next two weeks.`);
      navigation.popToTop();
    } catch (error) {
      Alert.alert('Could not build plan', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading check-in..." />;
  }

  const current = questions[step] || questions[0];
  const stepCount = questions.length;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top + spacing.sm, spacing.lg), paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={26} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>New two-week plan</Text>
          <Text style={styles.title}>{aiPlanRefresh?.trainerName || 'Ava'} check-in</Text>
        </View>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressTop}>
          <Text style={styles.stepText}>Step {step + 1} of {stepCount}</Text>
          <Text style={styles.stepText}>{Math.round(((step + 1) / stepCount) * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          {questions.map((question, index) => (
            <View key={question.key} style={[styles.progressSegment, index <= step && styles.progressSegmentActive]} />
          ))}
        </View>
        <Text style={styles.helperText}>
          One-off travel or sickness is context, not a permanent rule. Build this around what the next two weeks will actually look like.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <QuestionStep
          question={current}
          answers={answers}
          onChange={(key, value) => setAnswers((existing) => ({ ...existing, [key]: value }))}
        />
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondaryButton, (saving || step === 0) && styles.disabled]}
          onPress={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
          disabled={saving || step === 0}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Back</Text>
        </TouchableOpacity>
        {step < stepCount - 1 ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (!answers[current.key]?.trim()) {
                Alert.alert('Pick an option', 'Choose the closest answer before moving ahead.');
                return;
              }
              setStep((currentStep) => Math.min(stepCount - 1, currentStep + 1));
            }}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.submitWrap}>
            <PrimaryButton title="Build my next plan" icon="refresh-cw" onPress={submit} loading={saving} />
          </View>
        )}
      </View>
    </View>
  );
}

function QuestionStep({
  question,
  answers,
  onChange,
}: {
  question: AiPlanRefreshQuestion;
  answers: AiPlanRefreshAnswers;
  onChange: (key: AiPlanRefreshKey, value: string) => void;
}) {
  const selected = splitRefreshSelections(answers[question.key]);
  return (
    <View style={styles.questionCard}>
      <Text style={styles.questionTitle}>{question.title}</Text>
      <Text style={styles.questionDetail}>{question.detail}</Text>
      <View style={styles.options}>
        {question.options.map((option) => {
          const isSelected = question.multiple ? selected.includes(option) : answers[question.key] === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => onChange(question.key, toggleRefreshSelection(answers[question.key], option, question.multiple))}
              accessibilityRole="button"
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {question.notesKey ? (
        <FormInput
          label="Add detail if useful"
          value={answers[question.notesKey]}
          onChangeText={(value) => onChange(question.notesKey!, value)}
          placeholder={question.notesPlaceholder}
          multiline
          autoCapitalize="sentences"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  title: { ...typography.title, color: colors.ink, marginTop: 2 },
  progressCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepText: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  progressTrack: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  progressSegment: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.white },
  progressSegmentActive: { backgroundColor: colors.accent },
  helperText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.sm },
  scroll: { paddingBottom: spacing.lg },
  questionCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.white,
    padding: spacing.lg,
    gap: spacing.md,
  },
  questionTitle: { ...typography.title, color: colors.ink },
  questionDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24 },
  options: { gap: spacing.sm },
  option: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  optionText: { ...typography.bodyBold, color: colors.inkMuted },
  optionTextSelected: { color: colors.accentDark },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
  },
  secondaryButton: {
    flex: 0.75,
    minHeight: 52,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentLight,
  },
  primaryButton: {
    flex: 1.25,
    minHeight: 52,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  submitWrap: { flex: 1.25 },
  disabled: { opacity: 0.5 },
  secondaryText: { ...typography.button, color: colors.accentDark },
  primaryText: { ...typography.button, color: colors.white },
});
