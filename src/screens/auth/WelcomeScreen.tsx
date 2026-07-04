import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, ScreenTitle, ScreenSubtitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const benefits = [
  'Free fitness analysis report',
  'Recommended male or female expert trainer',
  'Workout app included',
  'Plans within your budget',
];

export function WelcomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenTitle>Your trainer-backed fitness plan starts here</ScreenTitle>
        <ScreenSubtitle>
          FormBae matches you with a real personal trainer and a workout app built for Indian lifestyles — simple, human, and within your budget.
        </ScreenSubtitle>
        {benefits.map((item) => (
          <Card key={item} style={styles.benefitCard}>
            <Text style={styles.benefitText}>{item}</Text>
          </Card>
        ))}
        <View style={styles.actions}>
          <PrimaryButton title="Start My Analysis" onPress={() => navigation.navigate('Login', { mode: 'signup' })} />
          <PrimaryButton title="I already have a FormBae account" variant="secondary" onPress={() => navigation.navigate('Login', { mode: 'login' })} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  benefitCard: { marginBottom: 12 },
  benefitText: { fontSize: 16, color: '#1b2a1f', fontWeight: '600' },
  actions: { marginTop: 24, gap: 12 },
});
