import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { Logo } from '../../components/Logo';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAuthStore } from '../../store/authStore';
import { resolvePaidInitialRoute, resolveRootRoute } from '../../utils/routing';
import type { RootStackParamList } from '../../navigation/types';
import type { UserStatus } from '../../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionSuccess'>;
const GOLD = '#f8d984';

/** Only entered from a verified checkout. Status refresh happens behind the celebration. */
export function SubscriptionSuccessScreen({ navigation, route }: Props) {
  const { planName, nextScreen, renewal } = route.params;
  const { refreshStatus } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 900;
  const reduceMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(0)).current;
  const statusRequest = useRef<Promise<UserStatus | undefined> | null>(null);
  const proceeding = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    statusRequest.current = refreshStatus().catch(() => undefined);
    // Checkout was replaced. Android back must not expose an old purchase flow.
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => back.remove();
  }, [refreshStatus]);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(entrance, {
      toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduceMotion]);

  const onContinue = async () => {
    if (proceeding.current) return;
    proceeding.current = true;
    setBusy(true);
    try {
      const fresh = await statusRequest.current;
      const destination = fresh?.recommendedNextScreen || nextScreen || 'payment_sync';
      const root = resolveRootRoute(destination);
      if (root === 'Main') navigation.replace('Main');
      else navigation.replace('PaidTransition', {
        screen: root === 'PaidTransition' ? resolvePaidInitialRoute(destination) : 'PaymentSync',
      });
    } finally {
      proceeding.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.safeArea, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.brand}><Logo height={27} showTagline={false} /></View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={[styles.content, compact && styles.contentCompact]}>
          <Animated.View style={[styles.hero, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
            <Animated.View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[styles.checkmark, { transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
            >
              <Svg width={48} height={48} viewBox="0 0 48 48">
                <Path d="M13 24l7.5 7.5L36 16" fill="none" stroke="#1b211b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>

            <Text style={styles.confirmedText}>PAYMENT CONFIRMED</Text>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>
              {renewal ? 'Welcome back.' : 'Welcome to FormBae.'}
            </Text>
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
              {renewal
                ? 'Your membership is renewed. Your workouts and progress are ready when you are.'
                : 'Your subscription is active. Let’s finish setting up your profile and training plan.'}
            </Text>
          </Animated.View>

          <View style={[styles.membershipCard, compact && styles.membershipCardCompact]}>
            <View style={styles.cardTop}>
              <Text style={styles.cardEyebrow}>YOUR MEMBERSHIP</Text>
              <View style={styles.activeBadge}><View style={styles.statusDot} /><Text style={styles.activeText}>Active</Text></View>
            </View>
            <Text style={[styles.planName, compact && styles.planNameCompact]}>{planName}</Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton title={renewal ? 'Back to FormBae' : 'Continue'} icon="arrow-right" iconPosition="trailing" onPress={onContinue} loading={busy} size="lg" style={styles.cta} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080a0d' },
  safeArea: { flex: 1, paddingHorizontal: 24 },
  brand: { alignItems: 'center', paddingBottom: 8 },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24, gap: 40 },
  contentCompact: { gap: 32 },
  hero: { alignItems: 'center' },
  checkmark: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dcd4b8', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a7bca5' },
  confirmedText: { color: '#969992', fontSize: 10, lineHeight: 15, fontWeight: '600', letterSpacing: 1.5 },
  title: { color: '#f5f3ed', fontSize: 36, lineHeight: 42, fontWeight: '600', letterSpacing: -1, textAlign: 'center', marginTop: 12 },
  titleCompact: { fontSize: 30, lineHeight: 36 },
  subtitle: { color: '#9da09e', fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 320, marginTop: 14 },
  subtitleCompact: { fontSize: 14, lineHeight: 22 },
  membershipCard: { width: '100%', maxWidth: 380, alignSelf: 'center', paddingVertical: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#34352f' },
  membershipCardCompact: { paddingVertical: 20 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardEyebrow: { flex: 1, color: '#969992', fontSize: 10, lineHeight: 15, fontWeight: '500', letterSpacing: 1.2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeText: { fontSize: 12, lineHeight: 16, color: '#b4c4b1' },
  planName: { color: '#f5f3ed', fontSize: 22, lineHeight: 28, fontWeight: '500', marginTop: 10 },
  planNameCompact: { marginTop: 6 },
  footer: { flexShrink: 0, paddingTop: 16 },
  cta: { backgroundColor: GOLD, borderColor: GOLD, borderRadius: 14, minHeight: 56 },
});
