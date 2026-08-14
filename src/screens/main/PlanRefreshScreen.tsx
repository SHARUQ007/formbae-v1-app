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
import { PENDING_AI_PLAN_BUILD_KEY, requestAiPlanRefresh } from '../../services/workoutService';
import { ApiError } from '../../services/apiClient';
import type { AiPlanRefresh, PlanDay } from '../../types/api';
import type { WorkoutStackParamList } from '../../navigation/types';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import {
  buildAiPlanRefreshPayload,
  buildAiPlanRefreshQuestions,
  emptyAiPlanRefreshAnswers,
  isAiPlanRefreshComplete,
  sanitizeAiPlanRefreshAnswers,
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
const CHECK_IN_LOAD_TIMEOUT_MS = 18000;
const SEEN_READY_PLAN_KEY = 'formbae_seen_ready_plan';

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

  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

  const load = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setLoadError(null);
    if (!options?.silent) setDraftReady(false);
    try {
      // The workout screen already warms this cache. Use it immediately so
      // opening the check-in never waits on a duplicate network request.
      const data = await withCheckInTimeout(loadWorkoutPlanCached({ force: options?.force }));
      const plan = (data.plan || data.today?.plan) as { days?: PlanDay[] } | undefined;
      setDays(plan?.days || []);
      const refresh = data.aiPlanRefresh || null;
      setAiPlanRefresh(refresh);
      const buildStatus = refresh?.build?.status;
      if (buildStatus === 'building' || buildStatus === 'requested') {
        setPhase('building');
      } else if (buildStatus === 'completed' && refresh?.build?.newPlanId) {
        await AsyncStorage.setItem(SEEN_READY_PLAN_KEY, refresh.build.newPlanId).catch(() => undefined);
        allowExitRef.current = true;
        setPhase('success');
      } else {
        setPhase('form');
      }
      if (!options?.silent) {
        setAnswers({ ...emptyAiPlanRefreshAnswers });
        setStep(0);
      }
      if (!options?.silent && refresh?.planId) {
        const stored = await AsyncStorage.getItem(`${PLAN_REFRESH_DRAFT_PREFIX}${refresh.planId}`).catch(() => null);
        if (stored) {
          try {
            const draft = JSON.parse(stored) as { answers?: AiPlanRefreshAnswers; step?: number };
            setAnswers(sanitizeAiPlanRefreshAnswers(draft.answers));
            if (typeof draft.step === 'number' && Number.isFinite(draft.step)) {
              setStep(Math.max(0, Math.floor(draft.step)));
            }
          } catch {
            await AsyncStorage.removeItem(`${PLAN_REFRESH_DRAFT_PREFIX}${refresh.planId}`).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Please check your connection and try again.');
    } finally {
      if (!options?.silent) {
        setDraftReady(true);
        setLoading(false);
      }
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
    if (phase !== 'building' && phase !== 'success') return;
    allowExitRef.current = true;
    navigation.popToTop();
  }, [navigation, phase]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowExitRef.current || phase === 'success' || phase === 'building' || (phase === 'form' && !hasAnswers)) return;
    event.preventDefault();
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
    const firstIncompleteIndex = questions.findIndex(
      question => !isAiPlanRefreshComplete(compactAnswers, [question]),
    );
    if (firstIncompleteIndex >= 0) {
      moveToStep(firstIncompleteIndex);
      Alert.alert('Complete the check-in', 'We moved you to the first answer that still needs attention.');
      return;
    }
    if (!aiPlanRefresh?.planId) {
      Alert.alert('Plan not ready', 'Refresh your workout screen and try again.');
      return;
    }
    if (aiPlanRefresh.allowance?.allowed === false) {
      Alert.alert('Check-in unavailable', 'Your current plan is still active. Please try again later.');
      return;
    }

    setSaving(true);
    const pendingBuild = {
      planId: aiPlanRefresh.planId,
      trainerName: aiPlanRefresh.trainerName || 'Ava',
      requestedAt: Date.now(),
    };
    const buildRequest = requestAiPlanRefresh({
      planId: aiPlanRefresh.planId,
      aiTrainerAnswers: buildAiPlanRefreshPayload(compactAnswers),
    });
    try {
      await AsyncStorage.setItem(PENDING_AI_PLAN_BUILD_KEY, JSON.stringify(pendingBuild)).catch(() => undefined);
      allowExitRef.current = true;
      // Give immediate visual confirmation that the press was accepted. The phase effect
      // returns to the workout tab, whose takeover screen follows the persisted build state.
      setPhase('building');
      const result = await buildRequest;
      await AsyncStorage.removeItem(`${PLAN_REFRESH_DRAFT_PREFIX}${aiPlanRefresh.planId}`).catch(() => undefined);
      if (result.status === 'completed' || result.newPlanId) {
        await AsyncStorage.removeItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => undefined);
      }
      await loadWorkoutPlanCached({ force: true }).catch(() => undefined);
    } catch (error) {
      await AsyncStorage.removeItem(PENDING_AI_PLAN_BUILD_KEY).catch(() => undefined);
      if (error instanceof ApiError && error.status === 409 && error.message === 'plan_build_in_progress') {
        setPhase('building');
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        await AsyncStorage.removeItem(`${PLAN_REFRESH_DRAFT_PREFIX}${aiPlanRefresh.planId}`).catch(() => undefined);
        allowExitRef.current = true;
        setPhase('form');
        Alert.alert('Your plan changed', 'A newer workout plan is already active. Open it before starting another check-in.', [
          { text: 'View current plan', onPress: () => navigation.popToTop() },
        ]);
        return;
      }
      const latest = await loadWorkoutPlanCached({ force: true }).catch(() => null);
      const latestRefresh = latest?.aiPlanRefresh || null;
      setAiPlanRefresh(latestRefresh);
      if (latestRefresh?.build?.status === 'building' || latestRefresh?.build?.status === 'requested') {
        setPhase('building');
        return;
      }
      if (latestRefresh?.build?.status === 'completed' && latestRefresh.build.newPlanId) {
        await AsyncStorage.setItem(SEEN_READY_PLAN_KEY, latestRefresh.build.newPlanId).catch(() => undefined);
        setPhase('success');
        allowExitRef.current = true;
        return;
      }
      setPhase('form');
      if (navigation.isFocused()) {
        Alert.alert('Could not build plan', error instanceof Error ? error.message : 'Please try again.');
      }
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

  if (!aiPlanRefresh.due) {
    return <CheckInUnavailable topInset={insets.top} onBack={() => navigation.goBack()} title="Your plan is up to date" detail="There’s no new check-in to complete right now. Keep training with your current plan." />;
  }

  if (aiPlanRefresh.allowance?.allowed === false) {
    return <CheckInUnavailable topInset={insets.top} onBack={() => navigation.goBack()} title="Check-in unavailable" detail="Your current workout plan remains active. Try again later or continue with today’s workout." />;
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

      {aiPlanRefresh.build?.status === 'failed' ? (
        <View style={styles.buildPausedNotice}>
          <View style={styles.buildPausedIcon}><Feather name="refresh-cw" size={16} color={colors.gold} /></View>
          <View style={styles.buildPausedCopy}>
            <Text style={styles.buildPausedTitle}>Your previous build paused</Text>
            <Text style={styles.buildPausedText}>{hasAnswers ? 'Your saved answers are ready to review and submit again.' : 'Complete the check-in to try your next plan again.'}</Text>
          </View>
        </View>
      ) : null}

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
              if (!isAiPlanRefreshComplete(answers, [current])) {
                const needsDetail = Boolean(
                  current.notesKey &&
                    splitRefreshSelections(answers[current.key]).some(option => /other/i.test(option)),
                );
                Alert.alert(
                  needsDetail ? 'Add a little detail' : 'Pick an option',
                  needsDetail ? 'Tell Ava what “Other” means before moving ahead.' : 'Choose the closest answer before moving ahead.',
                );
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
  const needsNotes = selected.some(option => /other/i.test(option));
  const shouldShowNotes = Boolean(question.notesKey && (needsNotes || notesValue.trim()));
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
          label={needsNotes ? 'Tell us more · required' : 'Tell us more'}
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

function CheckInUnavailable({ topInset, title, detail, onBack }: { topInset: number; title: string; detail: string; onBack: () => void }) {
  return (
    <View style={styles.stateScreen}>
      <ScreenHeader topInset={topInset} onBack={onBack} />
      <View style={styles.centeredStateBody}>
        <View style={[styles.stateIcon, styles.currentIcon]}><Feather name="check" size={30} color={colors.onPrimary} /></View>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDetail}>{detail}</Text>
        <PrimaryButton title="Back to workouts" icon="arrow-left" variant="secondary" onPress={onBack} style={styles.stateButton} />
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepText: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { ...typography.caption, color: colors.accent },
  progressTrack: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  progressSegment: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  progressSegmentActive: { backgroundColor: colors.gold },
  buildPausedNotice: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  buildPausedIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelWarm,
  },
  buildPausedCopy: { flex: 1, minWidth: 0 },
  buildPausedTitle: { ...typography.label, color: colors.ink, fontWeight: '800' },
  buildPausedText: { ...typography.caption, color: colors.inkMuted, marginTop: 2, lineHeight: 17 },
  scroll: { paddingBottom: spacing.lg },
  questionCard: {
    gap: spacing.md,
  },
  questionMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  questionMetaText: { ...typography.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.7 },
  questionTitle: { ...typography.title, color: colors.ink },
  questionDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24 },
  options: { gap: spacing.sm },
  option: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionSelected: { borderColor: colors.goldMuted, backgroundColor: colors.panelWarm },
  optionIndicator: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  optionIndicatorSelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  optionText: { ...typography.bodyBold, color: colors.inkMuted, flex: 1 },
  optionTextSelected: { color: colors.accentDark },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
  },
  secondaryButton: {
    flex: 0.75,
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  primaryButton: {
    flex: 1.25,
    minHeight: 52,
    borderRadius: radius.md,
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
  currentIcon: { backgroundColor: colors.primaryAction },
  stateTitle: { ...typography.title, color: colors.ink, textAlign: 'center' },
  stateDetail: { ...typography.body, color: colors.inkMuted, lineHeight: 24, textAlign: 'center', marginTop: spacing.sm, maxWidth: 430 },
  stateButton: { alignSelf: 'stretch', marginTop: spacing.xl },
  skeletonCard: { alignSelf: 'stretch', marginTop: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  skeletonLine: { height: 14, borderRadius: radius.pill, backgroundColor: colors.panelMuted },
  skeletonShort: { width: '38%' },
  skeletonLong: { width: '78%', height: 22 },
  skeletonOption: { height: 54, borderRadius: radius.lg, backgroundColor: colors.panelMuted },
});
