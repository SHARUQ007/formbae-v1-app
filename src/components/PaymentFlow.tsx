/**
 * The one surface a payment is watched through, whichever gateway takes it.
 *
 * Every checkout in the app used to end in an `Alert.alert` written at the call site, so
 * the same pending payment was headed "Renewal issue" on the renewal screen, "Purchase
 * issue" on the paywall and "Payment issue" on the coach screen - and the gap between the
 * store sheet closing and the server answering showed nothing at all. This renders the
 * whole arc instead: opening, authorising, confirming, and then whichever of confirmed,
 * pending, received-but-unconfirmed or failed actually happened.
 *
 * Two rules it exists to enforce, both of which cost money when a call site gets them
 * wrong on its own:
 *
 * A payment that has been taken is never dismissed with one OK button onto a screen whose
 * primary action is "pay". Pending and unconfirmed offer checking and restoring; the pay
 * button is not reachable from them.
 *
 * "Try again" is drawn only when `canRetry` says nothing was charged. paymentOutcome
 * decides that from the gateway's own code, and nothing here second-guesses it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { MotionAnimation } from './MotionAnimation';
import { PrimaryButton } from './PrimaryButton';
import {
  PaymentFlowError,
  cancelledOutcome,
  confirmedOutcome,
  outcomeFromStoreError,
  pendingOutcome,
} from '../services/paymentOutcome';
import type {
  PaymentGateway,
  PaymentOutcome,
  PaymentPhase,
  PaymentProgressPhase,
} from '../services/paymentOutcome';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import type { UserStatus } from '../types/api';

export type PaymentAttemptResult = { active: boolean; status?: UserStatus };

/**
 * One attempt at paying.
 *
 * Handed a `report` so it can say when the sheet is up and when it has closed; the
 * gateway calls that take both steps internally simply never call it, and the flow holds
 * "authorizing" until they return.
 */
export type PaymentAttempt = (
  report: (phase: PaymentProgressPhase) => void,
) => Promise<PaymentAttemptResult>;

type FlowOptions = {
  gateway: PaymentGateway;
  /** Ask the gateway again without paying. Store: /payment/store/sync. Razorpay: /payment/sync. */
  recheck?: () => Promise<PaymentAttemptResult>;
  /** Ask the store for an entitlement bought on another device. Store only. */
  restore?: () => Promise<PaymentAttemptResult>;
  /** Where a confirmed payment goes. The flow does not navigate on its own. */
  onConfirmed: (status?: UserStatus) => void;
};

/**
 * How long we wait before asking again on our own.
 *
 * A store entitlement normally lands within a second or two of the sheet closing, and a
 * UPI mandate within a few more, so most pending payments resolve before anybody reads
 * the screen. Backing off rather than polling flat: past half a minute it is a bank's
 * problem and not a race, and the manual button is the right thing to leave them with.
 */
const RECHECK_DELAYS_MS = [2000, 5000, 12000];

const PROGRESS_STEPS: { phase: PaymentProgressPhase; label: string }[] = [
  { phase: 'opening', label: 'Opening checkout' },
  { phase: 'authorizing', label: 'Waiting for your payment' },
  { phase: 'confirming', label: 'Confirming with FormBae' },
];

export type PaymentFlow = {
  phase: PaymentPhase | 'idle';
  outcome: PaymentOutcome | null;
  busy: boolean;
  /** Working on a recheck or a restore, which keeps the terminal frame but spins its button. */
  rechecking: boolean;
  /** Set when a recheck came back with nothing, so the screen can say so without a dialog. */
  note: string;
  start: (attempt: PaymentAttempt) => Promise<void>;
  retry: () => void;
  recheck: () => void;
  restore: () => void;
  dismiss: () => void;
};

