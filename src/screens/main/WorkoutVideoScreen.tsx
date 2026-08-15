import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ExerciseVideo } from '../../components/ExerciseVideo';
import { WorkoutPrimaryCTA } from '../../features/workout/components/WorkoutPrimaryCTA';
import { WorkoutScreenHeader } from '../../features/workout/components/WorkoutScreenHeader';
import type { WorkoutStackParamList } from '../../navigation/types';
import { replaceWorkoutVideo } from '../../services/workoutService';
import { hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutVideo'>;
type ReplacementStatus = 'idle' | 'finding' | 'changed' | 'unavailable';

export function WorkoutVideoScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const {
    title,
    subtitle,
    videoUrl,
    planDayId,
    workoutMode,
    exerciseId,
    exerciseName,
    order,
    focus,
  } = route.params;
  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: hiddenTabBarStyle });
  }, [navigation]);

  const [currentVideoUrl, setCurrentVideoUrl] = useState(videoUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [replacementStatus, setReplacementStatus] = useState<ReplacementStatus>('idle');
  const replacing = replacementStatus === 'finding';

  useEffect(() => {
    // React Navigation can reuse this screen instance when another movement is
    // opened. Keep the player state aligned with the latest route instead of
    // leaving the previous movement's video mounted under a new title.
    setCurrentVideoUrl(videoUrl);
    setReloadKey((value) => value + 1);
    setReplacementStatus('idle');
  }, [exerciseName, videoUrl]);

  useEffect(() => {
    if (replacementStatus !== 'changed' && replacementStatus !== 'unavailable') return undefined;
    const timeout = setTimeout(
      () => setReplacementStatus('idle'),
      replacementStatus === 'changed' ? 1400 : 2600,
    );
    return () => clearTimeout(timeout);
  }, [replacementStatus]);

  const replayVideo = () => {
    setReplacementStatus('idle');
    setReloadKey((value) => value + 1);
  };

  const tryAnotherVideo = async () => {
    if (replacing) return;
    setReplacementStatus('finding');
    try {
      const replacement = await replaceWorkoutVideo({
        planDayId,
        workoutMode,
        exerciseId,
        exerciseName,
        order,
        focus,
        previousVideoUrl: currentVideoUrl,
      });
      if (!replacement.videoUrl || replacement.videoUrl === currentVideoUrl) {
        throw new Error('No different video was found');
      }
      setCurrentVideoUrl(replacement.videoUrl);
      setReloadKey((value) => value + 1);
      setReplacementStatus('changed');
    } catch {
      setReplacementStatus('unavailable');
    }
  };

  const replacementLabel = replacementStatus === 'finding'
    ? 'Finding another…'
    : replacementStatus === 'changed'
      ? 'Video changed'
      : replacementStatus === 'unavailable'
        ? 'No other video available'
        : 'Try another video';
  const replacementLocked = replacementStatus !== 'idle';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <WorkoutScreenHeader
          eyebrow="Technique video"
          title={title}
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
          largeText
        />
      </View>

      <View style={styles.videoStage}>
        <View style={styles.videoShell}>
          <ExerciseVideo
            key={`${exerciseId || exerciseName}_${reloadKey}_${currentVideoUrl}`}
            url={currentVideoUrl}
            fill
            style={styles.videoFrame}
          />
        </View>
        <View style={styles.guidanceRow}>
          <Feather name="eye" size={17} color={colors.gold} />
          <Text style={styles.guidanceText}>Watch once, then return to your current set.</Text>
        </View>
      </View>

      <View style={[styles.actionDock, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={replayVideo} style={styles.secondaryButton} accessibilityRole="button">
            <Feather name="rotate-ccw" size={18} color={colors.accentDark} />
            <Text style={styles.secondaryText}>Replay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={tryAnotherVideo}
            disabled={replacementLocked}
            style={[
              styles.secondaryButton,
              styles.tryAnotherButton,
              replacementStatus === 'changed' && styles.statusButtonSuccess,
              replacementStatus === 'unavailable' && styles.statusButtonUnavailable,
            ]}
            accessibilityRole="button"
            accessibilityLabel={replacementLabel}
            accessibilityState={{ disabled: replacementLocked, busy: replacing }}
          >
            {replacing ? (
              <ActivityIndicator size="small" color={colors.inkSubtle} />
            ) : replacementStatus === 'changed' ? (
              <Feather name="check" size={18} color={colors.accentDark} />
            ) : replacementStatus === 'unavailable' ? (
              <Feather name="info" size={18} color={colors.inkMuted} />
            ) : (
              <Feather name="refresh-cw" size={18} color={colors.accentDark} />
            )}
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.secondaryText,
                replacing && styles.secondaryTextDisabled,
                replacementStatus === 'unavailable' && styles.unavailableText,
              ]}
            >
              {replacementLabel}
            </Text>
          </TouchableOpacity>
        </View>
        <WorkoutPrimaryCTA
          title="Return to workout"
          subtitle="Your current set is ready"
          onPress={() => navigation.goBack()}
          style={styles.returnCta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  videoStage: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    justifyContent: 'center',
  },
  videoShell: {
    flex: 1,
    minHeight: 160,
    maxHeight: 620,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  videoFrame: {
    width: '100%',
    borderRadius: 0,
  },
  guidanceRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  guidanceText: {
    ...typography.body,
    color: colors.inkMuted,
    flex: 1,
  },
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    flex: 0.8,
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tryAnotherButton: { flex: 1.2 },
  statusButtonSuccess: { backgroundColor: colors.accentLight, borderColor: colors.accentSurface },
  statusButtonUnavailable: { backgroundColor: colors.panelMuted, borderColor: colors.borderStrong },
  secondaryText: { ...typography.button, color: colors.accentDark },
  secondaryTextDisabled: { color: colors.inkSubtle },
  unavailableText: { color: colors.inkMuted, fontSize: 14 },
  returnCta: { minHeight: 72 },
});
