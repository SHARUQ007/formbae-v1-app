/**
 * The phone verification, and the one place that talks to Firebase.
 *
 * Firebase hands back a ConfirmationResult holding native state, which cannot travel in
 * navigation params - those have to stay serializable. So the confirmation lives here at
 * module scope and screens carry an opaque `sessionId` instead.
 *
 * Module scope rather than a ref or a context because the verify screen can genuinely go
 * away underneath us: React Navigation freezes blurred screens, fast refresh remounts,
 * and Android can unmount under memory pressure. What module scope does not survive is
 * the process dying - and neither does the native confirmation, so there is nothing to
 * preserve there. `getSession` returning null is how the screen learns that happened.
 */
import type { ConfirmationResult } from '@react-native-firebase/auth';

export type OtpErrorCode =
  | 'SESSION_EXPIRED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_REQUESTS'
  | 'OFFLINE'
  | 'UNSUPPORTED_NUMBER'
  | 'UNAVAILABLE';

export class OtpError extends Error {
  code: OtpErrorCode;

  constructor(code: OtpErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** What a screen may know about the verification in flight. All serializable. */
export type OtpSession = {
  sessionId: string;
  phone: string;
  sentAt: number;
  resendAvailableAt: number;
  resendsLeft: number;
};

const CODE_LENGTH = 6;
const MAX_RESENDS = 3;
/** 30s, then 60s, then 120s. Firebase throttles too; this keeps us well clear of it. */
const RESEND_BACKOFF_MS = [30_000, 60_000, 120_000];

type PendingVerification = {
  sessionId: string;
  phone: string;
  confirmation: ConfirmationResult;
  sentAt: number;
  resendCount: number;
};

// One verification at a time. Starting another replaces this, which is what stops a stale
// screen confirming a code against a number the trainee has since changed.
let pending: PendingVerification | null = null;

/**
 * Loaded on demand so @react-native-firebase/app does not initialise during cold start
 * for the signed-in trainees who never reach this screen.
 *
 * Loading it is also allowed to fail. Firebase registers native modules, and they are
 * absent from a build with no Firebase config - and from an app binary older than the one
 * the running JS was built against, which is what a reloading Metro leaves behind. Neither
 * should reach anyone as a crash, so both surface as the same unavailable answer every
 * other failure here uses.
 */
function firebaseAuth() {
  try {
    const module = require('@react-native-firebase/auth');
    const { getAuth, signInWithPhoneNumber, signOut } = module;
    if (typeof getAuth !== 'function' || typeof signInWithPhoneNumber !== 'function') {
      throw new Error('Firebase auth module is incomplete');
    }
    return { getAuth, signInWithPhoneNumber, signOut };
  } catch {
    throw new OtpError('UNAVAILABLE', 'Phone sign-in isn’t available in this build of the app.');
  }
}

function describe(verification: PendingVerification): OtpSession {
  const backoff = RESEND_BACKOFF_MS[Math.min(verification.resendCount, RESEND_BACKOFF_MS.length - 1)];
  return {
    sessionId: verification.sessionId,
    phone: verification.phone,
    sentAt: verification.sentAt,
    resendAvailableAt: verification.sentAt + backoff,
    resendsLeft: Math.max(0, MAX_RESENDS - verification.resendCount),
  };
}

/** Firebase's error codes, turned into the handful of things a screen can say. */
export function translateFirebaseError(error: unknown): OtpError {
  const code = String((error as { code?: string })?.code || '');
  if (code === 'auth/invalid-verification-code' || code === 'auth/invalid-verification-id') {
    return new OtpError('INVALID_CODE', 'That code isn’t right. Check the SMS and try again.');
  }
  if (code === 'auth/code-expired' || code === 'auth/session-expired') {
    return new OtpError('CODE_EXPIRED', 'That code has expired. Send a new one.');
  }
  if (code === 'auth/too-many-requests') {
    return new OtpError('TOO_MANY_REQUESTS', 'Too many attempts. Try again in a few minutes.');
  }
  if (code === 'auth/network-request-failed') {
    return new OtpError('OFFLINE', 'You’re offline. Reconnect and try again.');
  }
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') {
    return new OtpError('UNSUPPORTED_NUMBER', 'That number doesn’t look right. Check it and try again.');
  }
  return new OtpError('UNAVAILABLE', 'We couldn’t verify this number right now. Please try again.');
}

async function sendCode(phone: string) {
  const { getAuth, signInWithPhoneNumber } = firebaseAuth();
  try {
    return await signInWithPhoneNumber(getAuth(), phone);
  } catch (error) {
    if (error instanceof OtpError) throw error;
    throw translateFirebaseError(error);
  }
}

/**
 * Send a code to an E.164 number and begin a verification.
 *
 * Signs out first: Firebase persists its session natively across launches, and a leftover
 * one can otherwise satisfy a later getIdToken for a number nobody just proved.
 */
export async function startPhoneVerification(phone: string): Promise<OtpSession> {
  await endVerification().catch(() => undefined);
  const confirmation = await sendCode(phone);
  pending = {
    sessionId: `otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phone,
    confirmation,
    sentAt: Date.now(),
    resendCount: 0,
  };
  return describe(pending);
}

/** Send the code again, keeping the id the screen already has in its route params. */
export async function resendCode(sessionId: string): Promise<OtpSession> {
  if (!pending || pending.sessionId !== sessionId) {
    throw new OtpError('SESSION_EXPIRED', 'That verification has expired. Please start again.');
  }
  if (pending.resendCount >= MAX_RESENDS) {
    throw new OtpError('TOO_MANY_REQUESTS', 'Too many codes sent. Try a different number.');
  }
  const confirmation = await sendCode(pending.phone);
  pending = { ...pending, confirmation, sentAt: Date.now(), resendCount: pending.resendCount + 1 };
  return describe(pending);
}

export function getSession(sessionId: string): OtpSession | null {
  return pending && pending.sessionId === sessionId ? describe(pending) : null;
}

/** Check the code and return the token the backend will verify. */
export async function confirmCode(sessionId: string, code: string): Promise<string> {
  if (!pending || pending.sessionId !== sessionId) {
    throw new OtpError('SESSION_EXPIRED', 'That verification has expired. Please start again.');
  }
  const digits = code.replace(/\D/g, '');
  if (digits.length !== CODE_LENGTH) {
    throw new OtpError('INVALID_CODE', `Enter the ${CODE_LENGTH}-digit code from the SMS.`);
  }
  try {
    const credential = await pending.confirmation.confirm(digits);
    const token = await credential?.user?.getIdToken();
    if (!token) throw new OtpError('UNAVAILABLE', 'We couldn’t verify this number right now. Please try again.');
    return token;
  } catch (error) {
    if (error instanceof OtpError) throw error;
    throw translateFirebaseError(error);
  }
}

/**
 * Drop the verification and the Firebase session behind it.
 *
 * Always called once sign-in is done, because a lingering Firebase session is a live
 * credential: it would keep minting ID tokens for an account that may since have closed.
 */
export async function endVerification(): Promise<void> {
  pending = null;
  try {
    const { getAuth, signOut } = firebaseAuth();
    await signOut(getAuth());
  } catch {
    // Nothing to sign out of, or Firebase is unavailable. Neither blocks the trainee.
  }
}

export const OTP_CODE_LENGTH = CODE_LENGTH;
