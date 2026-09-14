import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { createOnboardingPlan, fetchCoachQuestions, fetchOnboardingPlanState, type OnboardingPlanState } from '../../services/onboardingService';
import { loadProfileSettingsCached, peekProfileSettingsCached } from '../../services/preloadService';
import { getPlanProfileArtwork } from '../../utils/profileArtwork';
import { planTunnelCopy, planTunnelStages, resolvePlanBuildPhase } from '../../utils/planTunnel';
import { ApiError } from '../../services/apiClient';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

export function PlanPreparingScreen({ navigation, route }: NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>) {
  const { refreshStatus, status } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [profileGender, setProfileGender] = useState(() => peekProfileSettingsCached()?.profile?.gender || '');
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
    loadProfileSettingsCached()
      .then((settings) => setProfileGender(settings.profile?.gender || ''))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (state !== 'completed' || enteredRef.current) return;
    enteredRef.current = true;
    enterRef.current?.();
  }, [state]);

  const building = state === 'building';
  const ready = state === 'completed';
  const phase = resolvePlanBuildPhase(state, checking);
  const copy = planTunnelCopy(phase);
  const stages = planTunnelStages(phase, status ?? undefined);
  const artwork = useMemo(() => getPlanProfileArtwork(profileGender), [profileGender]);
  const ringSize = Math.min(240, Math.max(176, width * 0.56));

  return (
    <View style={styles.tunnel}>
      <Image source={artwork} style={styles.backdrop} blurRadius={8} accessibilityIgnoresInvertColors />
      <View style={styles.scrim} />
      {building || ready ? null : (
        <TouchableOpacity
          onPress={() => navigation.navigate('PaidWelcome')}
          style={[styles.back, { top: insets.top + 12 }]}
          accessibilityRole="button"
          accessibilityLabel="Back to setup"
        >
          <Feather name="chevron-left" size={24} color={colors.white} />
        </TouchableOpacity>
      )}
      <View style={[styles.body, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.stage}>
          <View style={{ width: ringSize, height: ringSize }}>
            <TunnelRing active={!ready} reduceMotion={reduceMotion} />
            <Image source={artwork} style={styles.portrait} accessibilityIgnoresInvertColors />
            {ready ? (
              <View style={styles.readyBadge}><Feather name="check" size={20} color={colors.onPrimary} /></View>
            ) : null}
          </View>
        </View>

        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.copy}>{copy.body}</Text>

        <View style={styles.stages}>
          {stages.map((item) => (
            <View key={item.label} style={[styles.stageTile, item.done && styles.stageTileDone]}>
              <Text style={styles.stageLabel}>{item.label}</Text>
              <Text style={[styles.stageValue, item.done && styles.stageValueDone]} numberOfLines={1}>{item.value}</Text>
            </View>
          ))}
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {building || ready ? (
          <Text style={styles.footnote}>Your membership, profile and coach are saved to your account.</Text>
        ) : (
          <PrimaryButton
            title={state === 'failed' ? 'Try creating my plan again' : 'Create my workout plan'}
            onPress={build}
            loading={checking}
            icon="arrow-right"
            iconPosition="trailing"
            style={styles.cta}
          />
        )}
      </View>
    </View>
  );
}

/** The ring the web tunnel spins while the plan is being written. */
function TunnelRing({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.ring, active ? null : styles.ringSettled, { transform: [{ rotate }] }]}
    />
  );
}

const styles = StyleSheet.create({
  tunnel: { flex: 1, backgroundColor: '#02040a' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: 0.3 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2,4,10,0.72)' },
  body: { flex: 1, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', gap: 12 },
  back: {
    position: 'absolute', left: 18, zIndex: 2, width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  stage: { alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: colors.gold,
    borderRightColor: 'rgba(255,255,255,0.5)',
  },
  ringSettled: { borderColor: colors.success },
  portrait: { position: 'absolute', top: '16%', left: '16%', width: '68%', height: '68%', borderRadius: 36 },
  readyBadge: {
    position: 'absolute', right: '12%', bottom: '12%', width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success,
  },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '800', color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: colors.white, textAlign: 'center', letterSpacing: -0.6 },
  copy: { fontSize: 14, lineHeight: 22, color: 'rgba(255,255,255,0.64)', textAlign: 'center', maxWidth: 360 },
  stages: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 10 },
  stageTile: {
    flex: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.07)',
  },
  stageTileDone: { borderColor: 'rgba(248,217,132,0.4)' },
  stageLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: 'rgba(255,255,255,0.42)' },
  stageValue: { marginTop: 5, fontSize: 15, fontWeight: '700', color: colors.white },
  stageValueDone: { color: colors.gold },
  error: { color: colors.error, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  footnote: { fontSize: 12, lineHeight: 19, color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: 12 },
  cta: { alignSelf: 'stretch', marginTop: 16, backgroundColor: colors.gold, borderColor: colors.gold },
});
