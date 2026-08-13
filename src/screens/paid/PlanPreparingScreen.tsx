import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View, Text, StyleSheet } from 'react-native';
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
  const activeRef = useRef(true);
  const checkingRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const next = await refreshStatus();
      if (activeRef.current && next.planReady) {
        displayBehavioralNotification('planReady').catch(() => undefined);
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
      }
    } catch (error) {
      if (activeRef.current) setCheckError(error instanceof Error ? error.message : 'We could not check the latest status.');
    } finally {
      checkingRef.current = false;
      if (activeRef.current) setChecking(false);
    }
  }, [navigation, refreshStatus]);

  useEffect(() => {
    activeRef.current = true;
    check();
    const interval = setInterval(() => check(), 20000);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [check]);

  const steps = [
    { label: 'Payment confirmed', done: true },
    { label: 'Trainer assigned', done: !!status?.trainerAssigned },
    { label: 'Workout plan ready', done: !!status?.planReady },
  ];

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.heroIcon}><ActivityIndicator size="small" color={colors.accent} /></View>
        <Text style={styles.kicker}>Personal plan setup</Text>
        <ScreenTitle>Your plan is taking shape</ScreenTitle>
        <ScreenSubtitle>Your trainer is turning your goals and schedule into your first workout week. You can safely leave—this keeps updating.</ScreenSubtitle>

        <Card style={styles.statusCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardKicker}>Setup progress</Text>
              <Text style={styles.cardTitle}>{steps.filter((step) => step.done).length} of {steps.length} complete</Text>
            </View>
            {checking ? <ActivityIndicator size="small" color={colors.accent} /> : <Feather name="clock" size={20} color={colors.inkSubtle} />}
          </View>
          {steps.map((step, i) => (
            <View key={step.label} style={[styles.step, i > 0 && styles.stepGap]}>
              <View style={[styles.stepIcon, step.done ? styles.stepDone : styles.stepPending]}>
                {step.done ? (
                  <Feather name="check" size={16} color={colors.onPrimary} />
                ) : i === steps.findIndex((entry) => !entry.done) ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Feather name="circle" size={14} color={colors.inkSubtle} />
                )}
              </View>
              <Text style={[styles.stepLabel, step.done && styles.stepLabelDone]}>{step.label}</Text>
            </View>
          ))}
        </Card>

        {checkError ? (
          <View style={styles.errorCard}>
            <Feather name="wifi-off" size={18} color={colors.error} />
            <View style={styles.errorText}><Text style={styles.errorTitle}>Status check paused</Text><Text style={styles.errorDetail}>{checkError}</Text></View>
          </View>
        ) : null}

        <PrimaryButton title={checking ? 'Checking status' : 'Check now'} icon="refresh-cw" onPress={check} loading={checking} variant="secondary" style={styles.checkButton} />
        <Text style={styles.waitNote}>We check automatically every 20 seconds and open your workouts as soon as the plan is ready.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: spacing.lg },
  heroIcon: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, marginBottom: spacing.md },
  kicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: spacing.xs },
  statusCard: { marginTop: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.lg, marginBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  cardKicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  cardTitle: { ...typography.subtitle, color: colors.ink, marginTop: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepGap: { marginTop: spacing.lg },
  stepIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.gold },
  stepPending: { backgroundColor: colors.panelMuted },
  stepLabel: { ...typography.body, color: colors.inkMuted, flex: 1, minWidth: 0 },
  stepLabelDone: { color: colors.ink, fontWeight: '600' },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.errorLight, borderWidth: 1, borderColor: 'rgba(255,129,140,0.28)', padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.md },
  errorText: { flex: 1 },
  errorTitle: { ...typography.bodyBold, color: colors.error },
  errorDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  checkButton: { marginTop: spacing.lg },
  waitNote: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.md },
});
