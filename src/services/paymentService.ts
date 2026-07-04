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
  let order;
  try {
    order = await createPaymentOrder({
      amount: params.plan.amount,
      paywallId: params.paywallId,
      planId: params.plan.planId,
      selectedTrainerId: params.selectedTrainerId,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not start payment' };
  }

  const keyId = order.keyId || getRazorpayKeyId();
  if (!keyId) {
    return { success: false, error: 'Payment is not configured. Please try the web checkout.' };
  }

  const options = {
    key: keyId,
    order_id: order.order_id,
    amount: order.amount,
    currency: order.currency,
    name: 'FormBae',
    description: params.plan.label || params.plan.planName,
    prefill: {
      name: params.user.name,
      contact: params.user.mobile,
      email: params.user.email || '',
    },
    theme: { color: '#059669' },
  };

  let checkout: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
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
    const result = await verifyPayment({
      razorpay_payment_id: checkout.razorpay_payment_id,
      razorpay_order_id: checkout.razorpay_order_id,
      razorpay_signature: checkout.razorpay_signature,
      paywallId: params.paywallId,
    });
    return { success: result.success, status: result.status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment captured but verification failed. It will sync shortly.',
    };
  }
}
