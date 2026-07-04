import { useState } from 'react';
import { Alert, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { resolveOnboardingInitialRoute, resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
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
    <ScreenContainer>
      <ScreenTitle>{isSignup ? 'Start with your number' : 'Welcome back'}</ScreenTitle>
      <ScreenSubtitle>
        Use the same phone number you used on FormBae. If you paid on the website, we will sync your plan after login.
      </ScreenSubtitle>
      {isSignup ? <FormInput value={name} onChangeText={setName} placeholder="Your name (optional)" /> : null}
      <FormInput value={mobile} onChangeText={setMobile} placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={10} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton title={isSignup ? 'Continue' : 'Log in'} onPress={onSubmit} loading={loading} />
      <PrimaryButton title="Back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: 12 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  error: { color: '#c53030', marginBottom: 12 },
});
