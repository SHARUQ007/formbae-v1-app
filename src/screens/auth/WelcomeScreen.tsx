import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GradientHero } from '../../components/GradientHero';
import { Logo } from '../../components/Logo';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const benefits: { icon: string; title: string; desc: string }[] = [
  { icon: 'clipboard', title: 'Free fitness analysis', desc: 'A personalised readiness report in minutes' },
  { icon: 'user-check', title: 'Real expert trainer', desc: 'Matched to your goal, gender preference & budget' },
  { icon: 'activity', title: 'Workout app included', desc: 'Guided plans, videos and rest timers' },
  { icon: 'tag', title: 'Plans within your budget', desc: 'Coaching built for Indian lifestyles' },
];

export function WelcomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoRow}>
          <Logo height={30} />
        </View>

        <GradientHero
          eyebrow="Trainer-backed fitness"
          title="Your fitness plan, built around a real coach"
          subtitle="FormBae pairs you with a personal trainer and a workout app made for Indian lifestyles — simple, human, and affordable."
        />

        <View style={styles.benefits}>
          {benefits.map((item) => (
            <View key={item.title} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Feather name={item.icon} size={20} color={colors.accent} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{item.title}</Text>
                <Text style={styles.benefitDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            title="Start my free analysis"
            icon="arrow-right"
            onPress={() => navigation.navigate('Login', { mode: 'signup' })}
          />
          <PrimaryButton
            title="I already have an account"
            variant="ghost"
            onPress={() => navigation.navigate('Login', { mode: 'login' })}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.sm },
  logoRow: { alignItems: 'flex-start', marginBottom: spacing.lg },
  benefits: { marginTop: spacing.xl, gap: spacing.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1 },
  benefitTitle: { ...typography.bodyBold, color: colors.ink },
  benefitDesc: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
