import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PaidStackParamList, 'PlanPreparing'>;

export function PlanPreparingScreen({ navigation }: Props) {
  const { status, refreshStatus } = useAuthStore();

  useEffect(() => {
    // Poll status while the trainer finalizes the plan.
    let active = true;
    const check = async () => {
      try {
        const next = await refreshStatus();
        if (active && next.planReady) {
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

  return (
    <ScreenContainer>
      <ScreenTitle>Your plan is being prepared</ScreenTitle>
      <ScreenSubtitle>Your trainer is building your first workout week. This screen updates automatically.</ScreenSubtitle>
      <Card>
        <Text style={styles.item}>✓ Payment confirmed</Text>
        <Text style={styles.item}>{status?.trainerAssigned ? '✓ Trainer assigned' : '○ Trainer assignment in progress'}</Text>
        <Text style={styles.item}>{status?.planReady ? '✓ Plan ready' : '○ Workout plan being built'}</Text>
      </Card>
      <PrimaryButton
        title="Go to Dashboard"
        onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  item: { fontSize: 16, color: '#1b2a1f', marginBottom: 8 },
});
