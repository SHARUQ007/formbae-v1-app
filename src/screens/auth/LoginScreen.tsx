import { useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenHeader } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { LogoMark } from '../../components/Logo';
import { useAuthStore } from '../../store/authStore';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { AuthStackParamList, RootStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const { login, loading, error } = useAuthStore();
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const isSignup = route.params?.mode === 'signup';

  const onSubmit = async () => {
    const digits = mobile.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('Enter mobile', 'Please enter your 10-digit Indian mobile number.');
      return;
    }
    try {
      const response = await login(digits, name || undefined, isSignup);
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
      rootNav?.replace(root);
    } catch {
      // error shown below
    }
  };

  return (
    <ScreenContainer withBottomInset>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />
      <KeyboardScreen>
        <View style={styles.hero}>
          <LogoMark size={64} />
          <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>
            Use the same phone number you used on FormBae. If you paid on the website, we&apos;ll sync your plan right after login.
          </Text>
        </View>

        {isSignup ? (
          <FormInput label="Your name" icon="user" value={name} onChangeText={setName} placeholder="Optional" autoCapitalize="words" />
        ) : null}
        <FormInput
          label="Mobile number"
          icon="phone"
          value={mobile}
          onChangeText={setMobile}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          maxLength={10}
        />

        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={15} color={colors.error} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <PrimaryButton title={isSignup ? 'Continue' : 'Log in'} icon="arrow-right" onPress={onSubmit} loading={loading} style={styles.cta} />
        <Text style={styles.legal}>By continuing you agree to FormBae&apos;s Terms and Privacy Policy.</Text>
      </KeyboardScreen>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', marginBottom: spacing.xl },
  title: { ...typography.hero, color: colors.ink, marginTop: spacing.md },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  error: { ...typography.caption, color: colors.error, flex: 1 },
  cta: { marginTop: spacing.sm },
  legal: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.lg },
});
