import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, ScreenSubtitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<PaidStackParamList, 'FindingTrainer'>;

export function FindingTrainerScreen({ navigation }: Props) {
  return (
    <ScreenContainer withBottomInset>
      <ScreenTitle>We are finding your trainer</ScreenTitle>
      <ScreenSubtitle>
        A FormBae coach will be assigned based on your goal, schedule and budget. You&apos;ll be notified when your trainer
        is ready.
      </ScreenSubtitle>

      <Card variant="accent">
        <View style={styles.row}>
          <View style={styles.icon}>
            <Feather name="search" size={20} color={colors.accent} />
          </View>
          <Text style={styles.copy}>
            You can explore the app while we finish setup. Your dashboard unlocks fully once your plan is live.
          </Text>
        </View>
      </Card>

      <View style={styles.spacer} />

      <PrimaryButton
        title="Go to dashboard"
        icon="arrow-right"
        onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main')}
      />
      <PrimaryButton title="Check plan status" variant="ghost" onPress={() => navigation.navigate('PlanPreparing')} style={styles.secondary} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { ...typography.body, color: colors.accentDarker, flex: 1 },
  spacer: { flex: 1 },
  secondary: { marginTop: spacing.sm },
});
