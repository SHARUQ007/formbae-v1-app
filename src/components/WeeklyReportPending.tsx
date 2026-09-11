import { StableImage } from './StableImage';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { typography } from '../theme/typography';
import { REPORT_IMAGE_POOLS } from '../utils/reportArtworkLibrary';
import { WEEKLY_GOAL_ARTWORK } from '../utils/weeklyGoalArtwork';
import { TrophyIllustration } from './TrophyIllustration';

type Props = {
  workouts: number;
  workoutTarget: number;
  meals: number;
  mealTarget: number;
  generating: boolean;
  queued: boolean;
  nextInDays: number;
  bottomInset: number;
  onWorkout: () => void;
  onMeal: () => void;
  onRankings: () => void;
};

export function WeeklyReportPending(props: Props) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740;
  const [viewport, setViewport] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const total = Math.max(0, props.workoutTarget) + Math.max(0, props.mealTarget);
  const completed = Math.min(props.workouts, props.workoutTarget) + Math.min(props.meals, props.mealTarget);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(completed / total * 100))) : 0;
  const days = Math.max(0, Math.ceil(props.nextInDays));
  return <View style={styles.viewport} onLayout={event => setViewport(event.nativeEvent.layout.height)} testID="weekly-report-pending">
    <ScrollView style={styles.viewport} contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.content, { paddingBottom: props.bottomInset + 8 }]}
      onContentSizeChange={(_width, nextHeight) => setContentHeight(nextHeight)}
      scrollEnabled={viewport > 0 && contentHeight > viewport + 1}
      bounces={false} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <StableImage source={REPORT_IMAGE_POOLS.weeklyCover[0].source} resizeMode="cover" accessible={false}
          testID="weekly-pending-artwork" style={StyleSheet.absoluteFill} />
        <View style={styles.artworkShade} pointerEvents="none" />
        <View style={styles.meta}>
          <Text style={styles.eyebrow}>YOUR WEEKLY REVIEW</Text>
          <Text style={styles.status}>{props.generating ? 'Preparing' : props.queued ? 'Queued' : `${percent}% logged`}</Text>
        </View>
        <View style={[styles.story, compact && styles.storyCompact]}>
          <Text style={[styles.title, compact && styles.titleCompact]} accessibilityRole="header">{props.generating ? 'Your report is on its way' : props.queued ? 'Your review is scheduled' : 'Your week is taking shape'}</Text>
          <Text style={styles.description}>{props.generating
            ? 'We’re bringing your activity together.'
            : props.queued
              ? days > 0 ? `We’ll review your week in ${days} day${days === 1 ? '' : 's'}.` : 'Your activity is ready for review.'
              : props.mealTarget > 0 ? 'A few workouts and meals tell your week’s story.' : 'Complete a workout to begin your weekly story.'}</Text>
        </View>
        <View style={styles.heroFooter}>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Activity logged toward your report" accessibilityValue={{ min: 0, max: 100, now: percent }}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.saved}>Your activity is saved automatically</Text>
        </View>
      </View>

      <View style={[styles.goals, fontScale >= 1.4 && styles.goalsStacked]}>
        <Goal kind="training" label="Workouts" current={props.workouts} target={props.workoutTarget} onPress={props.onWorkout} compact={compact} stacked={fontScale >= 1.4} />
        {props.mealTarget > 0 ? <Goal kind="nutrition" label="Meal logs" current={props.meals} target={props.mealTarget} onPress={props.onMeal} compact={compact} stacked={fontScale >= 1.4} /> : null}
      </View>
      <TouchableOpacity style={styles.rankings} onPress={props.onRankings} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="View rankings">
        <View style={styles.rankingsArtwork}><TrophyIllustration size={32} /></View>
        <Text style={styles.rankingsText}>View rankings</Text>
        <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}><Path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke={colors.onPrimary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </TouchableOpacity>
    </ScrollView>
  </View>;
}

