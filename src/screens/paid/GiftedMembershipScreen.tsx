import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PaidStackParamList, RootStackParamList } from '../../navigation/types';
import { acknowledgeMembershipGift } from '../../services/membershipGiftService';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { resolvePaidInitialRoute } from '../../utils/routing';

type Props = NativeStackScreenProps<PaidStackParamList, 'GiftedMembership'>;

export function GiftedMembershipScreen({ navigation }: Props) {
  const { height } = useWindowDimensions();
  const { status, refreshStatus } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const compact = height < 760;
  const gift = status?.membershipGift;
  const giver = useMemo(() => String(gift?.giftedByName || 'Someone special').trim() || 'Someone special', [gift?.giftedByName]);

  const continueIntoApp = async () => {
    setBusy(true);
    setError('');
    try {
      await acknowledgeMembershipGift();
      const fresh = await refreshStatus();
      if (fresh.recommendedNextScreen === 'home') {
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.replace('Main');
        return;
      }
      const next = resolvePaidInitialRoute(fresh.recommendedNextScreen);
      navigation.replace(next === 'GiftedMembership' ? 'PaidWelcome' : next);
    } catch {
      setError('We couldn’t open your membership. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer withBottomInset style={styles.screen}>
      <View style={[styles.page, compact && styles.pageCompact]}>
        <View style={[styles.heading, compact && styles.headingCompact]}>
          <Text style={styles.eyebrow}>A GIFT FOR YOUR WELLBEING</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>{giver} bought you FormBae Premium.</Text>
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>Your membership is taken care of.</Text>
        </View>

        <View style={styles.artStage}>
          <GiftMembershipArtwork compact={compact} />
        </View>

        <View style={[styles.messageCard, compact && styles.messageCardCompact]}>
          <Text style={[styles.messageTitle, compact && styles.messageTitleCompact]}>They believe in you.</Text>
          <Text style={[styles.message, compact && styles.messageCompact]}>Show up for yourself, build something lasting, and make them proud.</Text>
          <View style={styles.accessRow}>
            <View style={styles.accessDot} />
            <Text style={styles.accessText}>Premium access is active now</Text>
          </View>
        </View>

        <View style={styles.footer}>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            title="Start my journey"
            icon="arrow-right"
            iconPosition="trailing"
            onPress={continueIntoApp}
            loading={busy}
            size="lg"
            style={compact ? StyleSheet.flatten([styles.cta, styles.ctaCompact]) : styles.cta}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function GiftMembershipArtwork({ compact }: { compact: boolean }) {
  const width = compact ? 210 : 282;
  const height = compact ? 168 : 226;
  return (
    <Svg width={width} height={height} viewBox="0 0 300 240" accessibilityLabel="A premium membership gift opening">
      <Circle cx="150" cy="119" r="103" fill={colors.panel} stroke={colors.border} strokeWidth="1.5" />
      <Path d="M53 90c28-41 67-61 117-58 37 2 67 17 87 45" fill="none" stroke={colors.goldMuted} strokeWidth="2" strokeLinecap="round" />
      <Path d="M49 154c22 37 56 58 101 63 43 5 80-8 107-40" fill="none" stroke={colors.goldMuted} strokeWidth="2" strokeLinecap="round" />
      <G>
        <Rect x="85" y="105" width="130" height="83" rx="16" fill={colors.panelRaised} stroke={colors.gold} strokeWidth="2" />
        <Path d="M82 105h136v31H82z" fill={colors.gold} />
        <Path d="M137 105h26v83h-26z" fill={colors.accentLight} />
        <Path d="M150 105c-35-3-46-23-35-34 12-12 32 6 35 34z" fill={colors.panelRaised} stroke={colors.gold} strokeWidth="2" />
        <Path d="M150 105c35-3 46-23 35-34-12-12-32 6-35 34z" fill={colors.panelRaised} stroke={colors.gold} strokeWidth="2" />
        <Path d="M150 136l-17 52h34l-17-52z" fill={colors.goldMuted} opacity="0.55" />
      </G>
      <Circle cx="70" cy="76" r="5" fill={colors.gold} />
      <Circle cx="238" cy="115" r="4" fill={colors.ink} />
      <Path d="M233 62l4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9z" fill={colors.gold} />
      <Path d="M66 172l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" fill={colors.inkMuted} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg },
  page: { flex: 1, justifyContent: 'space-between', gap: spacing.md },
  pageCompact: { gap: 10 },
  heading: { gap: 8 },
  headingCompact: { gap: 5 },
  eyebrow: { ...typography.caption, color: colors.gold, fontWeight: '800', letterSpacing: 2.2 },
  title: { ...typography.hero, color: colors.ink, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  titleCompact: { fontSize: 29, lineHeight: 34 },
  subtitle: { ...typography.body, color: colors.inkMuted, fontSize: 18, lineHeight: 25 },
  subtitleCompact: { fontSize: 15, lineHeight: 20 },
  artStage: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  messageCard: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.lg, gap: 8 },
  messageCardCompact: { padding: spacing.md, gap: 5 },
  messageTitle: { ...typography.title, color: colors.ink, fontSize: 22, lineHeight: 28 },
  messageTitleCompact: { fontSize: 19, lineHeight: 24 },
  message: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  messageCompact: { fontSize: 13, lineHeight: 18 },
  accessRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 9 },
  accessDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  accessText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  footer: { gap: 8 },
  cta: { minHeight: 62 },
  ctaCompact: { minHeight: 56 },
  error: { ...typography.caption, color: colors.error, textAlign: 'center' },
});
