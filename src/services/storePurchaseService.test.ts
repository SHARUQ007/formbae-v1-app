import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import {
  ENTITLEMENT_ID,
  fetchCustomerState,
  presentCustomerCenter,
  presentStorePaywall,
  purchaseStoreProduct,
  restoreStorePurchases,
  StorePurchaseError,
} from './storePurchaseService';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

const purchases = Purchases as unknown as Record<string, jest.Mock>;
const ui = RevenueCatUI as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  (apiRequest as jest.Mock).mockResolvedValue({ active: true, status: {} });
});

describe('what the server is asked', () => {
  it('never sends what was bought, only that something was', async () => {
    // The whole security model. A tampered client has no field here to lie in: the server
    // reads the entitlement from RevenueCat with a key this app does not carry.
    purchases.getProducts.mockResolvedValue([{ identifier: 'monthly', priceString: '₹59.00' }]);
    purchases.purchaseStoreProduct.mockResolvedValue({});
    await purchaseStoreProduct('monthly');
    expect(apiRequest).toHaveBeenCalledWith('/payment/store/sync', { method: 'POST' });
  });

  it('restoring ends in the same question', async () => {
    purchases.restorePurchases.mockResolvedValue({});
    await restoreStorePurchases();
    expect(apiRequest).toHaveBeenCalledWith('/payment/store/sync', { method: 'POST' });
  });
});

describe('the hosted paywall', () => {
  it('asks the server after a purchase completes', async () => {
    ui.presentPaywallIfNeeded.mockResolvedValue('PURCHASED');
    const result = await presentStorePaywall();
    expect(ui.presentPaywallIfNeeded).toHaveBeenCalledWith({ requiredEntitlementIdentifier: ENTITLEMENT_ID });
    expect(result).toEqual({ active: true, status: {} });
  });

  it('asks the server when the paywall was not shown at all', async () => {
    // NOT_PRESENTED means they were already entitled. Worth confirming with the server
    // rather than assuming, because our records may not know it yet.
    ui.presentPaywallIfNeeded.mockResolvedValue('NOT_PRESENTED');
    await presentStorePaywall();
    expect(apiRequest).toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'ERROR'])('asks nothing when the paywall ends in %s', async (outcome) => {
    // Nothing was bought, so there is nothing to reconcile and no reason to spend a call.
    ui.presentPaywallIfNeeded.mockResolvedValue(outcome);
    expect(await presentStorePaywall()).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('customer info', () => {
  it('reports the entitlement and how the subscription is managed', async () => {
    purchases.getCustomerInfo.mockResolvedValue({
      entitlements: { active: { [ENTITLEMENT_ID]: { willRenew: true, expirationDate: '2026-10-16T00:00:00Z' } } },
      managementURL: 'https://apps.apple.com/account/subscriptions',
    });
    const state = await fetchCustomerState();
    expect(state.entitled).toBe(true);
    expect(state.activeEntitlements).toEqual([ENTITLEMENT_ID]);
    expect(state.willRenew).toBe(true);
    expect(state.managementUrl).toContain('apps.apple.com');
  });

  it('is not entitled when nothing is active', async () => {
    purchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} }, managementURL: null });
    const state = await fetchCustomerState();
    expect(state.entitled).toBe(false);
    expect(state.activeEntitlements).toEqual([]);
    expect(state.managementUrl).toBe('');
  });

  it('survives a customer info payload with nothing in it', async () => {
    // getCustomerInfo is reached over the network and its shape has changed before now.
    purchases.getCustomerInfo.mockResolvedValue({});
    await expect(fetchCustomerState()).resolves.toMatchObject({ entitled: false });
  });
});

describe('the customer center', () => {
  it('opens the store-backed management sheet', async () => {
    ui.presentCustomerCenter.mockResolvedValue(undefined);
    await presentCustomerCenter();
    expect(ui.presentCustomerCenter).toHaveBeenCalled();
  });

  it('reports a build with no store rather than failing silently', async () => {
    ui.presentCustomerCenter.mockRejectedValue(new Error('not linked'));
    await expect(presentCustomerCenter()).rejects.toThrow();
  });
});

describe('failures a trainee can act on', () => {
  it('a product the store will not sell is named as unavailable, not as a failure', async () => {
    purchases.getProducts.mockResolvedValue([]);
    await expect(purchaseStoreProduct('missing')).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('a cancelled purchase carries no message, so no alert is shown for a choice', async () => {
    purchases.getProducts.mockResolvedValue([{ identifier: 'monthly', priceString: '₹59.00' }]);
    purchases.purchaseStoreProduct.mockRejectedValue({ userCancelled: true });
    await expect(purchaseStoreProduct('monthly')).rejects.toMatchObject({ code: 'CANCELLED', message: '' });
  });

  it('a purchase already owned is a restore, not an error', async () => {
    // The store will not charge twice and the entitlement is already there to be read, so
    // this ends where a successful purchase ends.
    purchases.getProducts.mockResolvedValue([{ identifier: 'monthly', priceString: '₹59.00' }]);
    purchases.purchaseStoreProduct.mockRejectedValue({ code: '9', message: 'already owned' });
    await expect(purchaseStoreProduct('monthly')).resolves.toEqual({ active: true, status: {} });
  });
});

it('every error a screen can be handed is one it has words for', () => {
  const error = new StorePurchaseError('NETWORK', 'offline');
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('NETWORK');
});
