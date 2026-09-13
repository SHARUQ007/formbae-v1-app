import { memo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WorkoutHistoryEntry } from '../types/api';
import { historyExercisePreview, historyMuscleGroups, historyWorkoutSummary, historyWorkoutTitle } from '../utils/workoutHistory';
import { workoutHistoryVisuals } from '../utils/workoutHistoryVisuals';
import { StableImage } from './StableImage';
import { HistoryArrow, HistoryMotif, WorkoutHistoryArtwork } from './WorkoutHistoryArtwork';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

export function WorkoutHistoryHeader({ title, subtitle, onBack, backLabel }: { title: string; subtitle?: string; onBack: () => void; backLabel: string }) {
  return <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel={backLabel}>
      <HistoryArrow direction="left" />
    </TouchableOpacity>
    <View style={styles.flex}>
      <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.caption}>{subtitle}</Text> : null}
    </View>
  </View>;
}

export function WorkoutHistoryCover({ session, hero = false }: { session: WorkoutHistoryEntry; hero?: boolean }) {
  const visual = workoutHistoryVisuals(session);
  const [failedArtwork, setFailedArtwork] = useState<string>();
  return <View style={hero ? styles.heroFrame : styles.thumbnail}>
    {visual && failedArtwork !== visual.artworkId
      ? <StableImage source={visual.artwork} resizeMode="cover" style={styles.image} accessible={false} testID="history-workout-artwork" onError={() => setFailedArtwork(visual.artworkId)} />
      : <WorkoutHistoryArtwork width={hero ? 160 : 86} height={hero ? 160 : 86} />}
  </View>;
}

export const WorkoutHistorySessionCard = memo(function SessionCard({ session, onOpen }: { session: WorkoutHistoryEntry; onOpen: (session: WorkoutHistoryEntry) => void }) {
  const title = historyWorkoutTitle(session);
  const muscles = historyMuscleGroups(session);
  const preview = historyExercisePreview(session);
  return <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onOpen(session)} accessibilityRole="button" accessibilityLabel={`View ${title}, ${session.date}`} accessibilityHint="Opens this workout’s exercises and saved sets">
    <View style={styles.identity}>
      <WorkoutHistoryCover session={session} />
      <View style={styles.identityCopy}>
        <Text style={styles.eyebrow}>{session.workoutMode === 'quick' ? 'QUICK SESSION' : 'WORKOUT COMPLETE'}</Text>
        <Text style={styles.title} numberOfLines={3}>{title}</Text>
      </View>
    </View>
    {muscles.length || preview ? <View style={styles.details}>
      {muscles.length ? <View style={styles.muscleRow}>
        <HistoryMotif kind="muscles" size={24} />
        <Text style={styles.muscles} numberOfLines={2}>{muscles.join(' · ')}</Text>
      </View> : null}
      {preview ? <Text style={styles.preview} numberOfLines={2}>{preview}</Text> : null}
    </View> : null}
    <View style={styles.footer}>
      <Text style={styles.summary}>{session.exercises?.length ? historyWorkoutSummary(session) : 'Session recorded'}</Text>
      <View style={styles.action}><Text style={styles.actionText}>View session</Text><HistoryArrow size={16} color={colors.gold} /></View>
    </View>
  </TouchableOpacity>;
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, minHeight: 44 },
  back: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.title, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  flex: { flex: 1, minWidth: 0 },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, overflow: 'hidden' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  thumbnail: { width: 88, height: 100, flexShrink: 0, borderRadius: radius.md, backgroundColor: colors.panelMuted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  heroFrame: { width: '100%', aspectRatio: 1.9, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  identityCopy: { flex: 1, minWidth: 0, gap: 7 }, eyebrow: { ...typography.overline, color: colors.goldMuted, fontSize: 9, letterSpacing: 1.1 },
  title: { ...typography.subtitle, color: colors.ink, fontSize: 18, lineHeight: 24 },
  details: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 }, muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, muscles: { ...typography.caption, color: colors.gold, flex: 1 },
  preview: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  summary: { ...typography.caption, fontSize: 11, color: colors.inkMuted, flexGrow: 1, flexShrink: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 }, actionText: { ...typography.caption, fontSize: 11, color: colors.gold },
});
