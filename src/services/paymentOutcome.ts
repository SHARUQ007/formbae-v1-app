/**
 * One vocabulary for how a payment ended, whichever gateway took it.
 *
 * The app sells through three different things - StoreKit and Play Billing behind
 * RevenueCat, Razorpay for the coach upgrade, and the website's own Razorpay checkout
 * reconciled afterwards - and each hands back a differently shaped failure. Before this
 * module every screen translated its own, which is why the same pending payment read as
 * "Renewal issue" on one screen, "Purchase issue" on the next and "Almost there" on a
 * third, and why a payment that had already been taken could be headed as a problem.
 *
 * The distinction everything here is built around is whether money moved:
 *
 *   failed       nothing was charged, so offering to try again is safe
 *   pending      the charge is committing and the entitlement has not arrived
 *   unconfirmed  the charge went through and we could not read it back
 *
 * Only `failed` may ever show "Try again". The other two show "Check again" and
 * "Restore", because a retry there is a second charge for something already bought -
 * which is how a support ticket becomes a refund request and a store review.
 */
import type { UserStatus } from '../types/api';

/** Phases where we are waiting, and the trainee should see progress rather than a dialog. */
export type PaymentProgressPhase =
  /** Creating the order, or asking the store for the product. Nothing is on screen yet. */
  | 'opening'
  /** The store sheet or Razorpay checkout is up. The payment is out of our hands. */
  | 'authorizing'
  /** The sheet closed and we are asking our own server what it bought. */
  | 'confirming';

export type PaymentPhase =
  | PaymentProgressPhase
  | 'confirmed'
  | 'pending'
  | 'unconfirmed'
  | 'failed'
  /** Dismissed by the trainee. A choice, not a failure, and never shown as one. */
  | 'cancelled';

export type PaymentGateway = 'store' | 'razorpay';

export type PaymentOutcome = {
  phase: Exclude<PaymentPhase, PaymentProgressPhase>;
  gateway: PaymentGateway;
  title: string;
  message: string;
  /**
   * Whether the footnote "Nothing has been charged" is true. Shown only where it is, and
   * read by the overlay rather than restated at each call site.
   */
  nothingCharged: boolean;
  /** Safe to start another payment. True only when nothing was charged. */
  canRetry: boolean;
  /** Worth asking the gateway again, without paying. */
  canRecheck: boolean;
  /** Worth asking the store for an entitlement bought elsewhere. Store only. */
  canRestore: boolean;
  status?: UserStatus;
};

/** A terminal outcome an attempt can throw to say exactly how it ended. */
export class PaymentFlowError extends Error {
  outcome: PaymentOutcome;

  constructor(outcome: PaymentOutcome) {
    super(outcome.message);
    this.outcome = outcome;
  }
}

const CANCELLED = (gateway: PaymentGateway): PaymentOutcome => ({
  phase: 'cancelled',
  gateway,
  title: '',
  message: '',
  nothingCharged: true,
  canRetry: true,
  canRecheck: false,
  canRestore: false,
});

function failed(gateway: PaymentGateway, message: string): PaymentOutcome {
  return {
    phase: 'failed',
    gateway,
    title: 'Payment not completed',
    message,
    nothingCharged: true,
    canRetry: true,
    canRecheck: false,
    // A store failure can still be an entitlement bought on another device, and restoring
    // is free. Razorpay has nothing to restore from.
    canRestore: gateway === 'store',
  };
}

/**
 * The charge is committing and the plan has not arrived.
 *
 * UPI AutoPay mandates and Play's deferred payment methods both land here, and both
 * resolve on their own - usually in seconds, sometimes in a day. The only honest things
 * to offer are waiting and checking, so retrying is off.
 */
export function pendingOutcome(gateway: PaymentGateway, message?: string): PaymentOutcome {
  return {
    phase: 'pending',
    gateway,
    title: 'Payment is still clearing',
    message: message || 'Your bank hasn’t confirmed this yet. We’ll unlock your plan the moment it does — you won’t be charged again.',
    nothingCharged: false,
    canRetry: false,
    canRecheck: true,
    canRestore: gateway === 'store',
  };
}

