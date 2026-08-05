import { useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { ExerciseVideo } from '../../components/ExerciseVideo';
import type { WorkoutStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutVideo'>;

export function WorkoutVideoScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { title, subtitle, videoUrl, videos = [], initialIndex = 0 } = route.params;
  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
  }, [navigation]);

  const videoItems = useMemo(
    () => videos.length ? videos : [{ id: videoUrl, title, subtitle, videoUrl }],
    [subtitle, title, videoUrl, videos],
  );
  const [activeIndex, setActiveIndex] = useState(Math.max(0, Math.min(videoItems.length - 1, initialIndex)));
  const [reloadKey, setReloadKey] = useState(0);
  const activeVideo = videoItems[activeIndex] || videoItems[0];
  const canTryAnother = videoItems.length > 1;

  const replayVideo = () => {
    setReloadKey((value) => value + 1);
  };

  const tryAnother = () => {
    if (!canTryAnother) return;
    setActiveIndex((value) => (value + 1) % videoItems.length);
    setReloadKey((value) => value + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Technique video</Text>
          <Text style={styles.title} numberOfLines={1}>{activeVideo.title}</Text>
          {activeVideo.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{activeVideo.subtitle}</Text> : null}
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{activeIndex + 1}/{videoItems.length}</Text>
        </View>
      </View>

      <View style={styles.videoStage}>
        <ExerciseVideo
          key={`${activeVideo.id}_${activeIndex}_${reloadKey}`}
          url={activeVideo.videoUrl}
          fill
          style={styles.videoFrame}
        />
      </View>

      <View style={[styles.actionDock, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={replayVideo} style={styles.secondaryButton} accessibilityRole="button">
            <Feather name="rotate-ccw" size={18} color={colors.accentDark} />
            <Text style={styles.secondaryText}>Replay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={tryAnother}
            disabled={!canTryAnother}
            style={[styles.secondaryButton, !canTryAnother && styles.secondaryButtonDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canTryAnother }}
          >
            <Feather name="shuffle" size={18} color={canTryAnother ? colors.accentDark : colors.inkSubtle} />
            <Text style={[styles.secondaryText, !canTryAnother && styles.secondaryTextDisabled]}>Try another</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.startButton} accessibilityRole="button">
          <View style={styles.playBadge}>
            <Feather name="play" size={22} color={colors.accentDark} />
          </View>
          <Text style={styles.startText}>Start workout</Text>
          <Feather name="arrow-right" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  title: { ...typography.subtitle, color: colors.ink, fontWeight: '800' },
  subtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  countPill: {
    minWidth: 52,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: spacing.sm,
  },
  countText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  videoStage: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    justifyContent: 'center',
  },
  videoFrame: {
    width: '100%',
    borderRadius: radius.xl,
  },
  actionDock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.xl,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  secondaryButtonDisabled: {
    backgroundColor: colors.panelMuted,
    borderColor: colors.border,
  },
  secondaryText: { ...typography.button, color: colors.accentDark },
  secondaryTextDisabled: { color: colors.inkSubtle },
  startButton: {
    minHeight: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  playBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  startText: { ...typography.title, color: colors.white, fontWeight: '800' },
});
