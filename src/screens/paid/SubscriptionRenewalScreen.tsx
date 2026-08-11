import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchPaymentStatus, runNativeCheckout } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import type { RootStackParamList } from '../../navigation/types';
import type { PaymentPlan } from '../../types/api';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Renewal'>;

export function SubscriptionRenewalScreen({ navigation }: Props) {
  const { user, status, refreshStatus, logout } = useAuthStore();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [paywallId, setPaywallId] = useState('renewal-autopay-49');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const subscription = status?.subscription;
  const inGrace = subscription?.state === 'grace';

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentStatus();
      setPlans(data.plans || []);
      setSelectedId((current) => current || data.plans?.[0]?.planId || '');
      setPaywallId(data.paywallId || data.plans?.[0]?.paywallId || 'renewal-autopay-49');
    } catch (error) {
      Alert.alert('Could not load renewal options', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans().catch(() => undefined);
  }, [loadPlans]);

  const renew = async () => {
    const plan = plans.find((item) => item.planId === selectedId) || plans[0];
    if (!plan || paying) return;
    setPaying(true);
    try {
      const result = await runNativeCheckout({
        plan,
        user: {
          name: status?.name || user?.name || 'FormBae Trainee',
          mobile: status?.phone || user?.mobile || '',
          email: status?.email,
        },
        paywallId: plan.paywallId || paywallId,
      });
      if (result.cancelled) return;
      if (!result.success) {
        Alert.alert('Renewal issue', result.error || 'Your renewal could not be completed. Please try again.');
        return;
      }
      await refreshStatus();
      navigation.replace('Main');
    } catch (error) {
      Alert.alert('Could not finish renewal', error instanceof Error ? error.message : 'Your payment may still be processing. Check its status in a moment.');
    } finally {
      setPaying(false);
    }
  };

  const checkAccess = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const next = await refreshStatus();
      if (next.subscription?.state === 'active' || next.subscription?.state === 'grace') {
        navigation.replace('Main');
        return;
      }
      Alert.alert('Renewal not found yet', 'If you just paid, wait a moment and try again.');
    } catch (error) {
      Alert.alert('Could not check access', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigation.replace('Auth');
  };

  return (
    <ScreenContainer withBottomInset>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View><Text style={styles.brandText}>Form<Text style={styles.brandAccent}>Bae</Text></Text></View>
          {inGrace ? <TouchableOpacity onPress={() => navigation.replace('Main')} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Return to app"><Feather name="x" size={21} color={colors.ink} /></TouchableOpacity> : null}
        </View>

        <View style={styles.heroIcon}><Feather name={inGrace ? 'clock' : 'shield'} size={28} color={colors.gold} /></View>
        <Text style={styles.eyebrow}>{inGrace ? '7-DAY GRACE PERIOD' : 'SUBSCRIPTION ENDED'}</Text>
        <Text style={styles.title}>{inGrace ? `${subscription?.graceDaysRemaining || 0} days left to renew` : 'Keep your momentum going'}</Text>
        <Text style={styles.subtitle}>{inGrace ? 'You still have full access. Renew before the grace period ends to avoid interruption.' : 'Renew to reopen your workouts, coaching, diet diary, and accountability tools.'}</Text>

        <View style={styles.safeCard}>
          <View style={styles.safeIcon}><Feather name="check" size={17} color={colors.success} /></View>
          <View style={styles.safeCopy}><Text style={styles.safeTitle}>Your progress is safe</Text><Text style={styles.safeText}>Your logs, streaks, trophies, measurements, and trainer history stay saved.</Text></View>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Choose your renewal</Text><Text style={styles.sectionMeta}>Secure payment</Text></View>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.gold} /><Text style={styles.loadingText}>Loading options…</Text></View>
        ) : (
          <View style={styles.planList}>
            {plans.map((plan) => {
              const selected = plan.planId === selectedId;
              return (
                <TouchableOpacity key={plan.planId} activeOpacity={0.88} onPress={() => setSelectedId(plan.planId)} style={[styles.planCard, selected && styles.planCardSelected]} accessibilityRole="radio" accessibilityState={{ selected }}>
                  <View style={styles.planCopy}><Text style={styles.planName}>{plan.label || plan.planName}</Text><Text style={styles.planBilling}>{plan.billing === 'recurring' ? 'Renews automatically' : 'One-time payment'}</Text></View>
                  <Text style={styles.planPrice}>₹{(plan.amount / 100).toLocaleString('en-IN')}</Text>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Feather name="check" size={13} color={colors.onPrimary} /> : null}</View>
                </TouchableOpacity>
              );
            })}
            {!plans.length ? <TouchableOpacity onPress={loadPlans} style={styles.retryButton} accessibilityRole="button"><Feather name="refresh-cw" size={16} color={colors.gold} /><Text style={styles.retryText}>Retry loading plans</Text></TouchableOpacity> : null}
          </View>
        )}

        <PrimaryButton title={inGrace ? 'Renew without interruption' : 'Renew my access'} icon="arrow-right" onPress={renew} loading={paying} disabled={!plans.length || loading} style={styles.renewButton} />
        <TouchableOpacity onPress={checkAccess} disabled={checking} style={styles.checkButton} accessibilityRole="button"><Text style={styles.checkText}>{checking ? 'Checking payment…' : 'I already renewed · Check status'}</Text></TouchableOpacity>

        {!inGrace ? <TouchableOpacity onPress={signOut} style={styles.logoutButton} accessibilityRole="button"><Feather name="log-out" size={15} color={colors.inkMuted} /><Text style={styles.logoutText}>Log out</Text></TouchableOpacity> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  topRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryAction },
  brandMarkText: { fontSize: 18, lineHeight: 21, color: colors.onPrimary, fontWeight: '900' },
  brandText: { ...typography.title, color: colors.ink, fontWeight: '900' },
  brandAccent: { color: colors.gold },
  closeButton: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  heroIcon: { width: 60, height: 60, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, marginTop: spacing.xl },
  eyebrow: { ...typography.overline, color: colors.gold, marginTop: spacing.lg },
  title: { ...typography.display, color: colors.ink, marginTop: spacing.sm, maxWidth: 330 },
  subtitle: { ...typography.body, color: colors.inkMuted, lineHeight: 23, marginTop: spacing.sm, maxWidth: 350 },
  safeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.successLight, borderWidth: 1, borderColor: 'rgba(131,214,164,0.25)', padding: spacing.md, marginTop: spacing.lg },
  safeIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(131,214,164,0.14)' },
  safeCopy: { flex: 1 },
  safeTitle: { ...typography.bodyBold, color: colors.ink },
  safeText: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  sectionMeta: { ...typography.caption, color: colors.inkSubtle },
  loading: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption, color: colors.inkMuted },
  planList: { gap: spacing.sm },
  retryButton: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  retryText: { ...typography.label, color: colors.gold },
  planCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadows.sm },
  planCardSelected: { borderColor: colors.gold, backgroundColor: colors.panelWarm },
  planCopy: { flex: 1, minWidth: 0 },
  planName: { ...typography.bodyBold, color: colors.ink },
  planBilling: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  planPrice: { ...typography.title, color: colors.ink },
  radio: { width: 23, height: 23, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.borderStrong },
  radioSelected: { backgroundColor: colors.primaryAction, borderColor: colors.primaryAction },
  renewButton: { marginTop: spacing.lg },
  checkButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  checkText: { ...typography.label, color: colors.gold },
  logoutButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  logoutText: { ...typography.label, color: colors.inkMuted },
});
