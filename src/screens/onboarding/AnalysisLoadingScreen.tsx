import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StableImage } from '../../components/StableImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { generateAnalysis } from '../../services/questionnaireService';
import type { OnboardingStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AnalysisLoading'>;

export const REPORT_LOADING_MS = 5000;

const loadingArtwork = {
  male: require('../../assets/onboarding/report-loading-male.webp'),
  default: require('../../assets/onboarding/report-loading-default.webp'),
};

const goalLabels: Record<string, string> = {
  lighter: 'Lose weight',
  lose_weight: 'Lose weight',
  stronger: 'Build strength',
  build_muscle: 'Build muscle',
  consistent: 'Build routine',
  confidence: 'Train confidently',
  confident: 'Train confidently',
  energy: 'Feel energetic',
};

export function reportLoadingDetails(answers: Record<string, string> = {}) {
  const rawGoal = answers.goal_feeling || answers.goal || '';
  return [
    { label: 'Goal', value: goalLabels[rawGoal] || 'Mapped' },
    { label: 'Blocker', value: answers.goal_obstacle || answers.root_cause ? 'Locked' : 'Matched' },
    { label: 'Report', value: 'Building' },
  ];
}

export function AnalysisLoadingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const compact = height < 740;
  const answers = useMemo(() => route.params?.answers || {}, [route.params?.answers]);
  const artwork = answers.p_gender === 'male' ? loadingArtwork.male : loadingArtwork.default;
  const details = useMemo(() => reportLoadingDetails(answers), [answers]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const animation = Animated.loop(Animated.timing(spin, {
      toValue: 1,
      duration: 1500,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, spin]);

  useEffect(() => {
    let active = true;
    const minimumDisplay = new Promise<void>(resolve => setTimeout(resolve, REPORT_LOADING_MS));
    (async () => {
      await Promise.allSettled([generateAnalysis(), minimumDisplay]);
      // AnalysisReport retries the GET if generation failed or the response was lost.
      if (active) navigation.replace('AnalysisReport');
    })();
    return () => { active = false; };
  }, [navigation]);

  const ringSize = Math.min(compact ? 184 : 220, width * 0.56);
  const portraitSize = ringSize * 0.68;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.root}>
      <StableImage source={artwork} defaultSource={artwork} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={styles.imageWash} />
      <LinearGradient
        colors={['rgba(2,4,10,0.46)', 'rgba(2,4,10,0.82)', '#02040a']}
        locations={[0, 0.48, 0.76]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.ringFrame, { width: ringSize, height: ringSize }]}>
          <Animated.View
            testID="report-loading-ring"
            style={[styles.ring, { transform: [{ rotate: reduceMotion ? '18deg' : rotate }] }]}
          />
          <View style={[styles.portraitFrame, { width: portraitSize, height: portraitSize }]}>
            <StableImage source={artwork} defaultSource={artwork} resizeMode="cover" style={styles.portrait} />
          </View>
        </View>

        <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>PREPARING YOUR PRELIMINARY REPORT</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Matching your baseline</Text>
        <Text style={[styles.description, compact && styles.descriptionCompact]}>
          Reading your goal, activity level, training setup, and the blocker that usually breaks consistency.
        </Text>

        <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
          {details.map(detail => (
            <View key={detail.label} style={styles.detailCard}>
              <Text style={styles.detailLabel}>{detail.label}</Text>
              <Text style={styles.detailValue} numberOfLines={2}>{detail.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02040a' },
  imageWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2,4,10,0.66)' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ringFrame: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderTopColor: '#f8d984',
    borderRightColor: 'rgba(255,255,255,0.60)',
    shadowColor: '#f8d884',
    shadowOpacity: 0.18,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
  },
  portraitFrame: {
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: '#0c0f15',
    shadowColor: '#fff',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  portrait: { width: '100%', height: '100%' },
  eyebrow: { marginTop: 24, color: 'rgba(255,255,255,0.62)', fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 2.2, textAlign: 'center' },
  eyebrowCompact: { marginTop: 16, fontSize: 10 },
  title: { marginTop: 10, color: colors.white, fontSize: 38, lineHeight: 41, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  titleCompact: { fontSize: 32, lineHeight: 36 },
  description: { maxWidth: 370, marginTop: 14, color: 'rgba(255,255,255,0.64)', fontSize: 14, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  descriptionCompact: { marginTop: 10, lineHeight: 20 },
  detailGrid: { width: '100%', maxWidth: 390, flexDirection: 'row', gap: 8, marginTop: 22 },
  detailGridCompact: { marginTop: 16 },
  detailCard: { minHeight: 68, flex: 1, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.13)', borderRadius: 14, backgroundColor: 'rgba(12,15,21,0.78)', paddingHorizontal: 12, paddingVertical: 10 },
  detailLabel: { color: 'rgba(255,255,255,0.44)', fontSize: 9, lineHeight: 13, fontWeight: '700', letterSpacing: 1.35, textTransform: 'uppercase' },
  detailValue: { marginTop: 4, color: colors.white, fontSize: 13, lineHeight: 17, fontWeight: '700' },
});
