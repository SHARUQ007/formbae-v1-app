import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ScreenContainer } from '../../components/Card';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';
import { useProfileBodyGender } from '../../hooks/useProfileBodyGender';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutHistoryExercise } from '../../types/api';
import { historyBodyMuscles, historyMuscleGroups, historyWorkoutTitle, historyWorkoutSummary, historyHasPerformance } from '../../utils/workoutHistory';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

function loggedSetDescription(set: WorkoutHistoryExercise['sets'][number]) {
  return [set.reps ? `${set.reps} reps` : '', set.weight ? `${set.weight} kg` : '', set.durationSec ? `${set.durationSec} sec` : '', set.rpe ? `RPE ${set.rpe}` : ''].filter(Boolean).join(' · ') || 'Set recorded';
}

export function WorkoutHistoryDetailScreen({ route, navigation }: NativeStackScreenProps<WorkoutStackParamList, 'WorkoutHistoryDetail'>) {
  const { session } = route.params;
  const tabHeight = useBottomTabBarHeight();
  const gender = useProfileBodyGender();
  const exercises = session.exercises ?? [];
  const muscles = historyMuscleGroups(session);
  const bodyMuscles = historyBodyMuscles(session);
  const planReference = session.detailsSource === 'plan';
  const planOnly = exercises.length > 0 && !historyHasPerformance(session);
  const date = new Date(`${session.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <ScreenContainer>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to workout history"><Text style={styles.backText}>Back</Text></TouchableOpacity>
      <Text style={styles.screenTitle}>Workout summary</Text>
    </View>
    <FlatList data={exercises} keyExtractor={(exercise, index) => `${exercise.exerciseId}-${index}`} showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: tabHeight + 20 }]}
      ListHeaderComponent={<View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.date}>{date}</Text>
          <View style={styles.heroHeading}><View style={styles.flex}><Text style={styles.eyebrow}>{session.workoutMode === 'quick' ? 'QUICK SESSION' : 'COMPLETED SESSION'}</Text><Text style={styles.title}>{historyWorkoutTitle(session)}</Text></View></View>
          <Text style={styles.caption}>{historyWorkoutSummary(session)}</Text>
        </View>
        {planReference || planOnly ? <View style={styles.reference}><Text style={styles.referenceText}>{planReference ? 'Plan reference · Exact performance wasn’t saved for this session.' : 'Saved session plan · Individual exercise performance wasn’t recorded.'}</Text></View> : null}
        {muscles.length ? <View style={styles.card}>
          <View style={styles.row}><Text style={styles.heading}>Muscle groups</Text></View>
          <View style={styles.muscles}>{muscles.map(muscle => <View style={styles.muscle} key={muscle}><Text style={styles.muscleText}>{muscle}</Text></View>)}</View>
          {bodyMuscles.length ? <View accessible accessibilityLabel={`Target muscles: ${muscles.join(', ')}`}><WeeklyBodyMap muscles={bodyMuscles} gender={gender} compact showLabels={false} /></View> : null}
        </View> : null}
        <View style={styles.exerciseHeading}><Text style={styles.heading}>{planReference || planOnly ? 'Session plan' : 'Exercises'}</Text>{exercises.length ? <Text style={styles.caption}>{exercises.length} movements</Text> : null}</View>
      </View>}
      ListEmptyComponent={<View style={styles.card}><Text style={styles.heading}>Your session is recorded</Text><Text style={styles.caption}>Exercise details weren’t saved for this workout.</Text></View>}
      renderItem={({ item: exercise, index }) => <View style={styles.exerciseSection}>
        <View style={styles.exerciseIdentity}><View style={styles.number}><Text style={styles.numberText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={styles.flex}><Text style={styles.exerciseName}>{exercise.name}</Text>{exercise.muscleGroups?.length ? <Text style={styles.exerciseMuscles}>{exercise.muscleGroups.join(' · ')}</Text> : null}</View>{exercise.completed ? <Text style={styles.done}>Done</Text> : null}</View>
        {exercise.plannedSets || exercise.plannedReps ? <Text style={styles.prescription}>Planned: {[exercise.plannedSets ? `${exercise.plannedSets} sets` : '', exercise.plannedReps].filter(Boolean).join(' × ')}</Text> : null}
        {exercise.sets?.length ? <View style={styles.sets}><Text style={styles.setsLabel}>LOGGED SETS</Text>{exercise.sets.map((set, setIndex) => <View key={`${set.setNumber}-${setIndex}`} style={styles.setRow}><Text style={styles.setNumber}>Set {set.setNumber || setIndex + 1}</Text><Text style={styles.setValues}>{loggedSetDescription(set)}</Text></View>)}</View> : !planReference && !planOnly ? <Text style={styles.caption}>No set details recorded.</Text> : null}
      </View>}
    />
  </ScreenContainer>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' }, backText: { ...typography.caption, color: colors.inkMuted },
  screenTitle: { ...typography.title, color: colors.ink, flexShrink: 1 },
  content: { gap: 14 }, flex: { flex: 1, minWidth: 0 },
  hero: { paddingVertical: 8, gap: 12 }, heroHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  date: { ...typography.caption, color: colors.inkMuted }, eyebrow: { ...typography.overline, color: colors.gold, fontSize: 9, marginBottom: 7 },
  title: { ...typography.title, fontSize: 32, lineHeight: 39, letterSpacing: -0.8, color: colors.ink },
  caption: { ...typography.caption, color: colors.inkMuted, lineHeight: 20 },
  card: { borderRadius: 12, padding: 16, backgroundColor: colors.panel, gap: 12 },
  exerciseSection: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 18, gap: 12 },
  done: { ...typography.caption, fontSize: 10, color: colors.inkSubtle },
  heading: { ...typography.bodyBold, fontSize: 17, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reference: { flexDirection: 'row', gap: 10, borderLeftWidth: 2, borderColor: colors.goldMuted, padding: 12, backgroundColor: colors.panel },
  referenceText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
  muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, muscle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muscleText: { ...typography.caption, fontSize: 12, color: colors.ink },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
  exerciseIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, number: { width: 26, alignItems: 'flex-start', justifyContent: 'center' },
  numberText: { ...typography.label, fontSize: 12, color: colors.inkSubtle, fontVariant: ['tabular-nums'] }, exerciseName: { ...typography.bodyBold, fontSize: 15, lineHeight: 22, color: colors.ink },
  exerciseMuscles: { ...typography.caption, fontSize: 11, color: colors.inkMuted, lineHeight: 17, marginTop: 3 },
  prescription: { ...typography.caption, color: colors.inkSubtle, fontSize: 12 }, sets: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 12 },
  setsLabel: { ...typography.overline, fontSize: 9, color: colors.inkMuted, marginBottom: 4 }, setRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 5 },
  setNumber: { ...typography.caption, color: colors.inkSubtle, fontSize: 12 }, setValues: { ...typography.bodyBold, fontSize: 13, lineHeight: 19, color: colors.ink, flex: 1, textAlign: 'right' },
});
