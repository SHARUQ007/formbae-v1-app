import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PlanBuildArt } from '../../components/PlanBuildArt';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { createOnboardingPlan, fetchCoachQuestions, fetchOnboardingPlanState, type OnboardingPlanState } from '../../services/onboardingService';
import { ApiError } from '../../services/apiClient';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

export function PlanPreparingScreen({ navigation, route }: NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>) {
  const { refreshStatus } = useAuthStore();
  const [state, setState] = useState<OnboardingPlanState['status']>('idle');
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const buildRef = useRef<(() => Promise<void>) | null>(null);
  const reduceMotion = useReducedMotion();
  const requestRunning = useRef(false);
  const checkingRef = useRef(false);
  const coachQuestionsPending = useCallback(async () => {
    try {
      const coach = await fetchCoachQuestions();
      return Boolean(coach.required && !coach.completed);
    } catch {
      return false;
    }
  }, []);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await fetchOnboardingPlanState();
      if (alive.current) { setState(result.status); setError(''); }
    } catch {
      if (alive.current) setError('We couldn’t check your plan. Your setup is saved.');
    } finally {
      checkingRef.current = false;
      if (alive.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    (async () => {
      if (await coachQuestionsPending()) {
        if (alive.current) navigation.replace('CoachQuestions');
        return;
      }
      if (!alive.current) return;
      // Arriving from a step that already said "build my plan" should not ask again.
      if (route.params?.autoStart) buildRef.current?.();
      else check();
    })();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => { alive.current = false; subscription.remove(); };
  }, [check, coachQuestionsPending, navigation, route.params?.autoStart]);
  useEffect(() => {
    if (state !== 'building') return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') check(); }, 15000);
    return () => clearInterval(timer);
  }, [state, check]);
  const build = async () => {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setError(''); setState('building');
    try {
      const fresh = await refreshStatus();
      if (!fresh?.hasPaid || !fresh.questionnaireCompleted || !fresh.trainerAssigned) {
        navigation.replace('PaidWelcome'); return;
      }
      // An AI coach has questions of its own; nothing can be built until they are answered.
      if ((fresh.coachQuestionsRequired && !fresh.coachQuestionsCompleted) || await coachQuestionsPending()) {
        navigation.replace('CoachQuestions'); return;
      }
      if (fresh.planReady) { if (alive.current) setState('completed'); return; }
      const result = await createOnboardingPlan();
      if (alive.current) setState(result.status);
    } catch (failure) {
      // The server refuses to plan before the coach has asked; send them there, not to a retry.
      if (failure instanceof ApiError && failure.status === 409 && await coachQuestionsPending()) {
        navigation.replace('CoachQuestions');
        return;
      }
      // A lost response doesn't mean the server failed. Reconcile before offering a retry.
      try {
        const latest = await fetchOnboardingPlanState();
        if (alive.current) {
          setState(latest.status);
          if (latest.status !== 'building' && latest.status !== 'completed') setError('Your plan couldn’t finish. Please try again.');
        }
      } catch { if (alive.current) setError('Connection interrupted. Check your plan status before trying again.'); }
    } finally { requestRunning.current = false; }
  };
  buildRef.current = build;

  const enterRef = useRef<(() => Promise<void>) | null>(null);
  const enteredRef = useRef(false);

  const enter = async () => {
    setChecking(true); setError('');
    try {
      const fresh = await refreshStatus();
      if (fresh?.recommendedNextScreen === 'home') navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
      else { await check(); setError('Your plan is still syncing. Please check again.'); }
    } catch { setError('We couldn’t open your plan. Please try again.'); }
    finally { if (alive.current) setChecking(false); }
  };
  enterRef.current = enter;

  useEffect(() => {
    if (state !== 'completed' || enteredRef.current) return;
    enteredRef.current = true;
    enterRef.current?.();
  }, [state]);

  const building = state === 'building';
  const ready = state === 'completed';
  return <ScreenContainer withBottomInset>
    <ScreenHeader title="Your first plan" onBack={() => navigation.navigate('PaidWelcome')} />
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.art}><PlanBuildArt ready={ready} reduceMotion={reduceMotion} /></View>
        <Text style={styles.eyebrow}>{ready ? 'READY FOR YOU' : building ? 'CREATING YOUR ROUTINE' : 'THE LAST SETUP STEP'}</Text>
        <Text style={styles.title}>{ready ? 'Your first chapter is ready.' : building ? 'A routine that fits your life.' : 'Let’s put your plan together.'}</Text>
        <Text style={styles.subtitle}>{ready ? 'Your workouts are ready. Opening FormBae for you…' : building ? 'We’re writing your sessions from your answers and your coach. This takes a moment and finishes on its own.' : 'We’ll use your goals, starting point and weekly schedule to build your first workouts.'}</Text>
        {(checking || building) && !error ? <Text style={styles.progress}>{checking ? 'Checking your saved setup…' : 'Building your sessions…'}</Text> : null}
      </View>
      <View style={styles.detail}><Feather name="save" size={19} color={colors.gold} /><Text style={styles.detailText}>Your membership, profile and coach selection are saved to your account.</Text></View>
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {building || ready ? null : (
      <PrimaryButton
        title={state === 'failed' ? 'Try creating my plan again' : 'Create my workout plan'}
        onPress={build}
        loading={checking}
        icon="arrow-right"
        iconPosition="trailing"
        style={styles.cta}
      />
    )}
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 16, gap: 16 },
  card: { flex: 1, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 24, backgroundColor: colors.panel, gap: 14 },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  progress: { fontSize: 14, lineHeight: 21, color: colors.gold, fontWeight: '600' },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: colors.gold },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  detail: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 10 },
  detailText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  error: { color: colors.error, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
