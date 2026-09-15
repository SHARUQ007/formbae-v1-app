import {
  OTP_CODE_LENGTH,
  OtpError,
  confirmCode,
  endVerification,
  getSession,
  resendCode,
  startPhoneVerification,
  translateFirebaseError,
} from './otpService';

const mockSignInWithPhoneNumber = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const confirmation = (token = 'id-token') => ({
  confirm: jest.fn().mockResolvedValue({ user: { getIdToken: jest.fn().mockResolvedValue(token) } }),
});

/** Stand in for the native module Firebase registers, which no test bundle has. */
function setNativeModulePresent(present: boolean) {
  const rn = require('react-native');
  jest.spyOn(rn.TurboModuleRegistry, 'get').mockReturnValue(present ? {} : null);
  Object.defineProperty(rn.NativeModules, 'RNFBAppModule', {
    value: present ? {} : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  setNativeModulePresent(true);
  mockSignOut.mockResolvedValue(undefined);
  mockSignInWithPhoneNumber.mockResolvedValue(confirmation());
});
afterEach(async () => { await endVerification(); });

it('hands the screen a serializable handle, never the Firebase confirmation', async () => {
  // The whole reason this service exists: route params must survive JSON.
  const session = await startPhoneVerification('+919876543210');
  expect(JSON.parse(JSON.stringify(session))).toEqual(session);
  expect(session.sessionId).toEqual(expect.any(String));
  expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith({}, '+919876543210');
});

it('clears any leftover Firebase session before sending a code', async () => {
  // Firebase persists natively across launches, so a stale session could otherwise mint a
  // token for a number nobody just proved.
  await startPhoneVerification('+919876543210');
  expect(mockSignOut).toHaveBeenCalled();
});

it('returns the token the backend will check', async () => {
  const session = await startPhoneVerification('+919876543210');
  await expect(confirmCode(session.sessionId, '123456')).resolves.toBe('id-token');
});

it('refuses a code that is not the right length without calling Firebase', async () => {
  const pending = confirmation();
  mockSignInWithPhoneNumber.mockResolvedValue(pending);
  const session = await startPhoneVerification('+919876543210');
  await expect(confirmCode(session.sessionId, '123')).rejects.toMatchObject({ code: 'INVALID_CODE' });
  expect(pending.confirm).not.toHaveBeenCalled();
  expect(OTP_CODE_LENGTH).toBe(6);
});

it('a handle from a verification that has been replaced no longer works', async () => {
  // Otherwise a screen left on the stack could confirm a code against a different number.
  const first = await startPhoneVerification('+919876543210');
  await startPhoneVerification('+919999900000');
  expect(getSession(first.sessionId)).toBeNull();
  await expect(confirmCode(first.sessionId, '123456')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
});

it('a handle the process no longer knows about reports itself rather than hanging', async () => {
  await expect(confirmCode('otp-gone', '123456')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(getSession('otp-gone')).toBeNull();
});

it('resending keeps the handle the screen already has in its route params', async () => {
  const session = await startPhoneVerification('+919876543210');
  const next = await resendCode(session.sessionId);
  expect(next.sessionId).toBe(session.sessionId);
  expect(next.resendsLeft).toBe(session.resendsLeft - 1);
  expect(mockSignInWithPhoneNumber).toHaveBeenCalledTimes(2);
});

it('the wait before another code grows, and runs out', async () => {
  let session = await startPhoneVerification('+919876543210');
  const waits = [session.resendAvailableAt - session.sentAt];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    session = await resendCode(session.sessionId);
    waits.push(session.resendAvailableAt - session.sentAt);
  }
  expect(waits[0]).toBeLessThan(waits[1]);
  expect(waits[1]).toBeLessThan(waits[2]);
  expect(session.resendsLeft).toBe(0);
  await expect(resendCode(session.sessionId)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
});

it('signing out drops the verification with it', async () => {
  const session = await startPhoneVerification('+919876543210');
  await endVerification();
  expect(getSession(session.sessionId)).toBeNull();
  expect(mockSignOut).toHaveBeenCalled();
});

it('an unavailable Firebase does not leave the trainee stuck signed in to it', async () => {
  mockSignOut.mockRejectedValue(new Error('offline'));
  await expect(endVerification()).resolves.toBeUndefined();
});

describe('Firebase error codes become something a screen can say', () => {
  it.each([
    ['auth/invalid-verification-code', 'INVALID_CODE'],
    ['auth/code-expired', 'CODE_EXPIRED'],
    ['auth/session-expired', 'CODE_EXPIRED'],
    ['auth/too-many-requests', 'TOO_MANY_REQUESTS'],
    ['auth/network-request-failed', 'OFFLINE'],
    ['auth/invalid-phone-number', 'UNSUPPORTED_NUMBER'],
    ['auth/app-not-authorized', 'UNAVAILABLE'],
    ['app/no-app', 'UNAVAILABLE'],
    ['', 'UNAVAILABLE'],
  ])('%s becomes %s', (firebaseCode, expected) => {
    const translated = translateFirebaseError({ code: firebaseCode });
    expect(translated).toBeInstanceOf(OtpError);
    expect(translated.code).toBe(expected);
    expect(translated.message).toEqual(expect.any(String));
  });

  it('a build with no Firebase project behind it does not read as worth retrying', () => {
    // configure() is skipped when the config file is absent, so every call fails this way
    // and no amount of trying again will change it.
    const unconfigured = translateFirebaseError(
      new Error("No Firebase App '[DEFAULT]' has been created - call firebase.initializeApp()"),
    );
    expect(unconfigured.code).toBe('UNAVAILABLE');
    expect(unconfigured.message).toContain('isn’t connected to Firebase');
    expect(translateFirebaseError({ code: 'auth/network-request-failed' }).message).not.toContain('Firebase');
  });

  it('a failure to send reaches the caller already translated', async () => {
    mockSignInWithPhoneNumber.mockRejectedValue({ code: 'auth/too-many-requests' });
    await expect(startPhoneVerification('+919876543210')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

describe('a build without the Firebase native module', () => {
  // The native modules are absent from a build with no Firebase config, and from an app
  // binary older than the JS Metro is serving into it. Neither may reach anyone as a crash.
  const unregistered = () => { throw new Error('Native module NativeRNFBTurboApp is not registered.'); };

  it('does not even reach for the SDK when the native module is absent', async () => {
    // Importing it is what throws: Firebase builds an event emitter as it evaluates, and
    // that reaches for the same module through getEnforcing. So the import must not happen.
    setNativeModulePresent(false);
    await expect(startPhoneVerification('+919876543210')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it('reports itself unavailable rather than throwing the native error', async () => {
    mockSignInWithPhoneNumber.mockImplementation(unregistered);
    await expect(startPhoneVerification('+919876543210')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('never lets ending a verification take the app down', async () => {
    setNativeModulePresent(false);
    await expect(endVerification()).resolves.toBeUndefined();
    mockSignOut.mockImplementation(unregistered);
    await expect(endVerification()).resolves.toBeUndefined();
  });
});