export function usePaymentFlow(options: FlowOptions): PaymentFlow {
  // Read through `handlers` below rather than destructured, so a timer that fires after
  // a re-render calls the screen's current callbacks and not the ones it was created with.
  const { gateway } = options;
  const [phase, setPhase] = useState<PaymentPhase | 'idle'>('idle');
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [note, setNote] = useState('');
  const lastAttempt = useRef<PaymentAttempt | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  // Held in refs so the auto-recheck timers below do not have to be torn down and rebuilt
  // every time a screen re-renders with a new closure.
  const handlers = useRef(options);
  handlers.current = options;

  useEffect(() => () => {
    alive.current = false;
    timers.current.forEach(clearTimeout);
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const settle = useCallback((next: PaymentOutcome) => {
    if (!alive.current) return;
    if (next.phase === 'cancelled') {
      // A dismissed sheet is a choice. It closes the flow and says nothing.
      setPhase('idle');
      setOutcome(null);
      return;
    }
    setOutcome(next);
    setPhase(next.phase);
    if (next.phase === 'confirmed') handlers.current.onConfirmed(next.status);
  }, []);

  /**
   * Ask again, without paying.
   *
   * Shared by the button and by the automatic attempts, so a trainee pressing it while a
   * timer is also running cannot produce two different ideas of what happened: the
   * outstanding timers are dropped the moment either one succeeds.
   */
  const runRecheck = useCallback(async (manual: boolean) => {
    const ask = handlers.current.recheck;
    if (!ask) return;
    if (manual) {
      setRechecking(true);
      setNote('');
    }
    try {
      const result = await ask();
      if (!alive.current) return;
      if (result.active) {
        clearTimers();
        settle(confirmedOutcome(handlers.current.gateway, result.status));
        return;
      }
      if (manual) setNote('Not confirmed yet. We’ll keep checking — this can take a few minutes.');
    } catch {
      if (manual && alive.current) setNote('We couldn’t check just now. Please try again in a moment.');
    } finally {
      if (manual && alive.current) setRechecking(false);
    }
  }, [clearTimers, settle]);

  // A payment that has been taken but not yet read back resolves on its own far more often
  // than not, so the screen chases it rather than leaving the trainee to press a button.
  useEffect(() => {
    if (phase !== 'pending' && phase !== 'unconfirmed') return undefined;
    if (!handlers.current.recheck) return undefined;
    timers.current = RECHECK_DELAYS_MS.map((delay) => setTimeout(() => runRecheck(false), delay));
    return clearTimers;
  }, [phase, runRecheck, clearTimers]);

  const start = useCallback(async (attempt: PaymentAttempt) => {
    if (phase === 'opening' || phase === 'authorizing' || phase === 'confirming') return;
    lastAttempt.current = attempt;
    clearTimers();
    setNote('');
    setOutcome(null);
    setPhase('opening');
    try {
      const result = await attempt((next) => {
        if (alive.current) setPhase(next);
      });
      if (!alive.current) return;
      settle(result.active
        ? confirmedOutcome(gateway, result.status)
        // The gateway took the money and the server does not see an entitlement yet.
        // Pending rather than failed: this is a receipt that has not landed, not a
        // refusal, and the difference is whether we are about to invite a second charge.
        : pendingOutcome(gateway));
    } catch (error) {
      if (!alive.current) return;
      settle(error instanceof PaymentFlowError
        ? error.outcome
        : gateway === 'store'
          ? outcomeFromStoreError(error)
          : { ...cancelledOutcome(gateway), phase: 'failed', title: 'Payment not completed',
              message: error instanceof Error && error.message ? error.message : 'Payment could not be completed. Please try again.',
              canRetry: true, nothingCharged: true });
    }
  }, [clearTimers, gateway, phase, settle]);

  const retry = useCallback(() => {
    // Guarded on the outcome and not on the button: a screen that draws "Try again" by
    // mistake still cannot start a second charge against a payment that was taken.
    if (!outcome?.canRetry || !lastAttempt.current) return;
    start(lastAttempt.current);
  }, [outcome, start]);

  const restore = useCallback(async () => {
    const ask = handlers.current.restore;
    if (!ask) return;
    setRechecking(true);
    setNote('');
    try {
      const result = await ask();
      if (!alive.current) return;
      if (result.active) {
        clearTimers();
        settle(confirmedOutcome(handlers.current.gateway, result.status));
        return;
      }
      setNote('We couldn’t find a purchase on this store account.');
    } catch (error) {
      if (!alive.current) return;
      const translated = outcomeFromStoreError(error);
      if (translated.phase === 'cancelled') return;
      setNote(translated.message);
    } finally {
      if (alive.current) setRechecking(false);
    }
  }, [clearTimers, settle]);

  const dismiss = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setOutcome(null);
    setNote('');
  }, [clearTimers]);

  const busy = phase === 'opening' || phase === 'authorizing' || phase === 'confirming';
  return {
    phase,
    outcome,
    busy,
    rechecking,
    note,
    start,
    retry,
    recheck: () => runRecheck(true),
    restore,
    dismiss,
  };
}

