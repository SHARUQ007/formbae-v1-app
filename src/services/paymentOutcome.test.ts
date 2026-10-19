import { StorePurchaseError } from './storePurchaseService';
import {
  PaymentFlowError,
  outcomeFromCheckoutResult,
  outcomeFromStoreError,
  settleCheckoutResult,
} from './paymentOutcome';

describe('what a payment outcome allows next', () => {
  // The whole point of the module: a payment that was taken must never be offered a
  // second one. Asserted per gateway, because each used to decide this for itself.
  test.each([
    ['store deferred payment', outcomeFromStoreError(new StorePurchaseError('PAYMENT_PENDING', 'Still clearing.')), 'pending'],
    ['store charge we could not read back', outcomeFromStoreError(new StorePurchaseError('NOT_CONFIRMED', 'Paid.')), 'unconfirmed'],
    ['razorpay receipt awaiting verification', outcomeFromCheckoutResult({ success: false, pendingVerification: true }), 'unconfirmed'],
  ])('%s never offers to pay again', (_name, outcome, phase) => {
    expect(outcome.phase).toBe(phase);
    expect(outcome.canRetry).toBe(false);
    expect(outcome.canRecheck).toBe(true);
    expect(outcome.nothingCharged).toBe(false);
  });

  test.each([
    ['store refusal', outcomeFromStoreError(new StorePurchaseError('FAILED', 'Card declined.'))],
    ['store network failure', outcomeFromStoreError(new StorePurchaseError('NETWORK', 'Offline.'))],
    ['razorpay failure', outcomeFromCheckoutResult({ success: false, error: 'Card declined.' })],
  ])('%s offers to pay again, and says nothing was charged', (_name, outcome) => {
    expect(outcome.phase).toBe('failed');
    expect(outcome.canRetry).toBe(true);
    expect(outcome.nothingCharged).toBe(true);
  });

  test('a dismissed sheet is a choice, not a failure', () => {
    expect(outcomeFromStoreError(new StorePurchaseError('CANCELLED', '')).phase).toBe('cancelled');
    expect(outcomeFromCheckoutResult({ success: false, cancelled: true }).phase).toBe('cancelled');
  });

  test('a store failure keeps the gateway message rather than a generic one', () => {
    expect(outcomeFromStoreError(new StorePurchaseError('FAILED', 'Card declined.')).message).toBe('Card declined.');
  });

  test('only the store offers restoring, because only it has an entitlement to read', () => {
    expect(outcomeFromStoreError(new StorePurchaseError('PAYMENT_PENDING', '')).canRestore).toBe(true);
    expect(outcomeFromCheckoutResult({ success: false, pendingVerification: true }).canRestore).toBe(false);
  });
});

describe('settleCheckoutResult', () => {
  test('a verified payment becomes an active attempt result', () => {
    expect(settleCheckoutResult({ success: true, status: { hasPaid: true } as never }))
      .toEqual({ active: true, status: { hasPaid: true } });
  });

  test('an unverified payment throws its outcome rather than reading as a failure', () => {
    try {
      settleCheckoutResult({ success: false, pendingVerification: true });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentFlowError);
      expect((error as PaymentFlowError).outcome.phase).toBe('unconfirmed');
      expect((error as PaymentFlowError).outcome.canRetry).toBe(false);
    }
  });
});