function Goal({ kind, label, current, target, onPress, compact, stacked }: {
  kind: 'training' | 'nutrition'; label: string; current: number; target: number; onPress: () => void; compact: boolean; stacked: boolean;
}) {
  const remaining = Math.max(0, target - current);
  const complete = remaining === 0;
  const fraction = target > 0 ? Math.max(0, Math.min(1, current / target)) : 1;
  return <TouchableOpacity style={[styles.goal, compact && styles.goalCompact, stacked && styles.goalStacked]} onPress={onPress} disabled={complete} activeOpacity={0.8}
    accessibilityRole={complete ? undefined : 'button'} accessibilityLabel={`${label}. ${current} of ${target}. ${complete ? 'Goal complete' : `${remaining} to go`}`}>
    <View style={[styles.goalBody, compact && styles.goalBodyCompact]}>
      <View style={styles.goalTop}>
        <View style={styles.goalIdentity}>
          <Text style={styles.goalTitle}>{label}</Text>
          <Text style={styles.goalCount}>{current}<Text style={styles.goalMax}> / {target}</Text></Text>
        </View>
        <StableImage source={WEEKLY_GOAL_ARTWORK[kind]} resizeMode="contain" accessible={false}
          testID={`weekly-goal-artwork-${kind}`} style={[styles.goalArtwork, compact && styles.goalArtworkCompact]} />
      </View>
      <View style={styles.goalTrack}><View style={[styles.fill, { width: `${fraction * 100}%` }]} /></View>
      <Text style={[styles.goalDetail, complete && styles.complete]}>{complete ? 'Goal complete' : `${remaining} to go`}</Text>
    </View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  hero: { flexGrow: 1, flexShrink: 0, minHeight: 250, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, justifyContent: 'space-between', gap: 12, overflow: 'hidden' },
  heroCompact: { minHeight: 200, padding: 14, gap: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  eyebrow: { ...reportTypography.label, fontSize: 9, lineHeight: 14, letterSpacing: 0.8, color: colors.gold },
  status: { ...reportTypography.label, fontSize: 10, lineHeight: 15, color: colors.inkMuted },
  story: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  storyCompact: { gap: 6, paddingVertical: 0 },
  artworkShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,6,10,0.72)' },
  title: { ...reportTypography.heading, fontSize: 25, lineHeight: 32, textAlign: 'center', color: colors.ink, maxWidth: 300 },
  titleCompact: { fontSize: 21, lineHeight: 27 },
  description: { ...reportTypography.body, fontSize: 12, lineHeight: 18, textAlign: 'center', color: colors.inkMuted, maxWidth: 300 },
  heroFooter: { gap: 7 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.gold, borderRadius: 2 },
  saved: { ...reportTypography.label, fontSize: 10, lineHeight: 15, textAlign: 'center', color: colors.inkMuted },
  goals: { flexDirection: 'row', gap: 10 },
  goalsStacked: { flexDirection: 'column' },
  goal: { flexGrow: 1, flexBasis: 0, minWidth: 0, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  goalCompact: { borderRadius: 14 },
  goalStacked: { flexGrow: 0, flexBasis: 'auto' },
  goalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  goalIdentity: { flex: 1, minWidth: 0, gap: 4 },
  goalArtwork: { width: 64, height: 64, flexShrink: 0 },
  goalArtworkCompact: { width: 48, height: 48 },
  goalBody: { padding: 14, gap: 9 },
  goalBodyCompact: { padding: 10, gap: 6 },
  goalTrack: { height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  goalCount: { ...typography.title, fontSize: 26, lineHeight: 32, fontVariant: ['tabular-nums'], color: colors.ink },
  goalMax: { fontSize: 11, fontWeight: '500', color: colors.inkSubtle },
  goalTitle: { ...typography.label, color: colors.ink },
  goalDetail: { ...reportTypography.body, fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  complete: { color: colors.gold },
  rankings: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.gold },
  rankingsText: { ...reportTypography.bodyStrong, flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.onPrimary },
  rankingsArtwork: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
});
