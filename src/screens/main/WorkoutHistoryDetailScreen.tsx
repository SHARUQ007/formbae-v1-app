import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ScreenContainer } from '../../components/Card';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { WorkoutHistoryCover, WorkoutHistoryHeader } from '../../components/WorkoutHistorySessionCard';
import { HistoryMotif, WorkoutHistoryArtwork } from '../../components/WorkoutHistoryArtwork';
import { WorkoutSessionArtwork } from '../../components/WorkoutSessionArtwork';
import { useProfileBodyGender } from '../../hooks/useProfileBodyGender';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutHistoryExercise } from '../../types/api';
import { historyBodyMuscles, historyMuscleGroups, historyWorkoutTitle, historyWorkoutSummary, historyHasPerformance } from '../../utils/workoutHistory';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

function loggedSetDescription(set: WorkoutHistoryExercise['sets'][number]) {
  return [set.reps ? `${set.reps} reps` : '', set.weight ? `${set.weight} kg` : '', set.durationSec ? `${set.durationSec} sec` : '', set.rpe ? `RPE ${set.rpe}` : ''].filter(Boolean).join(' · ') || 'Set recorded';
}

function ExerciseRecord({ exercise, index, planOnly }: { exercise: WorkoutHistoryExercise; index: number; planOnly: boolean }) {
  return <View style={styles.exerciseSection}>
    <View style={styles.exerciseIdentity}>
      <View style={styles.number}><Text style={styles.numberText}>{String(index + 1).padStart(2, '0')}</Text></View>
      <View style={styles.flex}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {exercise.muscleGroups?.length ? <Text style={styles.exerciseMuscles}>{exercise.muscleGroups.join(' · ')}</Text> : null}
      </View>
      {exercise.completed ? <View accessible accessibilityLabel="Exercise completed"><HistoryMotif kind="record" size={30} /></View> : null}
    </View>
    {exercise.plannedSets || exercise.plannedReps ? <Text style={styles.prescription}>Planned: {[exercise.plannedSets ? `${exercise.plannedSets} sets` : '', exercise.plannedReps].filter(Boolean).join(' × ')}</Text> : null}
    {exercise.sets?.length ? <View style={styles.sets}>
      <View style={styles.setHeading}><WorkoutSessionArtwork kind="logged" size={26} /><Text style={styles.setsLabel}>LOGGED SETS</Text></View>
      {exercise.sets.map((set, setIndex) => <View key={`${set.setNumber}-${setIndex}`} style={[styles.setRow, setIndex > 0 && styles.setDivider]}>
        <Text style={styles.setNumber}>Set {set.setNumber || setIndex + 1}</Text><Text style={styles.setValues}>{loggedSetDescription(set)}</Text>
      </View>)}
    </View> : !planOnly ? <Text style={styles.caption}>No set details recorded.</Text> : null}
  </View>;
}

