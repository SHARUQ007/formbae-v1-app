import RazorpayCheckout from 'react-native-razorpay';
import { apiRequest, getAuthToken } from './apiClient';
import * as Keychain from 'react-native-keychain';
import { getActiveCacheSessionId } from './appCache';
import type { HouseholdMemberProfile, PaymentPlan, UserStatus } from '../types/api';

export async function fetchPaymentStatus() {
  return apiRequest<{
    hasPaid: boolean;
    paymentStatus: string;
    access: Record<string, unknown>;
    plans: PaymentPlan[];
    paywallId?: string;
    flowSlug?: string;
    paymentUrl: string;
  }>('/payment/status');
}

export async function syncPayment() {
  const recovered = await recoverPendingPayment();
  if (recovered) return { ok: true, status: recovered.status };
  return apiRequest<{ ok: boolean; status: UserStatus }>('/payment/sync', {
    method: 'POST',
  });
}

export async function createPaymentOrder(params: {
  amount: number;
  paywallId?: string;
  planId?: string;
  selectedTrainerId?: string;
}, token = getAuthToken()) {
  return apiRequest<{
    keyId: string;
    order_id: string;
    amount: number;
    currency: string;
    planName: string;
    note: string;
  }>('/payment/create-order', { method: 'POST', body: params, token });
}

export async function createPaymentSubscription(params: {
  paywallId?: string;
  planId: string;
  selectedTrainerId?: string;
  householdMembers?: HouseholdMemberProfile[];
}, token = getAuthToken()) {
  return apiRequest<{
    keyId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    planName: string;
    note: string;
  }>('/payment/create-subscription', { method: 'POST', body: params, token });
}

export async function verifyPayment(body: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  paywallId?: string;
}) {
  return apiRequest<{ success: boolean; status: UserStatus }>('/payment/verify', {
    method: 'POST',
    body,
  });
}

export async function verifySubscription(body: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
  paywallId?: string;
}) {
  return apiRequest<{ success: boolean; status: UserStatus }>('/payment/verify-subscription', {
    method: 'POST',
    body,
  });
}

export type CheckoutResult = {
  success: boolean;
  status?: UserStatus;
  cancelled?: boolean;
  pendingVerification?: boolean;
  error?: string;
};

