import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/States';
import {
  addDietDiaryEntry,
  deleteDietDiaryEntry,
  loadDietDiaryEntries,
  mergeRemoteDietDiaryEntries,
  updateDietDiaryEntry,
  type DietDiaryEntry,
  type MealType,
} from '../../store/dietDiaryStore';
import { deleteRemoteDietDiaryEntry, fetchDietDiary, resolveDietDiaryImageUrl, uploadDietDiaryEntry } from '../../services/dietDiaryService';
import { getAuthToken } from '../../services/apiClient';
import { displayBehavioralNotification } from '../../services/notificationService';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const meals: Array<{ type: MealType; icon: string; hint: string }> = [
  { type: 'Breakfast', icon: 'sunrise', hint: 'Start strong' },
  { type: 'Lunch', icon: 'sun', hint: 'Midday fuel' },
  { type: 'Dinner', icon: 'moon', hint: 'End balanced' },
  { type: 'Snack', icon: 'coffee', hint: 'Small bites' },
];

function formatEntryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function imageSource(entry: DietDiaryEntry) {
  const uri = resolveDietDiaryImageUrl(entry.remoteImageUrl || entry.uri);
  const token = getAuthToken();
  if (uri.startsWith('http') && token) {
    return { uri, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri };
}

export function DietScreen() {
  const [entries, setEntries] = useState<DietDiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Lunch');
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);

  const load = useCallback(async () => {
    const local = await loadDietDiaryEntries();
    setEntries(local);
    try {
      const remote = await fetchDietDiary();
      setEntries(await mergeRemoteDietDiaryEntries(remote.entries));
    } catch {
      // Offline/local-only mode is still useful for the diary.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return entries.filter((entry) => new Date(entry.createdAt).toDateString() === today).length;
  }, [entries]);

  const saveAsset = async (asset?: Asset) => {
    if (!asset?.uri) return;
    setSaving(true);
    try {
      const localEntry = await addDietDiaryEntry(asset, selectedMeal);
      await load();
      displayBehavioralNotification('dietPhotoLogged', { mealType: selectedMeal }).catch(() => undefined);
      try {
        const uploaded = await uploadDietDiaryEntry({
          clientId: localEntry.id,
          mealType: localEntry.mealType,
          note: localEntry.note,
          createdAt: localEntry.createdAt,
          asset,
        });
        await updateDietDiaryEntry(localEntry.id, {
          remoteId: uploaded.entry.entryId,
          remoteImageUrl: uploaded.entry.imageUrl,
          syncedAt: new Date().toISOString(),
          syncError: undefined,
        });
        await load();
      } catch (uploadError) {
        await updateDietDiaryEntry(localEntry.id, {
          syncError: uploadError instanceof Error ? uploadError.message : 'Could not sync photo yet.',
        });
        await load();
      }
    } catch (e) {
      Alert.alert('Could not save photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addFromCamera = async () => {
    const result = await launchCamera({
      mediaType: 'photo',
      cameraType: 'back',
      quality: 0.8,
      includeBase64: true,
      saveToPhotos: false,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('Camera unavailable', result.errorMessage);
      return;
    }
    await saveAsset(result.assets?.[0]);
  };

  const addFromLibrary = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      includeBase64: true,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('Photo library unavailable', result.errorMessage);
      return;
    }
    await saveAsset(result.assets?.[0]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (entry: DietDiaryEntry) => {
    Alert.alert('Delete food photo?', 'This removes the photo from your diet diary on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (entry.remoteId) {
            await deleteRemoteDietDiaryEntry(entry.remoteId).catch(() => undefined);
          }
          await deleteDietDiaryEntry(entry.id);
          setPreview(null);
          await load();
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>Diet</ScreenTitle>

        <Card variant="accent">
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Feather name="camera" size={24} color={colors.accent} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Diet diary</Text>
              <Text style={styles.heroCopy}>Capture every meal photo and keep it accessible from this Diet tab.</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <Badge label={`${todayCount} today`} tone="accent" icon="calendar" />
            <Badge label={`${entries.length} total`} tone="neutral" icon="image" />
          </View>
        </Card>

        <SectionTitle>Meal type</SectionTitle>
        <View style={styles.mealGrid}>
          {meals.map((meal) => {
            const selected = selectedMeal === meal.type;
            return (
              <TouchableOpacity
                key={meal.type}
                activeOpacity={0.85}
                onPress={() => setSelectedMeal(meal.type)}
                style={[styles.mealCard, selected && styles.mealCardSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select ${meal.type}`}
              >
                <Feather name={meal.icon} size={20} color={selected ? colors.white : colors.accent} />
                <Text style={[styles.mealTitle, selected && styles.mealTitleSelected]}>{meal.type}</Text>
                <Text style={[styles.mealHint, selected && styles.mealHintSelected]}>{meal.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Take food photo" icon="camera" onPress={addFromCamera} loading={saving} />
          <PrimaryButton title="Import from gallery" icon="image" variant="secondary" onPress={addFromLibrary} disabled={saving} />
        </View>

        <SectionTitle>Diet diary</SectionTitle>
        {entries.length === 0 ? (
          <EmptyState
            icon="camera"
            title="No food photos yet"
            message="Take a photo of your next meal and it will appear here."
            actionLabel="Add first photo"
            onAction={addFromCamera}
          />
        ) : (
          <View style={styles.grid}>
            {entries.map((entry) => (
              <TouchableOpacity key={entry.id} activeOpacity={0.85} style={styles.photoCard} onPress={() => setPreview(entry)}>
                <Image source={imageSource(entry)} style={styles.photo} resizeMode="cover" />
                <View style={styles.photoMeta}>
                  <View style={styles.photoMealRow}>
                    <Text style={styles.photoMeal}>{entry.mealType}</Text>
                    {entry.syncError ? <Feather name="cloud-off" size={13} color={colors.warn} /> : null}
                  </View>
                  <Text style={styles.photoTime}>{formatEntryTime(entry.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {preview ? <Image source={imageSource(preview)} style={styles.previewImage} resizeMode="cover" /> : null}
            {preview ? (
              <View style={styles.previewBody}>
                <View>
                  <Text style={styles.previewTitle}>{preview.mealType}</Text>
                  <Text style={styles.previewTime}>{formatEntryTime(preview.createdAt)}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(preview)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete diary photo">
                  <Feather name="trash-2" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
            <PrimaryButton title="Close" variant="secondary" onPress={() => setPreview(null)} style={styles.closePreview} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroIcon: { width: 54, height: 54, borderRadius: radius.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  heroTitle: { ...typography.title, color: colors.accentDarker },
  heroCopy: { ...typography.body, color: colors.accentDarker, marginTop: 2 },
  heroStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  mealCardSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  mealTitle: { ...typography.bodyBold, color: colors.ink, marginTop: spacing.sm },
  mealTitleSelected: { color: colors.white },
  mealHint: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  mealHintSelected: { color: colors.onAccentMuted },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: '100%', aspectRatio: 1 },
  photoMeta: { padding: spacing.sm },
  photoMealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  photoMeal: { ...typography.bodyBold, color: colors.ink },
  photoTime: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.panel, borderRadius: radius.xl, overflow: 'hidden' },
  previewImage: { width: '100%', aspectRatio: 1 },
  previewBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  previewTitle: { ...typography.title, color: colors.ink },
  previewTime: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  deleteButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.errorLight, alignItems: 'center', justifyContent: 'center' },
  closePreview: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
});
