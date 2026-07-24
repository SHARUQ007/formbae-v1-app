import RazorpayCheckout from 'react-native-razorpay';
import { apiRequest } from './apiClient';
import { getRazorpayKeyId } from '../constants/config';
import type { PaymentPlan, UserStatus } from '../types/api';

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
  return apiRequest<{ ok: boolean; status: UserStatus }>('/payment/sync', {
    method: 'POST',
  });
}

export async function createPaymentOrder(params: {
  amount: number;
  paywallId?: string;
  planId?: string;
  selectedTrainerId?: string;
}) {
  return apiRequest<{
    keyId: string;
    order_id: string;
    amount: number;
    currency: string;
    planName: string;
    note: string;
  }>('/payment/create-order', { method: 'POST', body: params });
}

export async function createPaymentSubscription(params: {
  paywallId?: string;
  planId: string;
  selectedTrainerId?: string;
}) {
  return apiRequest<{
    keyId: string;
    subscriptionId: string;
    amount: number;
    currency: string;
    planName: string;
    note: string;
  }>('/payment/create-subscription', { method: 'POST', body: params });
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
  error?: string;
};

/**
 * Full native checkout: create order -> open Razorpay SDK -> verify -> return synced status.
 */
export async function runNativeCheckout(params: {
  plan: PaymentPlan;
  user: { name: string; mobile: string; email?: string };
  paywallId?: string;
  selectedTrainerId?: string;
}): Promise<CheckoutResult> {
  const paywallId = params.paywallId || params.plan.paywallId;
  const isRecurring = params.plan.billing === 'recurring';
  let checkoutTarget:
    | { type: 'order'; keyId: string; orderId: string; amount: number; currency: string; planName: string }
    | { type: 'subscription'; keyId: string; subscriptionId: string; amount: number; currency: string; planName: string };
  try {
    if (isRecurring) {
      const subscription = await createPaymentSubscription({
        paywallId,
        planId: params.plan.planId,
        selectedTrainerId: params.selectedTrainerId,
      });
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
      });
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

  const keyId = checkoutTarget.keyId || getRazorpayKeyId();
  if (!keyId) {
    return { success: false, error: 'Payment is not configured. Please try the web checkout.' };
  }

  const options = {
    key: keyId,
    ...(checkoutTarget.type === 'subscription'
      ? { subscription_id: checkoutTarget.subscriptionId }
      : { order_id: checkoutTarget.orderId }),
    amount: checkoutTarget.amount,
    currency: checkoutTarget.currency,
    name: 'FormBae',
    description: params.plan.label || params.plan.planName,
    prefill: {
      name: params.user.name,
      contact: params.user.mobile,
      email: params.user.email || '',
    },
    theme: { color: '#059669' },
  } as unknown as Parameters<typeof RazorpayCheckout.open>[0];

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

  try {
    const result =
      checkoutTarget.type === 'subscription'
        ? await verifySubscription({
            razorpay_payment_id: checkout.razorpay_payment_id,
            razorpay_subscription_id: checkout.razorpay_subscription_id || checkoutTarget.subscriptionId,
            razorpay_signature: checkout.razorpay_signature,
            paywallId,
          })
        : await verifyPayment({
            razorpay_payment_id: checkout.razorpay_payment_id,
            razorpay_order_id: checkout.razorpay_order_id || checkoutTarget.orderId,
            razorpay_signature: checkout.razorpay_signature,
            paywallId,
          });
    return { success: result.success, status: result.status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment captured but verification failed. It will sync shortly.',
    };
  }
}
