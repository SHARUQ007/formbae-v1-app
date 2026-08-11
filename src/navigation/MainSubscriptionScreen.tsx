import { useEffect } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { MainTabNavigator } from './MainTabNavigator';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from './types';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export function MainSubscriptionScreen({ navigation }: Props) {
  const { status, refreshStatus } = useAuthStore();
  const subscription = status?.subscription;

  useEffect(() => {
    const refresh = () => refreshStatus().catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 60 * 60 * 1000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (subscription?.state === 'expired') navigation.replace('Renewal');
  }, [navigation, subscription?.state]);

  const graceDays = subscription?.graceDaysRemaining || 0;
  return (
    <View style={styles.screen}>
      <MainTabNavigator />
      {subscription?.state === 'grace' ? (
        <TouchableOpacity activeOpacity={0.92} onPress={() => navigation.navigate('Renewal')} style={styles.banner} accessibilityRole="button" accessibilityLabel={`Subscription grace period. ${graceDays} days left. Renew now.`}>
          <View style={styles.icon}><Feather name="clock" size={18} color={colors.gold} /></View>
          <View style={styles.copy}><Text style={styles.title}>{graceDays} day{graceDays === 1 ? '' : 's'} left in grace period</Text><Text style={styles.body}>Full access continues · Renew now</Text></View>
          <Feather name="chevron-right" size={19} color={colors.gold} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  banner: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 105, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, paddingHorizontal: spacing.md, ...shadows.md },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  copy: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyBold, color: colors.ink },
  body: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
});
