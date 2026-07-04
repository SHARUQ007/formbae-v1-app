import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<PaidStackParamList, 'FindingTrainer'>;

export function FindingTrainerScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <ScreenTitle>We are finding your trainer</ScreenTitle>
      <ScreenSubtitle>
        A FormBae coach will be assigned based on your goal, schedule, and budget. This usually takes a short while — you will be notified when your trainer is ready.
      </ScreenSubtitle>
      <Text style={styles.copy}>You can explore the app while we finish setup. Your dashboard will unlock fully once your plan is live.</Text>
      <PrimaryButton title="Go to Dashboard" onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main')} />
      <PrimaryButton title="Check plan status" variant="secondary" onPress={() => navigation.navigate('PlanPreparing')} style={{ marginTop: 12 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  copy: { color: '#4a5f50', lineHeight: 22, marginBottom: 24 },
});
