import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  StyleSheet,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { ScreenContainer, ScreenTitle } from '../../components/Card';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchAnalysis } from '../../services/questionnaireService';
import { useAuthStore } from '../../store/authStore';
import type { OnboardingStackParamList } from '../../navigation/types';
import type { AnalysisReport } from '../../types/api';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AnalysisReport'>;

const GOLD = '#f8d984';
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function AnalysisReportScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { user, status } = useAuthStore();
  const { data, loading, error, reload } = useAsync(() => fetchAnalysis());
  const report = data?.report ?? null;
  const [chartVisible, setChartVisible] = useState(false);
  const chartVisibleRef = useRef(false);
  const chartAnchorRef = useRef<View>(null);

  const layout = useMemo(() => {
    const compact = windowWidth < 380;
    const narrow = windowWidth < 360;
    const outerPad = compact ? 8 : 12;
    const contentPad = compact ? 14 : 20;
    const chipGap = 8;
    return {
      compact,
      narrow,
      outerPad,
      contentPad,
      chipGap,
      shellRadius: compact ? 22 : 28,
      titleSize: narrow ? 26 : compact ? 28 : 32,
      titleLineHeight: narrow ? 28 : compact ? 29 : 31,
      bigStatSize: narrow ? 30 : compact ? 34 : 38,
      unlockMinHeight: compact ? 56 : 64,
      unlockFontSize: compact ? 16 : 18,
      sectionGap: compact ? 10 : 12,
    };
  }, [windowWidth]);

  const checkChartVisibility = useCallback(() => {
    if (chartVisibleRef.current) return;
    chartAnchorRef.current?.measureInWindow((_x, y, _w, height) => {
      const visibleRatio = Math.min(height, Math.max(0, Math.min(y + height, windowHeight) - Math.max(y, 0))) / Math.max(height, 1);
      if (visibleRatio < 0.35) return;
      chartVisibleRef.current = true;
      setChartVisible(true);
    });
  }, [windowHeight]);

  useEffect(() => {
    const timer = setTimeout(checkChartVisibility, 320);
    return () => clearTimeout(timer);
  }, [report, checkChartVisibility]);

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your fitness analysis</ScreenTitle>
        <LoadingState message="Preparing your personalized report…" />
      </ScreenContainer>
    );
  }

  if (error || !report) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your fitness analysis</ScreenTitle>
        <ErrorState message={error || 'We could not load your report yet.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const firstName = (user?.name || status?.name || '').trim().split(/\s+/)[0];
  const title = firstName ? `${firstName}, your current baseline is mapped.` : 'Your current baseline, mapped.';
  const bmiPosition = report.bmiPosition ?? Math.max(6, Math.min(94, ((report.bmi - 16) / 18) * 100));
  const projectionStart = report.projectionStartScore ?? report.projectionData?.[0]?.score ?? 0;
  const projectionTarget =
    report.projectionTargetScore ?? report.projectionData?.[report.projectionData.length - 1]?.score ?? 0;
  const cadence = report.cadence || report.weeklySchedule;
  const workoutStyle = report.workoutStyle || report.workoutDirection;
  const insightChips: Array<[string, string]> = [
    ['Goal', report.goal || 'Stay consistent'],
    ['Blocker', report.blocker || 'Workout friction'],
    ['Root cause', report.cause || 'Routine friction'],
    ['Training', cadence],
    ['Workout style', workoutStyle],
    ['Training type', report.identity || 'Personalised'],
    ['Activity', report.activity || 'Personalised'],
    ['Diet', report.diet || 'Flexible'],
  ];
  const solutionMap: Array<[string, string]> = [
    ['AI trainer', 'Turns your answers into a practical first plan.'],
    ['Workout plan', `Built for ${cadence.toLowerCase()} with a ${workoutStyle.toLowerCase()} bias.`],
    ['Diet direction', `${report.diet || 'Flexible'} guidance focused on consistency, not extremes.`],
    ['Coaching style', `${report.identity || 'Personalised'} cues so the plan feels natural to follow.`],
    ['Coach upgrades', 'Personal trainer support is available when you want check-ins.'],
  ];

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + (layout.compact ? 8 : 12),
          paddingBottom: Math.max(insets.bottom, layout.compact ? 8 : 12),
          paddingHorizontal: layout.outerPad,
          gap: layout.sectionGap,
        },
      ]}
    >
      <View style={[styles.shell, { borderRadius: layout.shellRadius }]}>
        <LinearGradient colors={['#0b0d13', '#03050a']} style={StyleSheet.absoluteFill} />
        <ReportTopGlow />

        <ScrollView
          style={styles.shellScroll}
          showsVerticalScrollIndicator={false}
          onScroll={checkChartVisibility}
          scrollEventThrottle={16}
          onContentSizeChange={checkChartVisibility}
          contentContainerStyle={[
            styles.shellContent,
            layout.compact && styles.shellContentCompact,
            {
              paddingHorizontal: layout.contentPad,
              paddingTop: layout.contentPad,
            },
          ]}
        >
          <Text style={styles.reportEyebrow}>Your preliminary report is ready</Text>
          <Text style={[styles.reportTitle, { fontSize: layout.titleSize, lineHeight: layout.titleLineHeight }]}>{title}</Text>
          <Text style={styles.reportIntro}>{report.goalSummary}</Text>

          <View style={styles.baselineGrid}>
            <View style={[styles.bmiCard, layout.compact && styles.cardPadCompact]}>
              <Text style={styles.eyebrowMuted}>Estimated BMI</Text>
              <View style={styles.bmiValueRow}>
                <Text style={[styles.bigStat, { fontSize: layout.bigStatSize, lineHeight: layout.bigStatSize }]}>{report.bmi || '-'}</Text>
                <Text style={styles.bmiGoal}>Goal zone{'\n'}18.5-24.9</Text>
              </View>
              <View style={styles.bmiTrack}>
                <View style={styles.bmiGoalZone} />
                <View style={[styles.bmiMarker, { left: `${bmiPosition}%` }]} />
              </View>
              <Text style={styles.softCaption}>
                Target-weight reference around {report.goalWeight || 'your goal'} kg for your selected height range.
              </Text>
            </View>
            <View style={[styles.readinessCard, layout.compact && styles.cardPadCompact]}>
              <Text style={styles.eyebrowGold}>Readiness</Text>
              <Text style={[styles.bigStat, styles.readinessValue, { fontSize: layout.bigStatSize, lineHeight: layout.bigStatSize }]}>
                {report.readinessScore}
              </Text>
              <Text style={styles.softCaption}>Strong enough to start with a simple repeatable week.</Text>
            </View>
          </View>

          <View style={[styles.insightGrid, { gap: layout.chipGap }]}>
            {insightChips.map(([label, value]) => (
              <View key={label} style={styles.insightChip}>
                <Text style={styles.insightLabel}>{label}</Text>
                <Text style={styles.insightValue}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {report.projectionData?.length ? (
            <LinearGradient
              colors={['rgba(248,216,132,0.12)', 'rgba(255,255,255,0.045)']}
              style={styles.projectionCard}
            >
              <View style={styles.projectionHeader}>
                <View style={styles.projectionKicker}>
                  <Text style={styles.eyebrowGold}>
                    30-day consistency projection
                  </Text>
                </View>
                <View style={styles.projectedBadge}>
                  <Text style={styles.projectedLabel}>Projected</Text>
                  <Text style={styles.projectedValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                    {projectionStart} to {projectionTarget}
                  </Text>
                </View>
              </View>

              <View ref={chartAnchorRef} collapsable={false} style={styles.chartStage} onLayout={checkChartVisibility}>
                <ProjectionChart data={report.projectionData} hasViewed={chartVisible} />
              </View>

              <View style={styles.projectionMetrics}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Now</Text>
                  <Text style={styles.metricValue}>{projectionStart}</Text>
                  <Text style={styles.metricHint}>Current consistency index</Text>
                </View>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabelGold}>30-day target</Text>
                  <Text style={styles.metricValue}>{projectionTarget}</Text>
                  <Text style={styles.metricHint}>Sessions, logs, recovery, and diet structure</Text>
                </View>
              </View>
            </LinearGradient>
          ) : null}

          <View style={styles.plainCard}>
            <View style={styles.structureHeader}>
              <View style={styles.structureHeaderCopy}>
                <Text style={styles.eyebrowMuted}>30 day structure</Text>
                <Text style={styles.structureTitle}>Easy start, progressive middle, habit lock.</Text>
              </View>
              <StructureBars />
            </View>
            <View style={styles.stackGap}>
              {[
                ['Week 1', 'Short sessions that reduce friction and rebuild consistency.'],
                ['Weeks 2-3', 'Progressive workout split plus simple diet direction.'],
                ['Week 4', 'Lock the habit with checkpoints and next-step progression.'],
              ].map(([week, detail]) => (
                <View key={week} style={styles.metricTile}>
                  <Text style={styles.metricLabelGold}>{week}</Text>
                  <Text style={styles.structureText}>{detail}</Text>
                </View>
              ))}
            </View>
          </View>

          <LinearGradient
            colors={['rgba(248,216,132,0.16)', 'rgba(255,255,255,0.045)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.trainerSupportCard}
          >
            <Text style={styles.eyebrowGold}>Trainer support</Text>
            <View style={styles.trainerSupportRow}>
              <View style={styles.trainerSupportCopy}>
                <Text style={styles.trainerSupportLead}>Based on your profile:</Text>
                <Text style={styles.trainerCadence}>
                  {report.trainerCadence || 'We recommend getting a personal trainer once every 2 months.'}
                </Text>
              </View>
              <View style={styles.trainerSupportIcon}>
                <Feather name="users" size={20} color={GOLD} />
              </View>
            </View>
            <Text style={styles.trainerReason}>
              {report.trainerReason ||
                'Use that trainer month as a periodic calibration while you train mostly independently.'}
            </Text>
          </LinearGradient>

          <View style={styles.plainCard}>
            <Text style={styles.eyebrowMuted}>FormBae solution map</Text>
            <View style={styles.stackGap}>
              {solutionMap.map(([titleText, detail], index) => (
                <View key={titleText} style={styles.solutionRow}>
                  <View style={styles.solutionNumber}>
                    <Text style={styles.solutionNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.solutionCopy}>
                    <Text style={styles.solutionTitle}>{titleText}</Text>
                    <Text style={styles.solutionText}>{detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {report.recommendedTrainer?.name ? (
            <TrainerMatchCard
              report={report}
              compact={layout.compact}
              onContinue={() => navigation.navigate('PaymentRequired')}
              onBrowse={() => navigation.navigate('PaymentRequired')}
            />
          ) : null}
        </ScrollView>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unlock my full report"
        onPress={() => navigation.navigate('PaymentRequired')}
        style={({ pressed }) => [
          styles.unlockButton,
          { minHeight: layout.unlockMinHeight },
          pressed && styles.unlockPressed,
        ]}
      >
        <Text style={[styles.unlockText, { fontSize: layout.unlockFontSize }]}>Unlock my full report</Text>
        <Feather name="arrow-right" size={layout.compact ? 18 : 20} color="#09090b" />
      </Pressable>
    </View>
  );
}

function StructureBars() {
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.structureBars}>
      <Animated.View style={[styles.structureBar, styles.structureBar1, { opacity: pulse }]} />
      <Animated.View style={[styles.structureBar, styles.structureBar2, { opacity: pulse }]} />
      <Animated.View style={[styles.structureBar, styles.structureBar3, { opacity: pulse }]} />
    </View>
  );
}

function ReportTopGlow() {
  return (
    <View pointerEvents="none" style={styles.topGlow}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="reportTopGlow" cx="50%" cy="0%" rx="62%" ry="62%">
            <Stop offset="0%" stopColor={GOLD} stopOpacity="0.16" />
            <Stop offset="62%" stopColor={GOLD} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#reportTopGlow)" />
      </Svg>
    </View>
  );
}

function TrainerMatchCard({
  report,
  compact,
  onContinue,
  onBrowse,
}: {
  report: AnalysisReport;
  compact?: boolean;
  onContinue: () => void;
  onBrowse: () => void;
}) {
  const trainer = report.recommendedTrainer;
  const avatarSize = compact ? 56 : 64;
  return (
    <View style={styles.trainerCard}>
      <Text style={styles.eyebrowGold}>{trainer.badge || 'Recommended personal trainer'}</Text>
      <View style={styles.trainerRow}>
        <View style={[styles.trainerAvatar, { width: avatarSize, height: avatarSize }]}>
          {trainer.photoUrl ? (
            <Image source={{ uri: trainer.photoUrl }} style={styles.trainerPhoto} />
          ) : (
            <Text style={styles.trainerInitial}>{trainer.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.trainerCopy}>
          <Text style={styles.trainerName}>
            {trainer.name}
          </Text>
          <Text style={styles.trainerMeta}>
            {trainer.coachType || 'Personal trainer'}
          </Text>
        </View>
      </View>
      {trainer.description ? <Text style={styles.trainerDescription}>{trainer.description}</Text> : null}
      {trainer.why ? (
        <View style={styles.trainerWhyBox}>
          <Text style={styles.metricLabelGold}>Why this trainer is right for you</Text>
          <Text style={styles.trainerWhy}>{trainer.why}</Text>
        </View>
      ) : null}
      <View style={styles.trainerActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={({ pressed }) => [styles.trainerPrimaryBtn, pressed && styles.unlockPressed]}
        >
          <Text style={styles.trainerPrimaryText}>Continue with this trainer</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onBrowse}
          style={({ pressed }) => [styles.trainerSecondaryBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.trainerSecondaryText}>Browse other trainers</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildMonotonePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function pathLengthEstimate(points: Array<{ x: number; y: number }>) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return Math.max(length * 1.08, 1);
}

function ProjectionChart({
  data,
  hasViewed,
}: {
  data: Array<{ week: string; score: number; note: string }>;
  hasViewed: boolean;
}) {
  const width = 320;
  const height = 208;
  const paddingX = 34;
  const paddingRight = 10;
  const paddingY = 18;
  const min = 30;
  const max = 100;
  const range = max - min;
  const values = data.map((point) => Math.max(min, Math.min(max, point.score)));
  const points = values.map((value, index) => {
    const x = paddingX + (index * (width - paddingX - paddingRight)) / Math.max(1, values.length - 1);
    const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
    return { x, y };
  });
  const linePath = useMemo(() => buildMonotonePath(points), [points]);
  const pathLength = useMemo(() => pathLengthEstimate(points), [points]);
  const drawProgress = useRef(new Animated.Value(0)).current;
  const [showDots, setShowDots] = useState(false);
  const ticks = [30, 50, 70, 90];

  useEffect(() => {
    if (!hasViewed) return;
    drawProgress.setValue(0);
    setShowDots(false);
    Animated.timing(drawProgress, {
      toValue: 1,
      duration: 1200,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setShowDots(true);
    });
  }, [hasViewed, drawProgress]);

  const dashOffset = drawProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [pathLength, 0],
  });
  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Your projected fitness readiness over time">
        {ticks.map((tick) => {
          const y = height - paddingY - ((tick - min) / range) * (height - paddingY * 2);
          return (
            <G key={tick}>
              <Line x1={paddingX} x2={width - paddingRight} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <SvgText x={paddingX - 8} y={y + 3} fill="rgba(255,255,255,0.42)" fontSize="10" textAnchor="end">
                {tick}
              </SvgText>
            </G>
          );
        })}
        {hasViewed ? (
          <AnimatedPath
            d={linePath}
            fill="none"
            stroke={GOLD}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[pathLength, pathLength]}
            strokeDashoffset={dashOffset}
          />
        ) : null}
        {hasViewed && showDots
          ? points.map((point, index) => (
              <Circle key={data[index].week} cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke={GOLD} strokeWidth="2" />
            ))
          : null}
      </Svg>
      <View style={styles.chartLabels}>
        {data.map((point) => (
          <Text key={point.week} style={styles.chartLabel}>
            {point.week}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cardPadCompact: {
    padding: 12,
  },
  shell: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    backgroundColor: '#0b0d13',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 192,
  },
  shellScroll: { flex: 1 },
  shellContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  shellContentCompact: {
    paddingBottom: 32,
  },
  reportEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: 'rgba(248,216,132,0.72)',
  },
  reportTitle: {
    marginTop: 8,
    fontSize: 32,
    lineHeight: 31,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: '#ffffff',
  },
  reportIntro: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.64)',
  },
  baselineGrid: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  bmiCard: {
    flex: 1.05,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    padding: 16,
  },
  readinessCard: {
    flex: 0.95,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.18)',
    backgroundColor: 'rgba(248,216,132,0.10)',
    padding: 16,
  },
  eyebrowMuted: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.40)',
  },
  eyebrowGold: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(248,216,132,0.78)',
  },
  bmiValueRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  bigStat: {
    fontSize: 38,
    lineHeight: 38,
    fontWeight: '600',
    color: '#ffffff',
  },
  readinessValue: {
    marginTop: 8,
  },
  bmiGoal: {
    paddingBottom: 4,
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.48)',
  },
  bmiTrack: {
    marginTop: 16,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    position: 'relative',
  },
  bmiGoalZone: {
    position: 'absolute',
    left: '18%',
    right: '32%',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(248,216,132,0.70)',
  },
  bmiMarker: {
    position: 'absolute',
    top: -4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
  },
  softCaption: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.54)',
  },
  insightGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  insightChip: {
    flexGrow: 1,
    flexBasis: '48%',
    maxWidth: '48.8%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  insightLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.36)',
  },
  insightValue: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  projectionCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.22)',
    padding: 12,
    shadowColor: GOLD,
    shadowOpacity: 0.07,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    gap: 4,
  },
  projectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  projectionKicker: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  projectedBadge: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '42%',
  },
  projectedLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)',
  },
  projectedValue: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  chartStage: {
    marginTop: 4,
    marginBottom: 4,
  },
  chartWrap: {
    width: '100%',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
    paddingLeft: 26,
    paddingRight: 2,
  },
  chartLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.58)',
  },
  projectionMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metricTile: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.24)',
    padding: 10,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)',
  },
  metricLabelGold: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(248,216,132,0.72)',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  metricHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.50)',
  },
  plainCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    padding: 12,
    gap: 12,
  },
  structureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  structureHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  structureTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  structureBars: {
    width: 72,
    height: 48,
    position: 'relative',
  },
  structureBar: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  structureBar1: {
    left: 0,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  structureBar2: {
    left: 24,
    height: 36,
    backgroundColor: 'rgba(248,216,132,0.70)',
  },
  structureBar3: {
    left: 48,
    height: 48,
    backgroundColor: '#ffffff',
  },
  stackGap: {
    gap: 8,
  },
  structureText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
  },
  trainerSupportCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.24)',
    padding: 12,
    shadowColor: GOLD,
    shadowOpacity: 0.07,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
    gap: 8,
  },
  trainerSupportRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trainerSupportCopy: {
    flex: 1,
  },
  trainerSupportLead: {
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.66)',
  },
  trainerCadence: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
    color: '#ffffff',
  },
  trainerSupportIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.22)',
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainerReason: {
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.58)',
  },
  solutionRow: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.24)',
    padding: 10,
  },
  solutionNumber: {
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.28)',
    backgroundColor: 'rgba(248,216,132,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solutionNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: GOLD,
  },
  solutionCopy: {
    flex: 1,
  },
  solutionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  solutionText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.54)',
  },
  trainerCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,216,132,0.24)',
    backgroundColor: 'rgba(248,216,132,0.10)',
    padding: 10,
    gap: 8,
  },
  trainerRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trainerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainerPhoto: {
    width: '100%',
    height: '100%',
  },
  trainerInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  trainerCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  trainerName: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  trainerMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(248,216,132,0.78)',
  },
  trainerDescription: {
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.66)',
  },
  trainerWhyBox: {
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.24)',
    padding: 10,
  },
  trainerWhy: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.58)',
  },
  trainerActions: {
    marginTop: 2,
    gap: 8,
  },
  trainerPrimaryBtn: {
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  trainerPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#09090b',
    textAlign: 'center',
  },
  trainerSecondaryBtn: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  trainerSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  unlockButton: {
    minHeight: 64,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  unlockPressed: {
    backgroundColor: '#f4f4f5',
  },
  unlockText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#09090b',
    flexShrink: 1,
    textAlign: 'center',
  },
});
