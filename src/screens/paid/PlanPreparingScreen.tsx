import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { useAuthStore } from '../../store/authStore';
import { createOnboardingPlan, fetchOnboardingPlanState, type OnboardingPlanState } from '../../services/onboardingService';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

export function PlanPreparingScreen({ navigation }: NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>) {
  const { refreshStatus } = useAuthStore();
  const [state, setState] = useState<OnboardingPlanState['status']>('idle');
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const requestRunning = useRef(false);
  const checkingRef = useRef(false);
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
    check();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => { alive.current = false; subscription.remove(); };
  }, [check]);
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
      if (fresh.planReady) { if (alive.current) setState('completed'); return; }
      const result = await createOnboardingPlan();
      if (alive.current) setState(result.status);
    } catch {
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
  const enter = async () => {
    setChecking(true); setError('');
    try {
      const fresh = await refreshStatus();
      if (fresh?.recommendedNextScreen === 'home') navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
      else { await check(); setError('Your plan is still syncing. Please check again.'); }
    } catch { setError('We couldn’t open your plan. Please try again.'); }
    finally { if (alive.current) setChecking(false); }
  };
  const building = state === 'building';
  const ready = state === 'completed';
  return <ScreenContainer withBottomInset>
    <ScreenHeader title="Your first plan" onBack={() => navigation.navigate('PaidWelcome')} />
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.icon}><Feather name={ready ? 'check' : 'activity'} size={36} color={colors.gold} /></View>
        <Text style={styles.eyebrow}>{ready ? 'READY FOR YOU' : building ? 'CREATING YOUR ROUTINE' : 'THE LAST SETUP STEP'}</Text>
        <Text style={styles.title}>{ready ? 'Your first chapter is ready.' : building ? 'A routine that fits your life.' : 'Let’s put your plan together.'}</Text>
        <Text style={styles.subtitle}>{ready ? 'Your workouts are ready. Start with My day, then explore your plan at your own pace.' : building ? 'We’re creating your sessions from your profile and coach selection. You can return here to check on your plan.' : 'We’ll use your goals, starting point and weekly schedule to build your first workouts.'}</Text>
        {(checking || building) && !error ? <LoadingState message={checking ? 'Checking your saved setup…' : 'Building your sessions…'} /> : null}
      </View>
      <View style={styles.detail}><Feather name="save" size={19} color={colors.gold} /><Text style={styles.detailText}>Your membership, profile and coach selection are saved to your account.</Text></View>
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {building || (checking && !ready) ? <PrimaryButton title="Check plan status" onPress={check} loading={checking} variant="secondary" /> :
      <PrimaryButton title={ready ? 'Enter FormBae' : state === 'failed' ? 'Try creating my plan again' : 'Create my workout plan'} onPress={ready ? enter : build} loading={checking} icon="arrow-right" iconPosition="trailing" style={styles.cta} />}
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingBottom: 24, gap: 20 },
  card: { borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 24, backgroundColor: colors.panel, gap: 18 },
  icon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: colors.gold },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  detail: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 10 },
  detailText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  error: { color: colors.error, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
});