/**
 * The money left and we could not read the receipt.
 *
 * Headed "Payment received" rather than as a problem, because that is what happened. The
 * entitlement is real - it is held by RevenueCat or by our own verified receipt, not by
 * this app - so this resolves itself; restoring just hurries it.
 */
export function unconfirmedOutcome(gateway: PaymentGateway, message?: string): PaymentOutcome {
  return {
    phase: 'unconfirmed',
    gateway,
    title: 'Payment received',
    message: message || 'We couldn’t confirm it just now. Your plan is on its way — you won’t be charged again.',
    nothingCharged: false,
    canRetry: false,
    canRecheck: true,
    canRestore: gateway === 'store',
  };
}

export function confirmedOutcome(gateway: PaymentGateway, status?: UserStatus): PaymentOutcome {
  return {
    phase: 'confirmed',
    gateway,
    title: 'Payment confirmed',
    message: '',
    nothingCharged: false,
    canRetry: false,
    canRecheck: false,
    canRestore: false,
    status,
  };
}

/**
 * Translate a store failure, from the codes storePurchaseService already distinguishes.
 *
 * Read by code rather than by message: the code is the part that says whether money
 * moved, and getting that wrong is the one mistake with a cost attached.
 */
export function outcomeFromStoreError(error: unknown): PaymentOutcome {
  const code = (error as { code?: string } | undefined)?.code || '';
  const message = (error instanceof Error && error.message) ? error.message : '';
  if (code === 'CANCELLED') return CANCELLED('store');
  if (code === 'PAYMENT_PENDING') return pendingOutcome('store', message);
  if (code === 'NOT_CONFIRMED') return unconfirmedOutcome('store', message);
  if (code === 'NOT_AVAILABLE') {
    return {
      ...failed('store', message || 'This plan isn’t available in your store right now.'),
      title: 'Not available yet',
      // Nothing to restore when the store cannot be reached at all.
      canRestore: false,
    };
  }
  if (code === 'NETWORK') {
    return { ...failed('store', message || 'We couldn’t reach the store. Check your connection and try again.'), title: 'Couldn’t reach the store' };
  }
  return failed('store', message || 'That payment didn’t go through. Nothing has been charged.');
}

/** What runNativeCheckout reports back, without importing it and making a cycle. */
export type RazorpayCheckoutResult = {
  success: boolean;
  status?: UserStatus;
  cancelled?: boolean;
  pendingVerification?: boolean;
  error?: string;
};

/**
 * Translate a Razorpay checkout result.
 *
 * `pendingVerification` is its own thing and not an error: the receipt is already saved to
 * the keychain, and the next sync replays it. Telling somebody to pay again here would
 * charge them twice for a coach they have already bought.
 */
export function outcomeFromCheckoutResult(result: RazorpayCheckoutResult): PaymentOutcome {
  if (result.success) return confirmedOutcome('razorpay', result.status);
  if (result.cancelled) return CANCELLED('razorpay');
  if (result.pendingVerification) {
    return unconfirmedOutcome('razorpay', result.error || undefined);
  }
  return failed('razorpay', result.error || 'Payment could not be completed. Please try again.');
}

export function cancelledOutcome(gateway: PaymentGateway): PaymentOutcome {
  return CANCELLED(gateway);
}

/**
 * Turn a Razorpay result into what a payment attempt returns, or throw how it ended.
 *
 * Exists so the Razorpay screens hand the flow the same shape the store screens do, and
 * neither has to decide for itself whether "pendingVerification" is allowed to show a
 * second pay button. It is not, and that is settled in one place.
 */
export function settleCheckoutResult(result: RazorpayCheckoutResult): { active: boolean; status?: UserStatus } {
  const outcome = outcomeFromCheckoutResult(result);
  if (outcome.phase === 'confirmed') return { active: true, status: outcome.status };
  throw new PaymentFlowError(outcome);
}
