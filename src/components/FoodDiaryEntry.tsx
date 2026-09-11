import { StableImage } from './StableImage';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { DietDiaryEntry } from '../store/dietDiaryStore';
import { colors } from '../theme/colors';
import { reportTypography } from '../theme/reportTypography';
import { ReportIllustration } from './ReportIllustration';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';

const mealArt: Record<string, ReportIllustrationKind> = { Breakfast: 'mealBreakfast', Lunch: 'mealLunch', Evening: 'mealEvening', Dinner: 'mealDinner' };
export function FoodDiaryEntry({ entry, source, time, onOpen, onEdit }: {
  entry: DietDiaryEntry; source?: ImageSourcePropType; time: string; onOpen: () => void; onEdit: () => void;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const isPhoto = entry.kind !== 'text' && Boolean(entry.uri);
  return <View style={styles.card} testID="food-diary-entry">
    <View style={styles.header}>
      <TouchableOpacity onPress={onOpen} activeOpacity={0.82} style={styles.identity} accessible={false}>
        <View style={styles.art}>
          {isPhoto && source && failedSource !== entry.uri ? <StableImage source={source} style={styles.photo} resizeMode="cover" onError={() => setFailedSource(entry.uri)} accessible={false} />
            : <ReportIllustration kind={isPhoto ? 'diaryCapture' : mealArt[entry.mealType] || 'diaryCapture'} size={44} reportKey={entry.createdAt} />}
        </View>
        <View style={styles.meta}>
          <Text style={styles.meal}>{entry.mealType}</Text>
          <Text style={styles.time}>{time}{isPhoto ? ' · Photo' : ''}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.edit} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${entry.mealType} entry`}>
        <Feather name="edit-2" size={16} color={colors.inkMuted} accessible={false} />
      </TouchableOpacity>
    </View>
    <TouchableOpacity style={styles.noteAction} onPress={onOpen} activeOpacity={0.82} accessibilityRole="button"
      accessibilityLabel={`Open ${entry.mealType} entry, ${time}. ${entry.note || 'Food photo'}`}>
      <Text style={styles.note}>{entry.note || 'View food photo'}</Text>
    </TouchableOpacity>
    {entry.syncError ? <View style={styles.offline}><Feather name="cloud-off" size={12} color={colors.accent} accessible={false} /><Text style={styles.offlineText}>Saved on this device · sync pending</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 48, height: 48, borderRadius: 14 },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  meal: { ...reportTypography.bodyStrong, fontSize: 14, lineHeight: 21, color: colors.ink },
  time: { ...reportTypography.body, fontSize: 11, lineHeight: 18, color: colors.inkSubtle },
  edit: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  noteAction: { paddingTop: 12, minHeight: 44 },
  note: { ...reportTypography.body, fontSize: 14, lineHeight: 23, color: colors.ink },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  offlineText: { ...reportTypography.body, flex: 1, fontSize: 10, lineHeight: 16, color: colors.inkMuted },
});
