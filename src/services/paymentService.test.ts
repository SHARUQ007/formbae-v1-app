import RazorpayCheckout from 'react-native-razorpay';
import * as Keychain from 'react-native-keychain';
import { apiRequest, getAuthToken } from './apiClient';
import { setCacheSession } from './appCache';
import { runNativeCheckout } from './paymentService';
import type { PaymentPlan } from '../types/api';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn(), getAuthToken: jest.fn(() => 'token') }));
const request = jest.mocked(apiRequest);
const sdk = jest.mocked(RazorpayCheckout.open);
const params = { plan: { planId: 'monthly__bronze', planName: 'Monthly', amount: 150000, billing: 'one_time' } as PaymentPlan, user: { name: 'Test', mobile: '9876543210' } };
const order = { keyId: 'key', order_id: 'order_1', amount: 150000, currency: 'INR', planName: 'Monthly' };
const proof = { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_1', razorpay_signature: 'proof' };
beforeEach(() => {
  jest.clearAllMocks();
  setCacheSession('token', expect.getState().currentTestName);
  jest.mocked(getAuthToken).mockReturnValue('token');
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue(false);
  sdk.mockResolvedValue(proof);
});
test('verification retry reuses the receipt without creating another charge', async () => {
  request.mockResolvedValueOnce(order).mockRejectedValueOnce(new Error('offline'));
  const initial = await runNativeCheckout(params);
  expect(initial.pendingVerification).toBe(true);
  expect(Keychain.setGenericPassword).toHaveBeenCalled();
  request.mockResolvedValueOnce({ success: true, status: { hasPaid: true } });
  const retry = await runNativeCheckout(params);
  expect(retry.success).toBe(true);
  expect(sdk).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.filter(([path]) => path === '/payment/create-order')).toHaveLength(1);
});
test('saved receipt recovers after process restart before new checkout', async () => {
  jest.mocked(Keychain.getGenericPassword).mockResolvedValue({ username: 'payment-receipt', password: JSON.stringify({ type: 'order', body: proof }), service: 'test', storage: 'test' } as never);
  request.mockResolvedValueOnce({ success: true, status: { hasPaid: true } });
  expect((await runNativeCheckout(params)).success).toBe(true);
  expect(sdk).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith('/payment/verify', expect.objectContaining({ token: 'token' }));
});
test('cancelled checkout does not store or verify a payment', async () => {
  request.mockResolvedValueOnce(order);
  sdk.mockRejectedValueOnce({ code: 0, description: 'Cancelled' });
  expect((await runNativeCheckout(params)).cancelled).toBe(true);
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
test('account change during order creation prevents payment dialog', async () => {
  request.mockImplementationOnce(async () => { jest.mocked(getAuthToken).mockReturnValue('new-token'); return order; });
  expect((await runNativeCheckout(params)).success).toBe(false);
  expect(sdk).not.toHaveBeenCalled();
});
test('concurrent taps open only one checkout', async () => {
  request.mockResolvedValueOnce(order).mockResolvedValueOnce({ success: true, status: {} });
  const first = runNativeCheckout(params);
  expect((await runNativeCheckout(params)).error).toMatch(/already in progress/);
  expect((await first).success).toBe(true);
  expect(sdk).toHaveBeenCalledTimes(1);
});
