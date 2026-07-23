import { useMemo, useState } from 'react';
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
  const videoItems = useMemo(
    () => videos.length ? videos : [{ id: videoUrl, title, subtitle, videoUrl }],
    [subtitle, title, videoUrl, videos],
  );
  const [activeIndex, setActiveIndex] = useState(Math.max(0, Math.min(videoItems.length - 1, initialIndex)));
  const activeVideo = videoItems[activeIndex] || videoItems[0];
  const canTryAnother = videoItems.length > 1;

  const tryAnother = () => {
    if (!canTryAnother) return;
    setActiveIndex((value) => (value + 1) % videoItems.length);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Technique video</Text>
          <Text style={styles.title} numberOfLines={2}>{activeVideo.title}</Text>
          {activeVideo.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{activeVideo.subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.videoStage}>
        <ExerciseVideo key={`${activeVideo.id}_${activeIndex}`} url={activeVideo.videoUrl} style={styles.videoFrame} />
      </View>

      <View style={styles.videoMetaCard}>
        <View>
          <Text style={styles.videoCount}>Video {activeIndex + 1} of {videoItems.length}</Text>
          <Text style={styles.videoMetaTitle} numberOfLines={1}>{activeVideo.title}</Text>
        </View>
        <TouchableOpacity
          onPress={tryAnother}
          disabled={!canTryAnother}
          style={[styles.tryButton, !canTryAnother && styles.tryButtonDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canTryAnother }}
        >
          <Feather name="shuffle" size={17} color={canTryAnother ? colors.accentDark : colors.inkSubtle} />
          <Text style={[styles.tryText, !canTryAnother && styles.tryTextDisabled]}>Try another</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.doneButton} accessibilityRole="button">
          <Feather name="check" size={19} color={colors.white} />
          <Text style={styles.doneText}>Back to workout</Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  videoStage: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    justifyContent: 'center',
  },
  videoFrame: {
    width: '100%',
    maxHeight: '100%',
    borderRadius: 28,
  },
  videoMetaCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  videoCount: { ...typography.caption, color: colors.inkMuted, marginBottom: 3 },
  videoMetaTitle: { ...typography.bodyBold, color: colors.ink },
  tryButton: {
    minHeight: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tryButtonDisabled: {
    backgroundColor: colors.panelMuted,
    borderColor: colors.border,
  },
  tryText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  tryTextDisabled: { color: colors.inkSubtle },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  doneButton: {
    minHeight: 54,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  doneText: { ...typography.button, color: colors.white },
});
