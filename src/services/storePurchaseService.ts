/**
 * In-app purchases, and the one place that talks to the stores.
 *
 * Apple and Google require their own billing for anything used inside the app, so buying
 * a plan here goes through StoreKit or Play Billing. Razorpay is still how the website
 * sells, where neither store has a say; it is simply not reachable from inside the app
 * any more, because that is the rule both stores enforce most reliably.
 *
 * Two things follow from the stores owning the transaction, and both change the screen:
 *
 * Prices come from the store, not from us. `priceString` is already localised and
 * already carries the right currency symbol, so nothing here formats money. A price we
 * rendered ourselves could disagree with the sheet the user is about to be shown.
 *
 * Nothing this module returns is proof of anything. A purchase finishing here only means
 * the store took the money; what the account is entitled to is decided by the server,
 * which asks RevenueCat with a key this app does not carry. So every path ends in the
 * same `syncStorePurchase()` call rather than in a local flag.
 */
import { apiRequest } from './apiClient';
import type { UserStatus } from '../types/api';

/**
 * The public SDK keys, from RevenueCat → Project settings → API keys.
 *
 * Public on purpose: these identify the app to RevenueCat and are designed to ship inside
 * it. The secret key, which can read and change entitlements, lives only on the server.
 * Never put that one here.
 *
 * `test` is RevenueCat's Test Store key. It buys from a simulated store, so the paywall
 * works before any product exists in App Store Connect or Play Console - which is what
 * makes the flow testable today. It cannot take real money, so it is used only in
 * development and a release build falls back to the platform key.
 */
export const REVENUECAT_PUBLIC_KEYS = {
  ios: 'appl_feBDsWllmjfXSymSACDfdwWLSth',
  android: 'goog_mCxsJuBYRNpTWMqaLlOqNbzlBGV',
  test: 'test_UlYuNPBMGOupTJCcVrEZATsLqVZ',
};

/** The entitlement a paid account holds. Must match the identifier in RevenueCat. */
export const ENTITLEMENT_ID = 'formbae_pro';

function apiKey(): string {
  const { Platform } = require('react-native');
  const platformKey = Platform.OS === 'ios' ? REVENUECAT_PUBLIC_KEYS.ios : REVENUECAT_PUBLIC_KEYS.android;
  // The real key wins wherever one is set, so a release build can never reach the test
  // store even if this file still carries its key.
  if (platformKey) return platformKey;
  return __DEV__ ? REVENUECAT_PUBLIC_KEYS.test : '';
}

export type StoreProduct = {
  productId: string;
  /** The store's own localised price, e.g. "₹499.00". Rendered as-is. */
  priceString: string;
  title: string;
  description: string;
};

export type StorePurchaseErrorCode =
  | 'CANCELLED'
  | 'NOT_AVAILABLE'
  | 'ALREADY_OWNED'
  | 'PAYMENT_PENDING'
  | 'NETWORK'
  | 'FAILED';

export class StorePurchaseError extends Error {
  code: StorePurchaseErrorCode;

