import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/PrimaryButton';
import { StableImage } from '../../components/StableImage';
import { useAuthStore } from '../../store/authStore';
import {
  createOnboardingPlan,
  fetchCoachQuestions,
  fetchOnboardingPlanState,
  type OnboardingPlanState,
  type PlanBuildProgress,
} from '../../services/onboardingService';
import { planTunnelCopy, resolvePlanBuildPhase } from '../../utils/planTunnel';
import { nextPaidSetupStep } from '../../utils/onboarding';
import { resolveOnboardingInitialRoute } from '../../utils/routing';
import { ApiError } from '../../services/apiClient';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';

const AVA_ARTWORK = require('../../assets/editorial/ava-coach-portrait-v2.jpg');
const PLAN_ARTWORK = require('../../assets/editorial/accountability-plan.jpg');
const POLL_INTERVAL_MS = 2_000;

export function PlanPreparingScreen({ navigation, route }: NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>) {
  const { refreshStatus } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const heroMinHeight = insets.top + Math.min(340, Math.max(180, height * 0.3));
  const [state, setState] = useState<OnboardingPlanState['status']>('idle');
  const [progress, setProgress] = useState<PlanBuildProgress | null>(null);
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const stateRef = useRef<OnboardingPlanState['status']>('idle');
  const pollPromise = useRef<Promise<OnboardingPlanState | null> | null>(null);
  const buildRunning = useRef(false);
  const autoStartHandled = useRef(false);
  const entered = useRef(false);

  const coachQuestionsPending = useCallback(async () => {
    try {
      const coach = await fetchCoachQuestions();
      return Boolean(coach.required && !coach.completed);
    } catch {
      return false;
    }
  }, []);

  const applyPlanState = useCallback((next: OnboardingPlanState, authoritative = false) => {
    if (!alive.current) return;
    // A retry can poll the previous failed lease before the new POST claims it.
    // Only the POST itself may end that in-flight attempt with idle/failed state.
    if (!authoritative && buildRunning.current && (next.status === 'idle' || next.status === 'failed')) return;
    if (stateRef.current === 'completed' && next.status !== 'completed') return;
    stateRef.current = next.status;
    setState(next.status);
    if (next.progress) setProgress(next.progress);
    if (next.status === 'building' || next.status === 'completed') setError('');
  }, []);

  const validateSetup = useCallback(async () => {
    const fresh = await refreshStatus();
    if (!alive.current) return false;
    if (!fresh) throw new Error('Setup status unavailable');
    if (!fresh.hasPaid) {
      const parent = navigation.getParent?.() as NativeStackNavigationProp<RootStackParamList> | undefined;
      if (fresh.subscription?.state === 'expired' || fresh.planReady || fresh.recommendedNextScreen === 'renewal') {
        parent?.replace('Renewal');
      } else {
        parent?.replace('Onboarding', { screen: resolveOnboardingInitialRoute(fresh.recommendedNextScreen) });
      }
      setChecking(false);
      setError('Your membership is no longer active. Confirm your membership before building a plan.');
      return false;
    }
    const next = nextPaidSetupStep(fresh);
    if (next === 'Main') {
      applyPlanState({ status: 'completed' }, true);
      return false;
    }
    if (next !== 'PlanPreparing') {
      navigation.replace(next);
      return false;
    }
    if (await coachQuestionsPending()) {
      if (alive.current) navigation.replace('CoachQuestions');
      return false;
    }
    return alive.current;
  }, [applyPlanState, coachQuestionsPending, navigation, refreshStatus]);

  const check = useCallback(() => {
    if (pollPromise.current) return pollPromise.current;
    const request = fetchOnboardingPlanState()
      .then(result => {
        applyPlanState(result);
        return result;
      })
      .catch(() => {
        if (alive.current) setError(stateRef.current === 'building'
          ? 'Live updates lost connection. Your build may still be running. Check again to reconnect.'
          : 'We couldn’t check your plan. Your setup is saved.');
        return null;
      })
      .finally(() => {
        if (pollPromise.current === request) pollPromise.current = null;
        if (alive.current) setChecking(false);
      });
    pollPromise.current = request;
    return request;
  }, [applyPlanState]);

  const build = useCallback(async () => {
    if (buildRunning.current) return;
    buildRunning.current = true;
    let requestStarted = false;
    setError('');
    setChecking(true);
    try {
      if (!await validateSetup()) return;
      stateRef.current = 'building';
      setState('building');
      setProgress({ stage: 'start', message: 'Ava is reading your goals', daysMapped: 0,
        items: [{ kind: 'status', text: 'Ava is reading your goals' }] });
      requestStarted = true;
      const result = await createOnboardingPlan();
      applyPlanState(result, true);
    } catch (failure) {
      if (!alive.current) return;
      if (!requestStarted) {
        stateRef.current = 'failed';
        setState('failed');
        setError('We couldn’t verify your setup. Please try again when you’re connected.');
        return;
      }
      if (failure instanceof ApiError && (failure.status === 403 || failure.status === 409)) {
        try { if (!await validateSetup()) return; } catch { /* The status check below can still recover a running build. */ }
      }
      const latest = await check();
      if (!alive.current) return;
      if (!latest || (latest.status !== 'building' && latest.status !== 'completed')) {
        stateRef.current = latest?.status || 'failed';
        setState(stateRef.current);
        setError(failure instanceof ApiError && failure.isNetwork
          ? 'The connection dropped. Your setup is saved—try again when you’re online.'
          : 'Ava couldn’t finish this build. Your setup is saved, so you can try again.');
      }
    } finally {
      buildRunning.current = false;
      if (alive.current) setChecking(false);
    }
  }, [applyPlanState, check, validateSetup]);

  const enter = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    setError('');
    try {
      const fresh = await refreshStatus();
      if (fresh && !fresh.hasPaid) {
        await validateSetup();
      } else if (fresh?.planReady || fresh?.recommendedNextScreen === 'home') {
        const parent = navigation.getParent?.() as NativeStackNavigationProp<RootStackParamList> | undefined;
        if (parent) parent.replace('Main');
        else setError('Your plan is ready, but we couldn’t open it. Please try again.');
      } else {
        const latest = await check();
        if (latest?.status !== 'completed') setError('Your plan is still syncing. Check again in a moment.');
        else setError('Your plan is ready, but we couldn’t open it. Please try again.');
      }
    } catch {
      if (alive.current) setError('Your plan is ready, but we couldn’t open it. Please try again.');
    } finally {
      if (alive.current) setOpening(false);
    }
  }, [check, navigation, opening, refreshStatus, validateSetup]);

  useEffect(() => {
    alive.current = true;
    (async () => {
      if (route.params?.autoStart && !autoStartHandled.current) {
        autoStartHandled.current = true;
        await build();
      } else if (await validateSetup()) {
        await check();
      }
    })().catch(() => {
      if (alive.current) { setChecking(false); setError('We couldn’t check your setup. Please try again.'); }
    });
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        validateSetup().then(valid => valid ? check() : null).catch(() => {
          if (alive.current) setError('We couldn’t check your setup. Please try again.');
        });
      }
    });
    return () => {
      alive.current = false;
      subscription.remove();
    };
  }, [build, check, route.params?.autoStart, validateSetup]);

  useEffect(() => {
    if (state !== 'building') return undefined;
    check().catch(() => undefined);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') check().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [check, state]);

  useEffect(() => {
    if (state !== 'completed' || entered.current) return;
    entered.current = true;
    enter().catch(() => undefined);
  }, [enter, state]);

  const building = state === 'building';
  const ready = state === 'completed';
  const phase = resolvePlanBuildPhase(state, checking);
  const copy = planTunnelCopy(phase);
  const daysMapped = Math.max(0, Math.min(7, progress?.daysMapped || 0));
  const feed = progress?.items?.slice(0, compact ? 3 : 4) || [];
  const liveMessage = progress?.message || 'Ava is reading your goals';

  return (
    <View style={styles.root}>
      {!building && !ready ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('PaidWelcome')}
          style={[styles.back, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Back to setup"
        >
          <Feather name="chevron-left" size={25} color={colors.white} />
        </TouchableOpacity>
      ) : null}

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.viewport}
      >
        <View style={[styles.hero, { minHeight: heroMinHeight }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <StableImage
            source={PLAN_ARTWORK}
            defaultSource={PLAN_ARTWORK}
            resizeMode="cover"
            style={styles.heroImage}
          />
          <LinearGradient
            colors={['rgba(2,4,10,0.38)', 'rgba(2,4,10,0.12)', 'rgba(2,4,10,0.64)', '#02040a']}
            locations={[0, 0.45, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.content, compact && styles.contentCompact, {
          paddingBottom: Math.max(insets.bottom, 16) + 12,
        }]}>
          <View style={[styles.coachCard, compact && styles.coachCardCompact]}>
            <View style={styles.portraitFrame}>
              <StableImage source={AVA_ARTWORK} defaultSource={AVA_ARTWORK} resizeMode="cover" style={styles.portrait} accessibilityLabel="Ava, your FormBae coach" />
            </View>
            <View style={styles.coachCopy}>
              <View style={styles.coachNameRow}>
                <Text style={styles.coachName}>Ava</Text>
                <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI COACH</Text></View>
              </View>
              <Text style={styles.coachRole}>{building ? 'Designing your first training week' : ready ? 'Your plan is ready' : 'Ready to build around your goals'}</Text>
            </View>
            {building ? <ActivityIndicator color={colors.gold} /> : ready ? <Feather name="check-circle" size={25} color={colors.success} /> : null}
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>{building ? 'BUILDING LIVE' : copy.eyebrow}</Text>
            <Text style={[styles.title, compact && styles.titleCompact]}>{building ? liveMessage : copy.title}</Text>
            <Text style={styles.description}>{building ? 'Watch your training week take shape as Ava maps each session.' : copy.body}</Text>
          </View>

          {building ? (
            <View style={[styles.livePanel, shadows.card]}>
              <View style={styles.liveHeader}>
                <View style={styles.liveStatus}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveLabel}>LIVE UPDATES</Text>
                </View>
                <Text style={styles.dayCount}>{daysMapped} of 7 days</Text>
              </View>
              <View style={styles.days} accessibilityLabel={`${daysMapped} of 7 workout days mapped`}>
                {Array.from({ length: 7 }, (_, day) => (
                  <View key={day} style={styles.dayColumn}>
                    <View style={[styles.dayBar, day < daysMapped && styles.dayBarDone]} />
                    <Text style={[styles.dayLabel, day < daysMapped && styles.dayLabelDone]}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][day]}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.feed}>
                {feed.map((item, itemIndex) => (
                  <View key={`${item.kind}-${item.text}-${itemIndex}`} style={[styles.feedRow, itemIndex === 0 && styles.feedRowCurrent]}>
                    <View style={[styles.feedIcon, itemIndex === 0 && styles.feedIconCurrent]}>
                      <Feather name={item.kind === 'exercise' ? 'plus' : item.kind === 'day' ? 'calendar' : 'activity'} size={14} color={itemIndex === 0 ? colors.onPrimary : colors.inkMuted} />
                    </View>
                    <Text style={[styles.feedText, itemIndex === 0 && styles.feedTextCurrent]} numberOfLines={2}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={18} color={colors.error} />
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            </View>
          ) : null}

          {building ? (
            <>
              {error ? <PrimaryButton title="Check build status" onPress={() => { check().catch(() => undefined); }} variant="secondary" /> : null}
              <View style={styles.savedRow}>
                <Feather name="cloud" size={16} color={colors.inkSubtle} />
                <Text style={styles.savedText}>This keeps building if you leave the screen.</Text>
              </View>
            </>
          ) : ready ? (
            <PrimaryButton title="Open my plan" onPress={enter} loading={opening} icon="arrow-right" iconPosition="trailing" style={styles.cta} />
          ) : (
            <PrimaryButton
              title={state === 'failed' ? 'Try building again' : 'Create my workout plan'}
              onPress={build}
              loading={checking}
              icon="arrow-right"
              iconPosition="trailing"
              style={styles.cta}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040a' },
  scroll: { flex: 1 },
  viewport: { flexGrow: 1 },
  // The hero takes the viewport space left by the cards. On smaller screens,
  // its minimum height preserves the artwork while the full layout can scroll.
  hero: { flexGrow: 1, flexShrink: 0, overflow: 'hidden' },
  heroImage: { position: 'absolute', top: 0, right: 0, width: '135%', height: '100%' },
  back: {
    position: 'absolute', left: 18, zIndex: 2, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,5,8,0.54)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  content: { flexShrink: 0, width: '100%', maxWidth: 604, alignSelf: 'center', marginTop: -36, paddingHorizontal: 22, gap: 20 },
  contentCompact: { gap: 14 },
  coachCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 88, padding: 12,
    borderRadius: 22, backgroundColor: 'rgba(17,18,23,0.94)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  coachCardCompact: { minHeight: 76, padding: 10 },
  portraitFrame: { width: 62, height: 62, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.panelRaised },
  portrait: { width: '100%', height: '100%' },
  coachCopy: { flex: 1, gap: 4 },
  coachNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  coachName: { color: colors.white, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  aiBadge: { borderRadius: 99, backgroundColor: colors.accentLight, paddingHorizontal: 8, paddingVertical: 4 },
  aiBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  coachRole: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  heading: { alignItems: 'center', gap: 8 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.white, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7, textAlign: 'center' },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  description: { maxWidth: 360, color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  livePanel: {
    alignSelf: 'stretch', padding: 16, borderRadius: 22, backgroundColor: 'rgba(17,18,23,0.96)',
    borderWidth: 1, borderColor: 'rgba(240,206,120,0.24)',
  },
  liveHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  liveStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveLabel: { color: colors.success, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  dayCount: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  days: { flexDirection: 'row', gap: 7, marginTop: 14 },
  dayColumn: { flex: 1, alignItems: 'center', gap: 6 },
  dayBar: { width: '100%', height: 6, borderRadius: 99, backgroundColor: colors.panelRaised },
  dayBarDone: { backgroundColor: colors.gold },
  dayLabel: { color: colors.inkSubtle, fontSize: 9, fontWeight: '700' },
  dayLabelDone: { color: colors.gold },
  feed: { gap: 8, marginTop: 14 },
  feedRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 12 },
  feedRowCurrent: { backgroundColor: colors.accentLight },
  feedIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  feedIconCurrent: { backgroundColor: colors.gold },
  feedText: { flex: 1, color: colors.inkSubtle, fontSize: 12, lineHeight: 17 },
  feedTextCurrent: { color: colors.ink, fontWeight: '600' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 14, backgroundColor: colors.errorLight },
  error: { flex: 1, color: colors.error, fontSize: 13, lineHeight: 18 },
  savedRow: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  savedText: { flexShrink: 1, color: colors.inkSubtle, fontSize: 12, lineHeight: 18 },
  cta: { alignSelf: 'stretch', minHeight: 60, borderRadius: 18, backgroundColor: colors.gold, borderColor: colors.gold },
});
