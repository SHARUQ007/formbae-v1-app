import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PaidStackParamList, 'PaidWelcome'>;

export function PaidWelcomeScreen({ navigation }: Props) {
  const { status } = useAuthStore();

  return (
    <ScreenContainer>
      <ScreenTitle>Welcome to FormBae</ScreenTitle>
      <ScreenSubtitle>
        Your payment is confirmed and your trainer-backed plan is being set up. We are matching you with the right coach for your goal.
      </ScreenSubtitle>
      <Text style={styles.meta}>Status: {status?.onboardingStatus || 'paid'}</Text>
      <PrimaryButton
        title={status?.trainerAssigned ? 'View plan status' : 'Find my trainer'}
        onPress={() => navigation.navigate(status?.trainerAssigned ? 'PlanPreparing' : 'FindingTrainer')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  meta: { color: '#4a5f50', marginBottom: 20 },
});