  constructor(code: StorePurchaseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Whether this build can talk to the stores at all.
 *
 * Asked before the SDK is loaded, the way otpService asks about Firebase. A build with
 * no key configured, or a binary older than the JS being served into it, has no store to
 * talk to and must say so rather than throwing out of module evaluation.
 */
function storeModuleMissing(): boolean {
  try {
    if (!apiKey()) return true;
    require('react-native-purchases');
    return false;
  } catch {
    return true;
  }
}

/** Loaded on demand so the SDK does not initialise for trainees who never see a paywall. */
function purchases() {
  if (storeModuleMissing()) {
    throw new StorePurchaseError('NOT_AVAILABLE', 'Purchases aren’t available in this build of the app.');
  }
  const module = require('react-native-purchases');
  return module.default || module;
}

let configuredFor = '';

/**
 * Point the SDK at this account.
 *
 * The account id is our own userId, which is what makes the server's later question -
 * "what does this account hold" - answerable. Configuring twice for the same account is
 * a no-op; configuring for a different one is what happens when somebody signs out and
 * a different trainee signs in on the same device.
 */
export function configureStore(userId: string): void {
  const account = String(userId || '').trim();
  if (!account || account === configuredFor) return;
  const Purchases = purchases();
  Purchases.configure({ apiKey: apiKey(), appUserID: account });
  configuredFor = account;
}

/** Forget the signed-in account, so the next trainee on this device is not mistaken for it. */
export function resetStore(): void {
  configuredFor = '';
}

function toProduct(raw: Record<string, unknown>): StoreProduct {
  return {
    productId: String(raw.identifier || ''),
    priceString: String(raw.priceString || ''),
    title: String(raw.title || ''),
    description: String(raw.description || ''),
  };
}

/**
 * What the stores will actually sell, for the plans the paywall offers.
 *
 * A product the store does not return is one that has not been created, or has not
 * finished propagating, or is not available in this storefront. It is left out rather
 * than shown at a price we made up, so the screen can only ever offer something buyable.
 */
export async function fetchStoreProducts(productIds: string[]): Promise<StoreProduct[]> {
  const ids = productIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  const Purchases = purchases();
  try {
    const products = await Purchases.getProducts(ids);
    return (Array.isArray(products) ? products : []).map(toProduct).filter((product) => product.productId && product.priceString);
  } catch {
    throw new StorePurchaseError('NETWORK', 'We couldn’t reach the store. Check your connection and try again.');
  }
}

function translate(error: unknown): StorePurchaseError {
  const detail = error as { userCancelled?: boolean; code?: unknown; message?: string } | undefined;
  if (detail?.userCancelled) {
    return new StorePurchaseError('CANCELLED', '');
  }
  const code = String(detail?.code ?? '');
  // RevenueCat's PURCHASES_ERROR_CODE values. Matched as strings so this does not need
  // the SDK's enum imported at module scope.
  if (code === '1' || /cancel/i.test(String(detail?.message || ''))) {
    return new StorePurchaseError('CANCELLED', '');
  }
  if (code === '9' || /already/i.test(String(detail?.message || ''))) {
    return new StorePurchaseError('ALREADY_OWNED', 'You already have this plan. Restoring it now.');
  }
  if (code === '8' || /pending|deferred/i.test(String(detail?.message || ''))) {
    return new StorePurchaseError(
      'PAYMENT_PENDING',
      'Your payment is still being confirmed. We’ll unlock your plan as soon as it clears.',
    );
  }
  if (/network|connect|offline/i.test(String(detail?.message || ''))) {
    return new StorePurchaseError('NETWORK', 'We couldn’t reach the store. Check your connection and try again.');
  }
  return new StorePurchaseError('FAILED', 'That purchase didn’t go through. Nothing has been charged.');
}

/**
 * Ask the server what this account is entitled to, and take its answer.
 *
 * Deliberately sends nothing about the purchase. The server reads it from RevenueCat
 * itself, so there is no field here for a tampered client to lie in.
 */
export async function syncStorePurchase(): Promise<{ active: boolean; status: UserStatus }> {
  return apiRequest<{ active: boolean; status: UserStatus }>('/payment/store/sync', { method: 'POST' });
}

/**
 * Record who a household plan is being bought for, before buying it.
 *
 * The stores sell one product and carry no metadata with it, so these names cannot ride
 * along with the purchase the way they rode in a Razorpay order's notes. They are held on
 * the account and read back when the entitlement arrives.
 */
export async function recordHouseholdMembers(planId: string, householdMembers: unknown[]): Promise<void> {
  await apiRequest('/payment/store/household', { method: 'POST', body: { planId, householdMembers } });
}

/** Buy one plan, then let the server decide what that bought. */
export async function purchaseStoreProduct(productId: string): Promise<{ active: boolean; status: UserStatus }> {
  const Purchases = purchases();
  try {
    const products = await Purchases.getProducts([productId]);
    const product = (Array.isArray(products) ? products : [])[0];
    if (!product) {
      throw new StorePurchaseError('NOT_AVAILABLE', 'That plan isn’t available in your store right now.');
    }
    await Purchases.purchaseStoreProduct(product);
  } catch (error) {
    if (error instanceof StorePurchaseError) throw error;
    const translated = translate(error);
    // An "already owned" purchase is not a failure, it is a restore waiting to happen:
    // the store will not charge twice, and the entitlement is already there to be read.
    if (translated.code !== 'ALREADY_OWNED') throw translated;
  }
  return syncStorePurchase();
}

/**
 * Restore a purchase made on another device or after a reinstall.
 *
 * Apple requires this to exist and to be reachable without buying anything, which is why
 * the screen shows it whether or not a purchase has been attempted.
 */
export async function restoreStorePurchases(): Promise<{ active: boolean; status: UserStatus }> {
  const Purchases = purchases();
  try {
    await Purchases.restorePurchases();
  } catch (error) {
    throw translate(error);
  }
  return syncStorePurchase();
}

/** Whether a paywall can be shown at all in this build. */
export function storePurchasesAvailable(): boolean {
  return !storeModuleMissing();
}

/**
 * What RevenueCat itself believes this account holds.
 *
 * Useful for showing state - a "you're subscribed" badge, whether to offer the paywall at
 * all - and never for granting anything. Granting is the server's, because this runs on a
 * device we do not control. The two answers agree in practice; where they differ, the
 * server's is the one that decides what the trainee can open.
 */
export type CustomerState = {
  entitled: boolean;
  activeEntitlements: string[];
  managementUrl: string;
  willRenew: boolean;
  expiresAt: string;
};

export async function fetchCustomerState(): Promise<CustomerState> {
  const Purchases = purchases();
  const info = await Purchases.getCustomerInfo();
  const active = (info?.entitlements?.active || {}) as Record<string, {
    willRenew?: boolean;
    expirationDate?: string | null;
  }>;
  const names = Object.keys(active);
  const mine = active[ENTITLEMENT_ID] || active[names[0]] || undefined;
  return {
    entitled: names.includes(ENTITLEMENT_ID) || names.length > 0,
    activeEntitlements: names,
    managementUrl: String(info?.managementURL || ''),
    willRenew: Boolean(mine?.willRenew),
    expiresAt: String(mine?.expirationDate || ''),
  };
}

/**
 * Show the paywall RevenueCat hosts, rather than one we drew.
 *
 * Worth it where the offer is a straight choice between products: the prices, the period
 * labels and the store's own purchase sheet all come from the offering, so nothing here
 * can print a price that disagrees with what is charged, and Apple's required disclosures
 * are part of the template rather than something to remember.
 *
 * Our own paywall stays for the household plans, which have to collect who the extra
 * memberships are for before anything is bought - a step no hosted template knows about.
 *
 * Returns whether the account came out of it entitled, having asked the server, because
 * what the paywall reports is a device's claim and access is not granted on those.
 */
export async function presentStorePaywall(offeringId?: string): Promise<{ active: boolean; status: UserStatus } | null> {
  if (storeModuleMissing()) {
    throw new StorePurchaseError('NOT_AVAILABLE', 'Purchases aren’t available in this build of the app.');
  }
  const ui = require('react-native-purchases-ui');
  const RevenueCatUI = ui.default || ui;

  // An offering named by the admin is how a different set of prices goes live without a
  // release. Falling back to the current one rather than failing: an offering that has
  // been renamed or removed should show the default paywall, not no paywall.
  let offering;
  if (offeringId) {
    try {
      const offerings = await purchases().getOfferings();
      offering = offerings?.all?.[offeringId] || undefined;
    } catch {
      offering = undefined;
    }
  }

  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: ENTITLEMENT_ID,
    ...(offering ? { offering } : {}),
  });
  // NOT_PRESENTED means they were already entitled; CANCELLED and ERROR mean nothing was
  // bought. Only a completed purchase or restore is worth asking the server about.
  const outcome = String(result || '').toUpperCase();
  if (outcome.includes('CANCEL') || outcome.includes('ERROR')) return null;
  return syncStorePurchase();
}

/**
 * RevenueCat's Customer Center: manage, cancel, restore, or ask for a refund.
 *
 * This is the right home for all of that. Apple requires an app selling auto-renewing
 * subscriptions to lead people to where the subscription actually lives, and the Customer
 * Center does it with the store's own flows - including refund requests, which we cannot
 * grant ourselves because the money never reached us.
 */
export async function presentCustomerCenter(): Promise<void> {
  if (storeModuleMissing()) {
    throw new StorePurchaseError('NOT_AVAILABLE', 'Subscription management isn’t available in this build.');
  }
  const ui = require('react-native-purchases-ui');
  const RevenueCatUI = ui.default || ui;
  await RevenueCatUI.presentCustomerCenter();
}
