import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GradientHero } from '../../components/GradientHero';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { PaidStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PaidStackParamList, 'PaidWelcome'>;

export function PaidWelcomeScreen({ navigation }: Props) {
  const { status } = useAuthStore();

  return (
    <ScreenContainer withBottomInset>
      <View style={styles.top}>
        <View style={styles.check}>
          <Feather name="check" size={34} color={colors.white} />
        </View>
      </View>

      <GradientHero
        eyebrow="Payment confirmed"
        title="Welcome to FormBae"
        subtitle="Your trainer-backed plan is being set up. We're matching you with the right coach for your goal."
      />

      <View style={styles.spacer} />

      <PrimaryButton
        title={status?.trainerAssigned ? 'View plan status' : 'Find my trainer'}
        icon="arrow-right"
        onPress={() => navigation.navigate(status?.trainerAssigned ? 'PlanPreparing' : 'FindingTrainer')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.lg },
  check: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { flex: 1 },
});
