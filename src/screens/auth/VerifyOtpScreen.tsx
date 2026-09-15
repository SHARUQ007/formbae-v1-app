import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import NativeLinearGradient from 'react-native-linear-gradient';
import { ScreenContainer } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { Logo } from '../../components/Logo';
import { OtpCodeInput } from '../../components/OtpCodeInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ApiError } from '../../services/apiClient';
import { OTP_CODE_LENGTH, confirmCode, endVerification, getSession, resendCode } from '../../services/otpService';
import { useAuthStore } from '../../store/authStore';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import type { AuthStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

/** The backend's answer to a sign-in, read by code rather than by message.
 *
 * apiClient gives every 401 the same "Session expired" text, so the only reliable signal
 * is the code the backend puts in the payload.
 */
function responseCode(error: unknown): string {
  if (!(error instanceof ApiError)) return '';
  return String((error.payload as { code?: string } | undefined)?.code || '');
}

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VerifyOtpScreen({ navigation, route }: Props) {
  const { mobile, sessionId, mode, reduceMotion } = route.params;
  const { login } = useAuthStore();
  const codeRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  // Held so a retry - a dropped response, or the sign-in that turns out to need an account
  // created - never costs the trainee a second SMS.
  const verifiedTokenRef = useRef('');

  const [code, setCode] = useState('');
  const [name, setName] = useState(route.params.name || '');
  const [needsAccount, setNeedsAccount] = useState(mode === 'signup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [session, setSession] = useState(() => getSession(sessionId));
  const [now, setNow] = useState(() => Date.now());

  const resendIn = session ? session.resendAvailableAt - now : 0;
  const canResend = !!session && resendIn <= 0 && session.resendsLeft > 0 && !busy;

  // The countdown is read from the clock rather than counted down, so backgrounding the
  // app cannot leave it out of step with when a resend is really allowed.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => { clearInterval(tick); subscription.remove(); };
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const restart = useCallback(() => {
    endVerification().catch(() => undefined);
    navigation.replace('Login', { mode: mode === 'signup' ? 'signup' : 'login', mobile, reduceMotion });
  }, [mobile, mode, navigation, reduceMotion]);

  const enterApp = useCallback((recommended: Parameters<typeof resolveRootRoute>[0]) => {
    const rootNav = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    const root = resolveRootRoute(recommended);
    if (root === 'Onboarding') {
      rootNav?.replace('Onboarding', { screen: resolveOnboardingInitialRoute(recommended) });
      return;
    }
    if (root === 'PaidTransition') {
      rootNav?.replace('PaidTransition', { screen: resolvePaidInitialRoute(recommended) });
      return;
    }
    // Returning trainees enter through the bounded startup warm-up, as they did before.
    rootNav?.replace(root === 'Main' ? 'Splash' : root);
  }, [navigation]);

  /** Trade a proven number for a FormBae session. */
  const signIn = useCallback(async (token: string, createIfMissing: boolean) => {
    const response = await login(mobile, createIfMissing ? name.trim() || undefined : undefined, createIfMissing, token);
    await endVerification();
    enterApp(response.status.recommendedNextScreen);
  }, [enterApp, login, mobile, name]);

  const submit = useCallback(async (entered: string) => {
    if (submittingRef.current) return;
    if (entered.length !== OTP_CODE_LENGTH) {
      fail(`Enter the ${OTP_CODE_LENGTH}-digit code from the SMS.`);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const token = verifiedTokenRef.current || await confirmCode(sessionId, entered);
      verifiedTokenRef.current = token;
      await signIn(token, needsAccount);
    } catch (submitError) {
      const failure = responseCode(submitError);
      if (failure === 'ACCOUNT_NOT_FOUND') {
        // Verified, but new here. Ask for a name and reuse the same token - no second SMS.
        setNeedsAccount(true);
        fail('No FormBae account on this number yet. Add your name to create one.');
        return;
      }
      if (failure === 'OTP_PHONE_MISMATCH' || failure === 'OTP_INVALID' || failure === 'OTP_STALE' || failure === 'OTP_EXPIRED') {
        verifiedTokenRef.current = '';
        fail('We couldn’t verify this number. Please start again.');
        restart();
        return;
      }
      const message = submitError instanceof Error ? submitError.message : 'We couldn’t verify that code. Please try again.';
      const otpCode = (submitError as { code?: string })?.code;
      if (otpCode === 'SESSION_EXPIRED') setExpired(true);
      if (otpCode === 'INVALID_CODE' || otpCode === 'CODE_EXPIRED') {
        setCode('');
        codeRef.current?.focus();
      }
      if (otpCode === 'CODE_EXPIRED') setExpired(true);
      fail(message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }, [fail, needsAccount, restart, sessionId, signIn]);

  const resend = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const next = await resendCode(sessionId);
      setSession(next);
      setExpired(false);
      setCode('');
      verifiedTokenRef.current = '';
      setNow(Date.now());
      AccessibilityInfo.announceForAccessibility('A new code is on its way.');
      codeRef.current?.focus();
    } catch (resendError) {
      fail(resendError instanceof Error ? resendError.message : 'We couldn’t send a new code. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [fail, sessionId]);

  const changeNumber = useCallback(() => {
    // The code field takes focus on arrival, so the keyboard is up and covering part of the
    // screen. Dismissing it first means the tap that leaves cannot be spent closing it.
    Keyboard.dismiss();
    endVerification().catch(() => undefined);
    // Always replace rather than pop. Going back leaves this screen on the stack holding a
    // verification that has just been ended, which the forward gesture can return to.
    navigation.replace('Login', { mode: mode === 'signup' ? 'signup' : 'login', mobile, reduceMotion });
  }, [mobile, mode, navigation, reduceMotion]);

  const masked = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
  // The verification lives in memory only, so a process restart loses it. Say so plainly
  // rather than letting a code be typed against nothing.
  const lost = !session && !verifiedTokenRef.current;

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <NativeLinearGradient
        colors={['#101116', colors.bg, colors.bg]}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={changeNumber}
          style={styles.backButton}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the mobile number screen"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Feather name="chevron-left" size={25} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.brand}>
          <Logo height={32} showTagline={false} />
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      <KeyboardScreen scroll style={styles.keyboard} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.intro}>
            <View style={styles.accentRule} />
            <Text style={styles.title} accessibilityRole="header">Verify your number</Text>
            <Text style={styles.subtitle}>
              {lost
                ? 'That verification has expired. Send a new code to continue.'
                : `Enter the ${OTP_CODE_LENGTH}-digit code we sent to ${masked}.`}
            </Text>
            <TouchableOpacity
              onPress={changeNumber}
              accessibilityRole="button"
              accessibilityLabel="Change number"
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text style={styles.changeNumber}>Change number</Text>
            </TouchableOpacity>
          </View>

          <OtpCodeInput
            ref={codeRef}
            value={code}
            onChangeText={value => { setCode(value); if (error) setError(''); }}
            onComplete={submit}
            editable={!busy && !lost}
            invalid={!!error}
            autoFocus={!lost}
            accessibilityHint={`Enter the ${OTP_CODE_LENGTH} digit code from the SMS`}
          />

          {needsAccount ? (
            <View style={styles.nameField}>
              <FormInput
                label="First name"
                icon="user"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                maxLength={50}
                autoCapitalize="words"
                editable={!busy}
              />
            </View>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <PrimaryButton
            title={needsAccount ? 'Create my account' : 'Verify'}
            onPress={() => submit(code)}
            loading={busy}
            disabled={lost || code.length !== OTP_CODE_LENGTH}
            icon="arrow-right"
            iconPosition="trailing"
            style={styles.cta}
          />

          <View style={styles.resendRow}>
            {canResend || lost ? (
              <TouchableOpacity
                onPress={resend}
                disabled={busy || (session?.resendsLeft ?? 0) <= 0}
                accessibilityRole="button"
                accessibilityLabel="Resend code"
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Text style={styles.resendAction}>Resend code</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.resendWaiting} accessibilityLiveRegion="polite">
                {session ? `Resend code in ${formatCountdown(resendIn)}` : 'Checking your code…'}
              </Text>
            )}
          </View>

          {expired && !lost ? (
            <Text style={styles.hint}>Codes expire after a few minutes. A new one takes a moment to arrive.</Text>
          ) : null}
        </View>
      </KeyboardScreen>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,18,23,0.88)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBarSpacer: { width: 44, height: 44 },
  keyboard: { backgroundColor: 'transparent' },
  scrollContent: { justifyContent: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  intro: { maxWidth: 420, marginBottom: spacing.xl },
  accentRule: { width: 38, height: 3, borderRadius: radius.pill, backgroundColor: colors.accent, marginBottom: spacing.md },
  title: { ...typography.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: colors.inkStrong },
  subtitle: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.inkMuted, marginTop: spacing.sm, maxWidth: 410 },
  changeNumber: { ...typography.bodyBold, color: colors.accent, marginTop: spacing.sm },
  nameField: { marginTop: spacing.lg },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.md },
  cta: { minHeight: 62, borderRadius: radius.xl, marginTop: spacing.lg, paddingHorizontal: 20 },
  resendRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  resendAction: { ...typography.bodyBold, color: colors.accent },
  resendWaiting: { ...typography.caption, color: colors.inkSubtle },
  hint: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.sm },
});