function normalizeCheckoutContact(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Full native checkout: create order -> open Razorpay SDK -> verify -> return synced status.
 */
async function performNativeCheckout(params: {
  plan: PaymentPlan;
  user: { name: string; mobile: string; email?: string };
  paywallId?: string;
  selectedTrainerId?: string;
  householdMembers?: HouseholdMemberProfile[];
  /** Prevent renewal flows from ever falling back to a one-time Razorpay order. */
  requireRecurring?: boolean;
}, identity: string, token: string): Promise<CheckoutResult> {
  const paywallId = params.paywallId || params.plan.paywallId;
  const isRecurring = params.plan.billing === 'recurring';
  if (params.requireRecurring && !isRecurring) {
    return {
      success: false,
      error: 'AutoPay is not available for this renewal plan. Refresh the plans and try again.',
    };
  }
  let checkoutTarget:
    | { type: 'order'; keyId: string; orderId: string; amount: number; currency: string; planName: string }
    | { type: 'subscription'; keyId: string; subscriptionId: string; amount: number; currency: string; planName: string };
  try {
    if (isRecurring) {
      const subscription = await createPaymentSubscription({
        paywallId,
        planId: params.plan.planId,
        selectedTrainerId: params.selectedTrainerId,
        householdMembers: params.householdMembers,
      }, token);
      checkoutTarget = {
        type: 'subscription',
        keyId: subscription.keyId,
        subscriptionId: subscription.subscriptionId,
        amount: subscription.amount,
        currency: subscription.currency,
        planName: subscription.planName,
      };
    } else {
      const order = await createPaymentOrder({
        amount: params.plan.amount,
        paywallId,
        planId: params.plan.planId,
        selectedTrainerId: params.selectedTrainerId,
      }, token);
      checkoutTarget = {
        type: 'order',
        keyId: order.keyId,
        orderId: order.order_id,
        amount: order.amount,
        currency: order.currency,
        planName: order.planName,
      };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not start payment' };
  }

  const keyId = checkoutTarget.keyId;
  if (!keyId) {
    return { success: false, error: 'Payment is not configured. Please try again shortly.' };
  }

  const contact = normalizeCheckoutContact(params.user.mobile);
  const email = params.user.email?.trim() || '';
  const recurringCheckout = checkoutTarget.type === 'subscription';
  const upiFirstCheckout = checkoutTarget.currency.toUpperCase() === 'INR';

  const options = {
    key: keyId,
    ...(checkoutTarget.type === 'subscription'
      ? { subscription_id: checkoutTarget.subscriptionId }
      : { order_id: checkoutTarget.orderId }),
    amount: checkoutTarget.amount,
    currency: checkoutTarget.currency,
    name: 'FormBae',
    description: recurringCheckout
      ? `${params.plan.label || params.plan.planName} AutoPay mandate`
      : params.plan.label || params.plan.planName,
    prefill: {
      name: params.user.name,
      contact,
      email,
    },
    // Razorpay preselects UPI only when both contact and email are available.
    // The display block below still keeps UPI first when an email is absent.
    ...(upiFirstCheckout && contact && email ? { method: 'upi' } : {}),
    ...(upiFirstCheckout
      ? {
          config: {
            display: {
              blocks: {
                upi: {
                  name: recurringCheckout ? 'Set up AutoPay with UPI' : 'Pay with UPI',
                  instruments: [{ method: 'upi' }],
                },
              },
              sequence: ['block.upi'],
              preferences: { show_default_blocks: true },
            },
          },
        }
      : {}),
    retry: { enabled: true, max_count: 4 },
    send_sms_hash: true,
    modal: { animation: true, backdropclose: false },
    theme: { color: '#F0CE78', backdrop_color: '#05060A' },
  } as unknown as Parameters<typeof RazorpayCheckout.open>[0];

  if (getAuthToken() !== token || getActiveCacheSessionId() !== identity) {
    return { success: false, error: 'Your account changed. Please reopen checkout.' };
  }

  let checkout: {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature: string;
  };
  try {
    checkout = await RazorpayCheckout.open(options);
  } catch (error) {
    const err = error as { code?: number; description?: string };
    if (err?.code === 0 || /cancel/i.test(err?.description || '')) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err?.description || 'Payment failed' };
  }

  const receipt: PendingPayment = {
    type: checkoutTarget.type,
    body: {
      razorpay_payment_id: checkout.razorpay_payment_id,
      razorpay_signature: checkout.razorpay_signature,
      ...(checkoutTarget.type === 'subscription'
        ? { razorpay_subscription_id: checkoutTarget.subscriptionId }
        : { razorpay_order_id: checkoutTarget.orderId }),
      paywallId,
    },
  };
  pendingReceipts.set(identity, receipt);
  try {
    await Keychain.setGenericPassword('payment-receipt', JSON.stringify(receipt), { service: paymentServiceKey(identity) });
  } catch {
    // Keep the proof in memory and still attempt verification if secure storage is unavailable.
  }
  try {
    if (getAuthToken() !== token || getActiveCacheSessionId() !== identity) {
      throw new Error('Return to the account used for this payment to finish verification.');
    }
    const result = await recoverPendingPayment();
    return { success: true, status: result?.status };
  } catch {
    return { success: false, pendingVerification: true,
      error: 'Payment received. Refresh payment status to finish verification; please do not pay again.' };
  }
}

type PendingPayment = {
  type: 'order' | 'subscription';
  body: {
    razorpay_payment_id: string;
    razorpay_signature: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    paywallId?: string;
  };
};
const pendingReceipts = new Map<string, PendingPayment>();
const paymentServiceKey = (identity: string) => `com.formbae.payment.${identity}`;
let checkoutInProgress = false;

async function recoverPendingPayment() {
  const identity = getActiveCacheSessionId();
  const token = getAuthToken();
  if (!token || identity === 'signed-out') return null;
  let receipt = pendingReceipts.get(identity);
  if (!receipt) {
    const saved = await Keychain.getGenericPassword({ service: paymentServiceKey(identity) });
    if (saved) receipt = JSON.parse(saved.password) as PendingPayment;
  }
  if (!receipt) return null;
  if (!receipt.body?.razorpay_payment_id || !receipt.body.razorpay_signature
    || !['order', 'subscription'].includes(receipt.type)) {
    throw new Error('Your saved payment needs review. Please contact support before paying again.');
  }
  const result = await apiRequest<{ success: boolean; status: UserStatus }>(
    receipt.type === 'subscription' ? '/payment/verify-subscription' : '/payment/verify',
    { method: 'POST', body: receipt.body, token },
  );
  if (!result.success) throw new Error('Payment verification is still pending.');
  pendingReceipts.delete(identity);
  await Keychain.resetGenericPassword({ service: paymentServiceKey(identity) }).catch(() => undefined);
  if (getAuthToken() !== token || getActiveCacheSessionId() !== identity) {
    throw new Error('Your account changed. Refresh payment status after signing in again.');
  }
  return result;
}

export async function runNativeCheckout(params: Parameters<typeof performNativeCheckout>[0]): Promise<CheckoutResult> {
  if (checkoutInProgress) return { success: false, error: 'A payment is already in progress.' };
  const token = getAuthToken();
  const identity = getActiveCacheSessionId();
  if (!token || identity === 'signed-out') return { success: false, error: 'Please sign in before paying.' };
  checkoutInProgress = true;
  try {
    const recovered = await recoverPendingPayment();
    if (recovered) return { success: true, status: recovered.status };
    return await performNativeCheckout(params, identity, token);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not check your payment status. Please try again.' };
  } finally {
    checkoutInProgress = false;
  }
}
