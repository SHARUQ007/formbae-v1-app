import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { loadWorkoutPlanCached } from '../../services/preloadService';
import { requestAiPlanRefresh } from '../../services/workoutService';
import type { AiPlanRefresh, PlanDay } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
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

const PLAN_REFRESH_DRAFT_PREFIX = 'plan-refresh-draft:';
const BUILD_STAGES = [
  { icon: 'bar-chart-2', title: 'Reviewing your last block', detail: 'Looking at completion, difficulty and recovery.' },
  { icon: 'sliders', title: 'Balancing your schedule', detail: 'Adjusting training days, session length and intensity.' },
  { icon: 'calendar', title: 'Building the next two weeks', detail: 'Selecting the right progression for every workout.' },
] as const;
const CHECK_IN_LOAD_TIMEOUT_MS = 18000;

function withCheckInTimeout<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The check-in is taking too long to load. Please try again.')), CHECK_IN_LOAD_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isRestLikeFocus(value?: string) {
  return /^(rest|recovery|off|reset|deload)$/i.test(String(value || '').trim());
}

export function PlanRefreshScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const allowExitRef = useRef(false);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [aiPlanRefresh, setAiPlanRefresh] = useState<AiPlanRefresh | null>(null);
  const [answers, setAnswers] = useState<AiPlanRefreshAnswers>(emptyAiPlanRefreshAnswers);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [phase, setPhase] = useState<'form' | 'building' | 'success'>('form');
  const [buildStage, setBuildStage] = useState(0);

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setLoadError(null);
    setDraftReady(false);
    try {
      // The workout screen already warms this cache. Use it immediately so
      // opening the check-in never waits on a duplicate network request.
      const data = await withCheckInTimeout(loadWorkoutPlanCached({ force: options?.force }));
      const plan = (data.plan || data.today?.plan) as { days?: PlanDay[] } | undefined;
      setDays(plan?.days || []);
      const refresh = data.aiPlanRefresh || null;
      setAiPlanRefresh(refresh);
      if (refresh?.planId) {
        const stored = await AsyncStorage.getItem(`${PLAN_REFRESH_DRAFT_PREFIX}${refresh.planId}`).catch(() => null);
        if (stored) {
          try {
            const draft = JSON.parse(stored) as { answers?: AiPlanRefreshAnswers; step?: number };
            if (draft.answers && typeof draft.answers === 'object') setAnswers({ ...emptyAiPlanRefreshAnswers, ...draft.answers });
            if (typeof draft.step === 'number') setStep(Math.max(0, draft.step));
          } catch {
            await AsyncStorage.removeItem(`${PLAN_REFRESH_DRAFT_PREFIX}${refresh.planId}`).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Please check your connection and try again.');
    } finally {
      setDraftReady(true);
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (questions.length && step >= questions.length) setStep(questions.length - 1);
  }, [questions.length, step]);

  const hasAnswers = useMemo(() => Object.values(answers).some((value) => value.trim().length > 0), [answers]);

  useEffect(() => {
    if (!draftReady || !aiPlanRefresh?.planId || phase !== 'form') return;
    AsyncStorage.setItem(
      `${PLAN_REFRESH_DRAFT_PREFIX}${aiPlanRefresh.planId}`,
      JSON.stringify({ answers, step }),
    ).catch(() => undefined);
  }, [aiPlanRefresh?.planId, answers, draftReady, phase, step]);

  useEffect(() => {
    if (phase !== 'building') return undefined;
    const interval = setInterval(() => {
      setBuildStage((current) => Math.min(BUILD_STAGES.length - 1, current + 1));
    }, 3500);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowExitRef.current || phase === 'success' || (phase === 'form' && !hasAnswers)) return;
    event.preventDefault();
    if (phase === 'building') {
      Alert.alert('Your plan is still being built', 'Keep this screen open for a moment so the new plan can finish safely.');
      return;
    }
    Alert.alert('Leave this check-in?', 'Your answers are saved on this phone and will be here when you return.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', onPress: () => {
        allowExitRef.current = true;
        navigation.dispatch(event.data.action);
      } },
    ]);
  }), [hasAnswers, navigation, phase]);

  const moveToStep = (nextStep: number) => {
    setStep(Math.max(0, Math.min(questions.length - 1, nextStep)));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

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
    setBuildStage(0);
    setPhase('building');
    try {
      await requestAiPlanRefresh({
        planId: aiPlanRefresh.planId,
        aiTrainerAnswers: buildAiPlanRefreshPayload(compactAnswers),
      });
      await AsyncStorage.removeItem(`${PLAN_REFRESH_DRAFT_PREFIX}${aiPlanRefresh.planId}`).catch(() => undefined);
      await loadWorkoutPlanCached({ force: true }).catch(() => undefined);
      setPhase('success');
      allowExitRef.current = true;
      navigation.popToTop();
    } catch (error) {
      setPhase('form');
      Alert.alert('Could not build plan', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <CheckInLoading topInset={insets.top} onBack={() => navigation.goBack()} />;
  }

  if (loadError || !aiPlanRefresh) {
    return (
      <CheckInError
        topInset={insets.top}
        message={loadError || 'This check-in is no longer available. Your current plan may already be up to date.'}
        onBack={() => navigation.goBack()}
        onRetry={() => load({ force: true })}
      />
    );
  }

  if (phase === 'building') {
    return <BuildingPlanScreen topInset={insets.top} trainerName={aiPlanRefresh.trainerName || 'Ava'} stage={buildStage} />;
  }

  if (phase === 'success') {
    return (
      <PlanReadyScreen
        topInset={insets.top}
        trainerName={aiPlanRefresh.trainerName || 'Ava'}
        onContinue={() => navigation.popToTop()}
      />
    );
  }

  const current = questions[step] || questions[0];
  const stepCount = questions.length;

  if (!current) {
    return <CheckInError topInset={insets.top} message="No check-in questions were available." onBack={() => navigation.goBack()} onRetry={() => load({ force: true })} />;
  }

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
          <View style={styles.timePill}><Feather name="clock" size={13} color={colors.accent} /><Text style={styles.timeText}>About 2 min</Text></View>
        </View>
        <View style={styles.progressTrack}>
          {questions.map((question, index) => (
            <View key={question.key} style={[styles.progressSegment, index <= step && styles.progressSegmentActive]} />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.formArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <QuestionStep question={current} answers={answers} onChange={(key, value) => setAnswers((existing) => ({ ...existing, [key]: value }))} />
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondaryButton, (saving || step === 0) && styles.disabled]}
          onPress={() => moveToStep(step - 1)}
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
              moveToStep(step + 1);
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
      </KeyboardAvoidingView>
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
  const notesValue = question.notesKey ? answers[question.notesKey] : '';
  const shouldShowNotes = Boolean(question.notesKey && (selected.some((option) => /other/i.test(option)) || notesValue.trim()));
  return (
    <View style={styles.questionCard}>
      <View style={styles.questionMeta}>
        <Feather name={question.multiple ? 'check-square' : 'circle'} size={15} color={colors.accent} />
        <Text style={styles.questionMetaText}>{question.multiple ? 'Choose all that apply' : 'Choose one'}</Text>
      </View>
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
              accessibilityRole={question.multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ selected: isSelected, checked: isSelected }}
            >
              <View style={[styles.optionIndicator, isSelected && styles.optionIndicatorSelected]}>
                {isSelected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
              </View>
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {question.notesKey && shouldShowNotes ? (
        <FormInput
          label="Tell us more"
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

function ScreenHeader({ topInset, onBack }: { topInset: number; onBack?: () => void }) {
  return (
    <View style={[styles.stateHeader, { paddingTop: Math.max(topInset + spacing.sm, spacing.lg) }]}>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={26} color={colors.ink} />
        </TouchableOpacity>
      ) : <View style={styles.headerSpacer} />}
      <Text style={styles.stateHeaderTitle}>Plan check-in</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function CheckInLoading({ topInset, onBack }: { topInset: number; onBack: () => void }) {
  return (
    <View style={styles.stateScreen}>
      <ScreenHeader topInset={topInset} onBack={onBack} />
      <View style={styles.stateBody}>
        <View style={styles.loadingOrb}><ActivityIndicator size="small" color={colors.accent} /></View>
        <Text style={styles.stateTitle}>Getting your check-in ready</Text>
        <Text style={styles.stateDetail}>Reviewing your current block and loading the questions that matter for your next plan.</Text>
        <View style={styles.skeletonCard}>
          <View style={[styles.skeletonLine, styles.skeletonShort]} />
          <View style={[styles.skeletonLine, styles.skeletonLong]} />
          {[0, 1, 2].map((item) => <View key={item} style={styles.skeletonOption} />)}
        </View>
      </View>
    </View>
  );
}

function CheckInError({ topInset, message, onBack, onRetry }: { topInset: number; message: string; onBack: () => void; onRetry: () => void }) {
  return (
    <View style={styles.stateScreen}>
      <ScreenHeader topInset={topInset} onBack={onBack} />
      <View style={styles.centeredStateBody}>
        <View style={[styles.stateIcon, styles.errorIcon]}><Feather name="wifi-off" size={28} color={colors.error} /></View>
        <Text style={styles.stateTitle}>We couldn’t load your check-in</Text>
        <Text style={styles.stateDetail}>{message}</Text>
        <PrimaryButton title="Try again" icon="refresh-cw" onPress={onRetry} style={styles.stateButton} />
      </View>
    </View>
  );
}

function BuildingPlanScreen({ topInset, trainerName, stage }: { topInset: number; trainerName: string; stage: number }) {
  return (
    <View style={styles.stateScreen}>
      <ScreenHeader topInset={topInset} />
      <View style={styles.buildBody}>
        <View style={styles.buildHero}>
          <View style={styles.loadingOrb}><ActivityIndicator size="small" color={colors.accent} /></View>
          <Text style={styles.buildKicker}>Creating your next block</Text>
          <Text style={styles.stateTitle}>{trainerName} is building your plan</Text>
          <Text style={styles.stateDetail}>Keep this screen open. This can take a minute while every session is adjusted to your check-in.</Text>
        </View>
        <View style={styles.buildCard}>
          {BUILD_STAGES.map((item, index) => {
            const complete = index < stage;
            const active = index === stage;
            return (
              <View key={item.title} style={styles.buildRow}>
                <View style={[styles.buildIcon, (complete || active) && styles.buildIconActive]}>
                  {complete ? <Feather name="check" size={16} color={colors.onPrimary} /> : active ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Feather name={item.icon} size={16} color={colors.inkSubtle} />}
                </View>
                <View style={styles.buildText}>
                  <Text style={[styles.buildTitle, (complete || active) && styles.buildTitleActive]}>{item.title}</Text>
                  <Text style={styles.buildDetail}>{item.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text style={styles.safeNote}><Feather name="shield" size={14} color={colors.inkSubtle} /> Your answers are saved until the new plan is ready.</Text>
      </View>
    </View>
  );
}

function PlanReadyScreen({ topInset, trainerName, onContinue }: { topInset: number; trainerName: string; onContinue: () => void }) {
  return (
    <View style={styles.stateScreen}>
      <ScreenHeader topInset={topInset} />
      <View style={styles.centeredStateBody}>
        <View style={[styles.stateIcon, styles.successIcon]}><Feather name="check" size={34} color={colors.onPrimary} /></View>
        <Text style={styles.successKicker}>Your next two weeks</Text>
        <Text style={styles.stateTitle}>Your new plan is ready</Text>
        <Text style={styles.stateDetail}>{trainerName} used your check-in to update the schedule, difficulty and recovery across your workouts.</Text>
        <View style={styles.readyCard}>
          <View style={styles.readyItem}><Feather name="calendar" size={18} color={colors.accent} /><Text style={styles.readyText}>A fresh two-week training block</Text></View>
          <View style={styles.readyItem}><Feather name="sliders" size={18} color={colors.accent} /><Text style={styles.readyText}>Adjusted to your recent feedback</Text></View>
        </View>
        <PrimaryButton title="View my new plan" icon="arrow-right" onPress={onContinue} style={styles.stateButton} />
      </View>
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
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  title: { ...typography.title, color: colors.ink, marginTop: 2 },
  formArea: { flex: 1 },
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
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { ...typography.caption, color: colors.accent },
  progressTrack: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  progressSegment: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  progressSegmentActive: { backgroundColor: colors.gold },
  scroll: { paddingBottom: spacing.lg },
  questionCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.panelRaised,
    padding: spacing.lg,
    gap: spacing.md,
  },
  questionMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  questionMetaText: { ...typography.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.7 },
  questionTitle: { ...typography.title, color: colors.ink },
  questionDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24 },
  options: { gap: spacing.sm },
  option: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  optionIndicator: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  optionIndicatorSelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  optionText: { ...typography.bodyBold, color: colors.inkMuted, flex: 1 },
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
    backgroundColor: colors.primaryAction,
  },
  submitWrap: { flex: 1.25 },
  disabled: { opacity: 0.5 },
  secondaryText: { ...typography.button, color: colors.accentDark },
  primaryText: { ...typography.button, color: colors.onPrimary },
  stateScreen: { flex: 1, backgroundColor: colors.bg },
  stateHeader: { minHeight: 76, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateHeaderTitle: { ...typography.bodyBold, color: colors.ink },
  headerSpacer: { width: 48, height: 48 },
  stateBody: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, alignItems: 'center' },
  centeredStateBody: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, alignItems: 'center', justifyContent: 'center' },
  loadingOrb: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  stateIcon: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  errorIcon: { backgroundColor: colors.errorLight, borderWidth: 1, borderColor: 'rgba(255,129,140,0.3)' },
  successIcon: { backgroundColor: colors.primaryAction },
  stateTitle: { ...typography.title, color: colors.ink, textAlign: 'center' },
  stateDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24, textAlign: 'center', marginTop: spacing.sm, maxWidth: 430 },
  stateButton: { alignSelf: 'stretch', marginTop: spacing.xl },
  skeletonCard: { alignSelf: 'stretch', marginTop: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  skeletonLine: { height: 14, borderRadius: radius.pill, backgroundColor: colors.panelMuted },
  skeletonShort: { width: '38%' },
  skeletonLong: { width: '78%', height: 22 },
  skeletonOption: { height: 54, borderRadius: radius.lg, backgroundColor: colors.panelMuted },
  buildBody: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  buildHero: { alignItems: 'center' },
  buildKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: spacing.xs },
  buildCard: { marginTop: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, padding: spacing.lg, gap: spacing.lg },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  buildIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center' },
  buildIconActive: { backgroundColor: colors.primaryAction },
  buildText: { flex: 1 },
  buildTitle: { ...typography.bodyBold, color: colors.inkSubtle },
  buildTitleActive: { color: colors.ink },
  buildDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  safeNote: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.lg },
  successKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: spacing.xs },
  readyCard: { alignSelf: 'stretch', marginTop: spacing.xl, padding: spacing.lg, gap: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  readyItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  readyText: { ...typography.body, color: colors.ink, flex: 1 },
});