type Frame = {
  eyebrow: string;
  title: string;
  message: string;
  icon: string;
  tone: 'accent' | 'error' | 'success';
};

function terminalFrame(outcome: PaymentOutcome): Frame {
  if (outcome.phase === 'confirmed') {
    return { eyebrow: 'PAYMENT CONFIRMED', title: 'You’re all set.', message: '', icon: 'check', tone: 'success' };
  }
  if (outcome.phase === 'pending') {
    return { eyebrow: 'PAYMENT PENDING', title: outcome.title, message: outcome.message, icon: 'clock', tone: 'accent' };
  }
  if (outcome.phase === 'unconfirmed') {
    // Deliberately the confirmed tone and a tick, not a warning. The money left; what has
    // not arrived is our copy of the receipt, and that is not the trainee's problem.
    return { eyebrow: 'PAYMENT RECEIVED', title: outcome.title, message: outcome.message, icon: 'check-circle', tone: 'success' };
  }
  return { eyebrow: 'PAYMENT NOT COMPLETED', title: outcome.title, message: outcome.message, icon: 'alert-circle', tone: 'error' };
}

function progressFrame(phase: PaymentProgressPhase, gateway: PaymentGateway): Frame {
  if (phase === 'opening') {
    return {
      eyebrow: 'ONE MOMENT',
      title: 'Opening checkout',
      message: gateway === 'store'
        ? 'Getting the store ready. Your plan isn’t charged until you confirm it there.'
        : 'Getting your payment ready. Nothing is charged until you confirm it.',
      icon: '',
      tone: 'accent',
    };
  }
  if (phase === 'authorizing') {
    return {
      eyebrow: 'WAITING FOR YOU',
      title: 'Finish in the payment sheet',
      message: gateway === 'store'
        ? 'Confirm the purchase in the store’s own sheet. We’ll pick it up from there.'
        : 'Approve the payment in the checkout window. If it’s a UPI AutoPay mandate, approve it in your UPI app.',
      icon: '',
      tone: 'accent',
    };
  }
  return {
    eyebrow: 'ALMOST THERE',
    title: 'Confirming your payment',
    message: 'Checking the receipt and unlocking your plan. This only takes a moment — please stay on this screen.',
    icon: '',
    tone: 'accent',
  };
}

/**
 * Render whatever the flow is doing, over whatever screen started it.
 *
 * A modal over the paywall rather than a route of its own, so cancelling returns to the
 * plan that was selected and a retry does not have to rebuild it. It covers the screen
 * completely, which is the point: while a payment is being confirmed there must be no
 * reachable "pay" button behind it.
 */
