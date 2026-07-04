import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, ScreenSubtitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { displayBehavioralNotification } from '../../services/notificationService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>;

export function PlanPreparingScreen({ navigation }: Props) {
  const { status, refreshStatus } = useAuthStore();

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const next = await refreshStatus();
        if (active && next.planReady) {
          displayBehavioralNotification('planReady').catch(() => undefined);
          navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
        }
      } catch {
        // keep waiting
      }
    };
    check();
    const interval = setInterval(check, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [navigation, refreshStatus]);

  const steps = [
    { label: 'Payment confirmed', done: true },
    { label: 'Trainer assigned', done: !!status?.trainerAssigned },
    { label: 'Workout plan ready', done: !!status?.planReady },
  ];

  return (
    <ScreenContainer withBottomInset>
      <ScreenTitle>Your plan is being prepared</ScreenTitle>
      <ScreenSubtitle>Your trainer is building your first workout week. This screen updates automatically.</ScreenSubtitle>

      <Card>
        {steps.map((step, i) => (
          <View key={step.label} style={[styles.step, i > 0 && styles.stepGap]}>
            <View style={[styles.stepIcon, step.done ? styles.stepDone : styles.stepPending]}>
              {step.done ? (
                <Feather name="check" size={16} color={colors.white} />
              ) : (
                <Feather name="loader" size={16} color={colors.inkMuted} />
              )}
            </View>
            <Text style={[styles.stepLabel, step.done && styles.stepLabelDone]}>{step.label}</Text>
          </View>
        ))}
      </Card>

      <PrimaryButton
        title="Go to dashboard"
        icon="arrow-right"
        onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main')}
        style={styles.cta}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepGap: { marginTop: spacing.lg },
  stepIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.accent },
  stepPending: { backgroundColor: colors.panelMuted },
  stepLabel: { ...typography.body, color: colors.inkMuted },
  stepLabelDone: { color: colors.ink, fontWeight: '600' },
  cta: { marginTop: spacing.lg },
});
