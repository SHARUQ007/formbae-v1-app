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
 * Both are production keys, and there is no third one. A Test Store key lived here from
 * before any product existed in App Store Connect or Play Console, when a simulated store
 * was the only way to see a paywall at all; it was never selected once these two were
 * set. Testing a purchase without spending money is now Play Console -> Setup -> License
 * testing, which is a console feature and separate from the closed-track tester list: a
 * license tester buys with Play's test instruments and is never charged. That exercises
 * the real base plan, the real mandate and the real sheet, none of which a simulated
 * store can tell us anything about.
 */
export const REVENUECAT_PUBLIC_KEYS = {
  ios: 'appl_feBDsWllmjfXSymSACDfdwWLSth',
  android: 'goog_mCxsJuBYRNpTWMqaLlOqNbzlBGV',
};

/** The entitlement a paid account holds. Must match the identifier in RevenueCat. */
export const ENTITLEMENT_ID = 'formbae_pro';

function apiKey(): string {
  const { Platform } = require('react-native');
  return Platform.OS === 'ios' ? REVENUECAT_PUBLIC_KEYS.ios : REVENUECAT_PUBLIC_KEYS.android;
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
  /**
   * The store took the money and we could not confirm it with our server.
   *
   * Its own code because it is the one failure that must never be reported the way the
   * others are. Everything else here means no charge was made; this one means a charge
   * was, and telling somebody who has just paid that nothing happened is how a support
   * ticket becomes a refund request and a Play review.
   */
  | 'NOT_CONFIRMED'
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
 * Asked before the SDK is loaded, the way otpService asks about Firebase. A binary older
 * than the JS being served into it carries no native module, and has no store to talk to;
 * it must say so rather than throwing out of module evaluation.
 */
function storeModuleMissing(): boolean {
  try {
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

/**
 * A store product id with Play's base plan dropped.
 *
 * Google addresses a subscription as `subscriptionId:basePlanId` where Apple uses the bare
 * id, so one plan is "monthly" on the App Store and "monthly:monthly" on Play. The admin
 * names a plan's product once, so both have to reduce to the same thing - the server does
 * exactly this when it decides what a purchase bought.
 */
function baseProductId(productId: string): string {
  return String(productId || '').split(':', 1)[0].trim().toLowerCase();
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
  const wanted = productIds.map(baseProductId).filter(Boolean);
  if (!wanted.length) return [];
  const Purchases = purchases();

  // Offerings first, and getProducts only as a fallback. A package already holds the right
  // product for the platform it is running on, which is what makes one admin value work
  // for both stores: asking getProducts for "monthly" finds nothing on Play, where the
  // same subscription is called "monthly:monthly".
  try {
    const offerings = await Purchases.getOfferings();
    const packages = [
      ...(offerings?.current?.availablePackages || []),
      ...Object.values(offerings?.all || {}).flatMap((offering) =>
        (offering as { availablePackages?: unknown[] })?.availablePackages || []),
    ];
    const found = new Map<string, StoreProduct>();
    for (const entry of packages) {
      const product = (entry as { product?: Record<string, unknown> })?.product;
      if (!product) continue;
      const mapped = toProduct(product);
      // Reported back under the id the caller asked for, so the screen can look a plan's
      // price up by the value an admin typed rather than the store's spelling of it.
      const key = baseProductId(mapped.productId);
      if (wanted.includes(key) && mapped.priceString && !found.has(key)) {
        found.set(key, { ...mapped, productId: key });
      }
    }
    if (found.size) return Array.from(found.values());
  } catch {
    // No offering configured, or the store could not be reached. Try the direct lookup
    // rather than giving up: an App Store build with products and no offering still works.
  }

  try {
    const products = await Purchases.getProducts(wanted);
    return (Array.isArray(products) ? products : [])
      .map(toProduct)
      .filter((product) => product.productId && product.priceString)
      .map((product) => ({ ...product, productId: baseProductId(product.productId) }));
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
/**
 * Settle a purchase that has already been paid for.
 *
 * Separate from `syncStorePurchase` so the two failures stay distinguishable: a sync that
 * fails before any money moved is an ordinary error, and one that fails after is a
 * receipt we have not managed to read yet. The entitlement is real either way - it is
 * held by RevenueCat, not by this app - so the honest thing to say is that it will land,
 * and that restoring is the way to hurry it.
 */
async function confirmPaidPurchase(): Promise<{ active: boolean; status: UserStatus }> {
  try {
    return await syncStorePurchase();
  } catch {
    throw new StorePurchaseError(
      'NOT_CONFIRMED',
      'Your payment went through, but we couldn’t confirm it just now. Reopen the app in a moment, or tap Restore purchases — you won’t be charged again.',
    );
  }
}

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
  const wanted = baseProductId(productId);
  try {
    // Buy the package where there is one. On Play a subscription is bought through its
    // base plan, and the package carries that; buying a bare product id would fail.
    let pkg;
    try {
      const offerings = await Purchases.getOfferings();
      const packages = [
        ...(offerings?.current?.availablePackages || []),
        ...Object.values(offerings?.all || {}).flatMap((offering) =>
          (offering as { availablePackages?: unknown[] })?.availablePackages || []),
      ];
      pkg = packages.find((entry) => baseProductId(
        String(((entry as { product?: { identifier?: string } })?.product?.identifier) || ''),
      ) === wanted);
    } catch {
      pkg = undefined;
    }

    if (pkg) {
      await Purchases.purchasePackage(pkg);
    } else {
      const products = await Purchases.getProducts([wanted]);
      const product = (Array.isArray(products) ? products : [])[0];
      if (!product) {
        throw new StorePurchaseError('NOT_AVAILABLE', 'That plan isn’t available in your store right now.');
      }
      await Purchases.purchaseStoreProduct(product);
    }
  } catch (error) {
    if (error instanceof StorePurchaseError) throw error;
    const translated = translate(error);
    // An "already owned" purchase is not a failure, it is a restore waiting to happen:
    // the store will not charge twice, and the entitlement is already there to be read.
    if (translated.code !== 'ALREADY_OWNED') throw translated;
  }
  // Past this point the store has taken the money, so a failure is a confirmation
  // failure and not a purchase failure.
  return confirmPaidPurchase();
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
  return confirmPaidPurchase();
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