export function PaymentFlowOverlay({ flow, planName }: { flow: PaymentFlow; planName?: string }) {
  const insets = useSafeAreaInsets();
  const { phase, outcome, rechecking, note } = flow;
  const visible = phase !== 'idle';
  /**
   * A confirmed payment hands off by replacing the route under this, which unmounts it.
   * If that ever fails to happen the screen would be a locked frame with no buttons, so
   * the lock lifts on its own after a few seconds rather than stranding anybody.
   */
  const [handoffStalled, setHandoffStalled] = useState(false);
  useEffect(() => {
    if (phase !== 'confirmed') {
      setHandoffStalled(false);
      return undefined;
    }
    const timer = setTimeout(() => setHandoffStalled(true), 5000);
    return () => clearTimeout(timer);
  }, [phase]);

  // Nothing may dismiss the screen while a charge is being settled, including Android's
  // back gesture: leaving here is how somebody who has paid lands back on the paywall.
  const locked = flow.busy || (phase === 'confirmed' && !handoffStalled);

  useEffect(() => {
    if (!visible) return undefined;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true;
      flow.dismiss();
      return true;
    });
    return () => back.remove();
  }, [visible, locked, flow]);

  if (!visible) return null;

  const frame = flow.busy
    ? progressFrame(phase as PaymentProgressPhase, outcome?.gateway || 'store')
    : terminalFrame(outcome || confirmedOutcome('store'));
  const toneColor = frame.tone === 'error' ? colors.error : frame.tone === 'success' ? colors.success : colors.gold;
  const activeStep = PROGRESS_STEPS.findIndex((step) => step.phase === phase);

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => { if (!locked) flow.dismiss(); }}
    >
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.topRow}>
          {locked ? <View /> : (
            <Pressable
              onPress={flow.dismiss}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Feather name="x" size={20} color={colors.inkMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false}>
          <View accessible accessibilityRole="alert" accessibilityLabel={`${frame.title}. ${frame.message}`} style={styles.hero}>
            {flow.busy ? (
              <MotionAnimation kind="loading" size={84} />
            ) : (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.medallion, { borderColor: toneColor }]}>
                <Feather name={frame.icon} size={34} color={toneColor} />
              </View>
            )}
            <Text style={[styles.eyebrow, { color: toneColor }]}>{frame.eyebrow}</Text>
            <Text style={styles.title}>{frame.title}</Text>
            {frame.message ? <Text style={styles.message}>{frame.message}</Text> : null}
            {planName ? <Text style={styles.plan}>{planName}</Text> : null}
          </View>

          {flow.busy ? (
            <View style={styles.steps}>
              {PROGRESS_STEPS.map((step, index) => {
                const done = index < activeStep;
                const current = index === activeStep;
                return (
                  <View
                    key={step.phase}
                    style={styles.step}
                    accessible
                    // The dot carries the state visually. Said in words too, because a
                    // rail that reads as three equal lines tells a screen reader nothing
                    // about which one is being waited on.
                    accessibilityLabel={`${step.label}: ${done ? 'done' : current ? 'in progress' : 'waiting'}`}
                  >
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}
                    >
                      {done ? <Feather name="check" size={11} color={colors.onPrimary} /> : null}
                    </View>
                    <Text style={[styles.stepText, (done || current) && styles.stepTextActive]}>{step.label}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* The one line that keeps a failed payment from reading like a lost one, and a
              taken payment from reading like a second bill. */}
          {!flow.busy && outcome ? (
            <View style={[styles.assurance, { borderColor: outcome.nothingCharged ? colors.border : colors.accentSurface }]}>
              <Feather name={outcome.nothingCharged ? 'shield' : 'lock'} size={15} color={colors.inkMuted} />
              <Text style={styles.assuranceText}>
                {outcome.nothingCharged
                  ? 'Nothing has been charged.'
                  : 'This payment is already recorded. You won’t be charged again.'}
              </Text>
            </View>
          ) : null}

          {note ? <Text style={styles.note}>{note}</Text> : null}
        </ScrollView>

        {!flow.busy && outcome && outcome.phase !== 'confirmed' ? (
          <View style={styles.actions}>
            {outcome.canRetry ? (
              <PrimaryButton title="Try again" icon="refresh-cw" onPress={flow.retry} size="lg" />
            ) : null}
            {outcome.canRecheck ? (
              <PrimaryButton
                title="Check again"
                icon="refresh-cw"
                variant={outcome.canRetry ? 'secondary' : 'primary'}
                onPress={flow.recheck}
                loading={rechecking}
                size="lg"
              />
            ) : null}
            {outcome.canRestore ? (
              <PrimaryButton title="Restore purchases" variant="ghost" onPress={flow.restore} disabled={rechecking} />
            ) : null}
            <Pressable onPress={flow.dismiss} style={styles.dismiss} accessibilityRole="button">
              <Text style={styles.dismissText}>{outcome.nothingCharged ? 'Not now' : 'I’ll check later'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  topRow: { minHeight: 44, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg, gap: spacing.lg },
  hero: { alignItems: 'center' },
  medallion: { width: 84, height: 84, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: colors.panel },
  eyebrow: { ...typography.overline, marginTop: spacing.lg },
  title: { ...typography.hero, color: colors.inkStrong, textAlign: 'center', marginTop: spacing.sm },
  message: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 340 },
  plan: { ...typography.label, color: colors.inkSubtle, marginTop: spacing.md },
  steps: { gap: spacing.sm, alignSelf: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepDot: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  stepDotCurrent: { borderColor: colors.gold },
  stepDotDone: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  stepText: { ...typography.caption, color: colors.inkSubtle },
  stepTextActive: { color: colors.ink },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'center', maxWidth: 360, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, backgroundColor: colors.panel },
  assuranceText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  note: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', maxWidth: 340, alignSelf: 'center' },
  actions: { flexShrink: 0, gap: spacing.sm, paddingTop: spacing.md },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dismissText: { ...typography.label, color: colors.inkMuted },
});