export function WorkoutHistoryDetailScreen({ route, navigation }: NativeStackScreenProps<WorkoutStackParamList, 'WorkoutHistoryDetail'>) {
  const { session } = route.params;
  const tabHeight = useBottomTabBarHeight();
  const gender = useProfileBodyGender();
  const exercises = session.exercises ?? [];
  const muscles = historyMuscleGroups(session);
  const bodyMuscles = historyBodyMuscles(session);
  const planReference = session.detailsSource === 'plan';
  const hasPerformance = historyHasPerformance(session);
  const planOnly = exercises.length > 0 && !hasPerformance;
  const referenceNote = planReference
    ? hasPerformance ? 'Plan reference · Your recorded activity is shown below.' : 'Plan reference · Exact performance wasn’t saved for this session.'
    : 'Saved session plan · Individual exercise performance wasn’t recorded.';
  const setCount = exercises.reduce((count, exercise) => count + (exercise.sets?.length ?? 0), 0);
  const date = new Date(`${session.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return <ScreenContainer>
    <WorkoutHistoryHeader title="Workout summary" subtitle={date} onBack={() => navigation.goBack()} backLabel="Back to workout history" />
    <FlatList data={exercises} keyExtractor={(exercise, index) => `${exercise.exerciseId}-${index}`} showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: tabHeight + 20 }]}
      ListHeaderComponent={<View style={styles.content}>
        <View style={styles.hero}>
          <WorkoutHistoryCover session={session} hero />
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{session.workoutMode === 'quick' ? 'QUICK SESSION' : 'WORKOUT COMPLETE'}</Text>
            <Text style={styles.title}>{historyWorkoutTitle(session)}</Text>
            <Text style={styles.caption}>{exercises.length ? historyWorkoutSummary(session) : 'Session recorded'}</Text>
          </View>
          {exercises.length ? <View style={styles.metrics}>
            <View style={styles.metric}><WorkoutSessionArtwork kind="begin" size={36} /><Text style={styles.metricNumber}>{exercises.length}</Text><Text style={styles.metricLabel}>{planReference || planOnly ? 'In the plan' : 'Exercises'}</Text></View>
            <View style={[styles.metric, styles.metricBorder]}><WorkoutSessionArtwork kind="logged" size={36} /><Text style={styles.metricNumber}>{setCount || '—'}</Text><Text style={styles.metricLabel}>Logged sets</Text></View>
            <View style={[styles.metric, styles.metricBorder]}><HistoryMotif kind="muscles" size={36} /><Text style={styles.metricNumber}>{muscles.length || '—'}</Text><Text style={styles.metricLabel}>Muscle groups</Text></View>
          </View> : null}
        </View>
        {planReference || planOnly ? <View style={styles.reference}><WorkoutSessionArtwork kind="form" size={32} /><Text style={styles.referenceText}>{referenceNote}</Text></View> : null}
        {muscles.length ? <View style={styles.card}>
          <View style={styles.sectionHeading}><HistoryMotif kind="muscles" size={34} /><View style={styles.flex}><Text style={styles.heading}>Muscle groups</Text><Text style={styles.caption}>Target areas for this workout</Text></View></View>
          {bodyMuscles.length ? <View accessible accessibilityLabel={`Target muscles: ${muscles.join(', ')}`}><WeeklyBodyMap muscles={bodyMuscles} gender={gender} compact showLabels={false} /></View> : null}
          <View style={styles.muscles}>{muscles.map(muscle => <View style={styles.muscle} key={muscle}><View style={styles.muscleDot} /><Text style={styles.muscleText}>{muscle}</Text></View>)}</View>
        </View> : null}
        {exercises.length ? <View style={styles.sectionHeading}><WorkoutSessionArtwork kind="form" size={40} /><View style={styles.flex}><Text style={styles.heading}>{planReference || planOnly ? 'Session plan' : 'Exercises'}</Text><Text style={styles.caption}>{exercises.length} {exercises.length === 1 ? 'movement' : 'movements'} · In workout order</Text></View></View> : null}
      </View>}
      ListEmptyComponent={<View style={styles.empty}><WorkoutHistoryArtwork width={100} height={100} /><Text style={styles.heading}>Your session is recorded</Text><Text style={styles.emptyCaption}>Exercise details weren’t saved for this workout.</Text></View>}
      renderItem={({ item: exercise, index }) => <ExerciseRecord exercise={exercise} index={index} planOnly={planReference || planOnly} />}
    />
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  content: { gap: 16 }, flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  heroCopy: { padding: 18, gap: 7 }, eyebrow: { ...typography.overline, color: colors.goldMuted, fontSize: 9 },
  title: { ...typography.hero, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, paddingVertical: 14 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 6, gap: 3 }, metricBorder: { borderLeftWidth: 1, borderColor: colors.border },
  metricNumber: { ...typography.title, color: colors.ink, fontVariant: ['tabular-nums'] }, metricLabel: { ...typography.caption, fontSize: 10, textAlign: 'center', color: colors.inkMuted },
  card: { borderRadius: radius.xl, padding: 16, gap: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, heading: { ...typography.subtitle, color: colors.ink, fontSize: 18, marginBottom: 2 },
  reference: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panelMuted, borderRadius: radius.md, padding: 12 }, referenceText: { ...typography.caption, fontSize: 11, color: colors.inkMuted, lineHeight: 17, flex: 1 },
  muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, muscle: { backgroundColor: colors.panelRaised, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }, muscleDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold }, muscleText: { ...typography.caption, fontSize: 11, color: colors.ink },
  exerciseSection: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 16, gap: 12 },
  exerciseIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { width: 34, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderBottomWidth: 2, borderColor: colors.goldMuted }, numberText: { ...typography.label, color: colors.gold, fontVariant: ['tabular-nums'] },
  exerciseName: { ...typography.bodyBold, fontSize: 16, color: colors.ink }, exerciseMuscles: { ...typography.caption, fontSize: 11, color: colors.inkMuted, marginTop: 3 },
  prescription: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  sets: { backgroundColor: colors.panelMuted, borderRadius: radius.md, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }, setHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }, setsLabel: { ...typography.overline, fontSize: 9, color: colors.goldMuted },
  setRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 10 }, setDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, setNumber: { ...typography.caption, fontSize: 11, color: colors.inkMuted }, setValues: { ...typography.label, color: colors.ink, textAlign: 'right', flex: 1, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', borderRadius: radius.xl, padding: 20, gap: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }, emptyCaption: { ...typography.caption, textAlign: 'center', color: colors.inkMuted },
});
