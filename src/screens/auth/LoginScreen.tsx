import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Alert,
  Easing,
  InputAccessoryView,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import NativeLinearGradient from 'react-native-linear-gradient';
import { ScreenContainer } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { Logo } from '../../components/Logo';
import { ApiError } from '../../services/apiClient';
import { useAuthStore } from '../../store/authStore';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import type { AuthStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const PHONE_ACCESSORY_ID = 'formbae-phone-keyboard';
const TERMS_URL = 'https://formbae.in/terms-of-use';
const PRIVACY_URL = 'https://formbae.in/privacy-policy';
type MotionPreference = 'unknown' | 'full' | 'reduce';

export function LoginScreen({ navigation, route }: Props) {
  const { login, loading } = useAuthStore();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 700 || fontScale > 1.15;
  const phoneRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const headerReveal = useRef(new Animated.Value(route.params?.reduceMotion ? 1 : 0)).current;
  const bodyReveal = useRef(new Animated.Value(route.params?.reduceMotion ? 1 : 0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const [mobile, setMobile] = useState(() => toNationalMobileInput(route.params?.mobile || ''));
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(
    route.params?.reduceMotion === true
      ? 'reduce'
      : route.params?.reduceMotion === false
        ? 'full'
        : 'unknown',
  );
  const isSignup = route.params?.mode === 'signup';

  useEffect(() => {
    if (route.params?.reduceMotion !== undefined) return undefined;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) setMotionPreference(enabled ? 'reduce' : 'full');
      })
      .catch(() => {
        if (active) setMotionPreference('full');
      });
    return () => {
      active = false;
    };
  }, [route.params?.reduceMotion]);

  useEffect(() => {
    if (motionPreference === 'unknown') return undefined;
    headerReveal.stopAnimation();
    bodyReveal.stopAnimation();
    if (motionPreference === 'reduce') {
      headerReveal.setValue(1);
      bodyReveal.setValue(1);
      return undefined;
    }

    const entrance = Animated.parallel([
      Animated.timing(headerReveal, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bodyReveal, {
        toValue: 1,
        duration: 320,
        delay: 55,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [bodyReveal, headerReveal, motionPreference]);

  useEffect(() => () => {
    headerReveal.stopAnimation();
    bodyReveal.stopAnimation();
    exitOpacity.stopAnimation();
  }, [bodyReveal, exitOpacity, headerReveal]);

  const finishScreenTransition = () => new Promise<void>(resolve => {
    if (motionPreference !== 'full') {
      resolve();
      return;
    }
    Animated.timing(exitOpacity, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => resolve());
  });

  const handleMobileChange = (value: string) => {
    setMobile(toNationalMobileInput(value));
    if (phoneError) setPhoneError('');
  };

  const onSubmit = async () => {
    if (submittingRef.current) return;
    const digits = normalizeIndianMobile(mobile);
    if (!digits) {
      const message = 'Enter a valid 10-digit Indian mobile number.';
      setPhoneError(message);
      phoneRef.current?.focus();
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }

    Keyboard.dismiss();
    submittingRef.current = true;
    setPhoneError('');
    try {
      const response = await login(digits, isSignup ? name.trim() || undefined : undefined, isSignup);
      await finishScreenTransition();
      const rootNav = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
      const root = resolveRootRoute(response.status.recommendedNextScreen);
      if (root === 'Onboarding') {
        rootNav?.replace('Onboarding', { screen: resolveOnboardingInitialRoute(response.status.recommendedNextScreen) });
        return;
      }
      if (root === 'PaidTransition') {
        rootNav?.replace('PaidTransition', { screen: resolvePaidInitialRoute(response.status.recommendedNextScreen) });
        return;
      }
      // Returning users enter through the bounded startup warm-up so their
      // first Main frame is hydrated instead of immediately showing loaders.
      rootNav?.replace(root === 'Main' ? 'Splash' : root);
    } catch (submitError) {
      if (!isSignup && submitError instanceof ApiError && submitError.status === 404
        && (submitError.payload as { code?: string } | undefined)?.code === 'ACCOUNT_NOT_FOUND') {
        navigation.replace('Login', {
          mode: 'signup',
          mobile: digits,
          reduceMotion: motionPreference === 'reduce',
        });
        return;
      }
      const message = submitError instanceof Error ? submitError.message : 'We could not sign you in. Please try again.';
      setPhoneError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      submittingRef.current = false;
    }
  };

  const openLegalPage = (url: string, label: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(`Could not open ${label}`, 'Please check your connection and try again.');
    });
  };

  const returnToWelcome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    // Login can still be restored or deep-linked without a Welcome entry in
    // the stack. Keep the back action useful in that case as well.
    navigation.replace('Welcome');
  };

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <NativeLinearGradient
        colors={['#101116', colors.bg, colors.bg]}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View style={[styles.interface, { opacity: exitOpacity }]}>
        <Animated.View
          style={[
            styles.topBar,
            {
              opacity: headerReveal,
              transform: [{ translateY: headerReveal.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
            },
          ]}
        >
          <TouchableOpacity
            onPress={returnToWelcome}
            style={styles.backButton}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the welcome screen"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Feather name="chevron-left" size={25} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.brand}>
            <Logo height={compact ? 31 : 34} showTagline={false} />
          </View>
          <View style={styles.topBarSpacer} />
        </Animated.View>

        <Animated.View
          style={[
            styles.keyboardStage,
            {
              opacity: bodyReveal,
              transform: [{ translateY: bodyReveal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          <KeyboardScreen
            scroll
            style={styles.keyboard}
            contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
          >
            <View style={styles.content}>
              <View style={styles.intro}>
                <View style={styles.accentRule} />
                <Text style={styles.title} accessibilityRole="header">
                  {isSignup ? 'Start your analysis' : 'Welcome back'}
                </Text>
                <Text style={styles.subtitle}>
                  {isSignup
                    ? 'Enter your details to create your FormBae profile.'
                    : 'Enter the mobile number linked to your FormBae profile.'}
                </Text>
              </View>

              <View style={styles.form}>
                {isSignup ? (
                  <FormInput
                    label="First name"
                    icon="user"
                    value={name}
                    onChangeText={setName}
                    placeholder="Your first name"
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="givenName"
                    returnKeyType="next"
                    maxLength={50}
                    editable={!loading}
                    blurOnSubmit={false}
                    onSubmitEditing={() => phoneRef.current?.focus()}
                  />
                ) : null}

                <FormInput
                  ref={phoneRef}
                  label="Mobile number"
                  prefix="+91"
                  value={mobile}
                  onChangeText={handleMobileChange}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  maxLength={14}
                  editable={!loading}
                  autoCorrect={false}
                  spellCheck={false}
                  inputAccessoryViewID={Platform.OS === 'ios' ? PHONE_ACCESSORY_ID : undefined}
                  onSubmitEditing={onSubmit}
                  accessibilityHint="Enter the 10 digits after plus 91"
                  error={phoneError || undefined}
                />

                <PrimaryButton
                  title={isSignup ? 'Continue to analysis' : 'Sign in'}
                  icon="arrow-right"
                  iconPosition="trailing"
                  centerTitle
                  onPress={onSubmit}
                  loading={loading}
                  size="lg"
                  style={styles.cta}
                />

                <Text style={styles.legal}>
                  By continuing, you agree to our{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => openLegalPage(TERMS_URL, 'Terms of Use')}
                    accessibilityRole="link"
                    accessibilityLabel="Read FormBae Terms of Use"
                  >
                    Terms of Use
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => openLegalPage(PRIVACY_URL, 'Privacy Policy')}
                    accessibilityRole="link"
                    accessibilityLabel="Read FormBae Privacy Policy"
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>
          </KeyboardScreen>
        </Animated.View>
      </Animated.View>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={PHONE_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <Text style={styles.keyboardAccessoryLabel}>Mobile number</Text>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={styles.keyboardDoneButton}
              accessibilityRole="button"
              accessibilityLabel="Done entering mobile number"
            >
              <Text style={styles.keyboardDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
    </ScreenContainer>
  );
}

export function normalizeIndianMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 10
    ? digits
    : digits.length === 11 && digits.startsWith('0')
      ? digits.slice(1)
      : digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : '';
  return /^[6-9]\d{9}$/.test(national) ? national : '';
}

function toNationalMobileInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(2, 12);
  if (digits.length > 10 && digits.startsWith('0')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  interface: { flex: 1 },
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
  keyboardStage: { flex: 1 },
  keyboard: { backgroundColor: 'transparent' },
  scrollContent: { justifyContent: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  scrollContentCompact: { justifyContent: 'flex-start', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  intro: { maxWidth: 420, marginBottom: spacing.xl },
  accentRule: { width: 38, height: 3, borderRadius: radius.pill, backgroundColor: colors.accent, marginBottom: spacing.md },
  title: { ...typography.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: colors.inkStrong },
  subtitle: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.inkMuted, marginTop: spacing.sm, maxWidth: 410 },
  form: { width: '100%' },
  cta: { minHeight: 62, borderRadius: radius.xl, marginTop: spacing.xs, paddingHorizontal: 20 },
  legal: {
    ...typography.caption,
    maxWidth: 390,
    alignSelf: 'center',
    color: colors.inkSubtle,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  legalLink: {
    color: colors.inkMuted,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  keyboardAccessory: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  keyboardAccessoryLabel: { ...typography.caption, color: colors.inkMuted },
  keyboardDoneButton: { minWidth: 56, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  keyboardDoneText: { ...typography.bodyBold, color: colors.accent },
});
