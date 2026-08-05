import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, ScreenTitle, Card, SectionTitle } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/States';
import {
  addDietDiaryEntry,
  addTextDietDiaryEntry,
  deleteDietDiaryEntry,
  loadDietDiaryEntries,
  mergeRemoteDietDiaryEntries,
  updateDietDiaryEntry,
  type DietDiaryEntry,
  type MealType,
} from '../../store/dietDiaryStore';
import { deleteRemoteDietDiaryEntry, resolveDietDiaryImageUrl, uploadDietDiaryEntry, uploadTextDietDiaryEntry } from '../../services/dietDiaryService';
import { getAuthToken } from '../../services/apiClient';
import { displayBehavioralNotification } from '../../services/notificationService';
import { loadDietDiaryCached } from '../../services/preloadService';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const meals: Array<{ type: MealType; icon: string; label: string; hint: string }> = [
  { type: 'Breakfast', icon: 'sunrise', label: 'Morning', hint: 'After waking' },
  { type: 'Lunch', icon: 'sun', label: 'Afternoon', hint: 'Midday food' },
  { type: 'Dinner', icon: 'sunset', label: 'Evening', hint: 'Later meal' },
  { type: 'Snack', icon: 'moon', label: 'Night', hint: 'Late bites' },
];

type Props = BottomTabScreenProps<MainTabParamList, 'Diet'>;

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

function formatDiaryDate(value: Date) {
  const today = new Date();
  const yesterday = shiftDate(today, -1);
  if (isSameDay(value, today)) return 'Today';
  if (isSameDay(value, yesterday)) return 'Yesterday';
  return value.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

function isSameDay(a: Date | string, b: Date | string) {
  const first = new Date(a);
  const second = new Date(b);
  return first.toDateString() === second.toDateString();
}

function shiftDate(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isFutureDay(value: Date) {
  const today = new Date();
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return normalized.getTime() > today.getTime();
}

function timestampForDiaryDate(value: Date) {
  const now = new Date();
  const next = new Date(value);
  next.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return next.toISOString();
}

function mealLabel(type: MealType) {
  return meals.find((meal) => meal.type === type)?.label || type;
}

function isMemoryEntry(entry: DietDiaryEntry) {
  return entry.kind === 'text' || (!entry.uri && Boolean(entry.note?.trim()));
}

function uniqueMemoryEntries(entries: DietDiaryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!isMemoryEntry(entry)) return false;
    const key = entry.remoteId || `${entry.createdAt}:${entry.mealType}:${entry.note?.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mealIndex(type: MealType) {
  const index = meals.findIndex((meal) => meal.type === type);
  return index >= 0 ? index : 0;
}

function previousMemorySlot(date: Date, mealType: MealType) {
  const index = mealIndex(mealType);
  if (index > 0) {
    return { date, mealType: meals[index - 1].type };
  }
  return { date: shiftDate(date, -1), mealType: meals[meals.length - 1].type };
}

function nextMemorySlot(date: Date, mealType: MealType) {
  const index = mealIndex(mealType);
  if (index < meals.length - 1) {
    return { date, mealType: meals[index + 1].type };
  }
  const dateAfter = shiftDate(date, 1);
  if (isFutureDay(dateAfter)) return null;
  return { date: dateAfter, mealType: meals[0].type };
}

function imageSource(entry: DietDiaryEntry) {
  const uri = resolveDietDiaryImageUrl(entry.remoteImageUrl || entry.uri || '');
  const token = getAuthToken();
  if (uri.startsWith('http') && token) {
    return { uri, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri };
}

export function DietScreen(props: Props) {
  return <DietScreenContent {...props} />;
}

function DietScreenContent({ route, navigation }: Props) {
  const [entries, setEntries] = useState<DietDiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Lunch');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [savedMeal, setSavedMeal] = useState<{ mealType: MealType; note: string } | null>(null);
  const [memorySessionPoints, setMemorySessionPoints] = useState(0);
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const handledCameraRequestRef = useRef<number | null>(null);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const local = await loadDietDiaryEntries();
    setEntries(local);
    try {
      const remote = await loadDietDiaryCached({ force: options?.force });
      setEntries(await mergeRemoteDietDiaryEntries(remote.entries));
    } catch {
      // Offline/local-only mode is still useful for the diary.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => isSameDay(entry.createdAt, selectedDate)),
    [entries, selectedDate],
  );
  const memoryPoints = useMemo(() => uniqueMemoryEntries(visibleEntries).length, [visibleEntries]);
  const totalMemoryPoints = useMemo(() => uniqueMemoryEntries(entries).length, [entries]);
  const canGoForward = !isSameDay(selectedDate, new Date()) && !isFutureDay(shiftDate(selectedDate, 1));
  const canMoveMemoryForward = useMemo(
    () => Boolean(nextMemorySlot(selectedDate, selectedMeal)),
    [selectedDate, selectedMeal],
  );

  const moveMemorySlot = useCallback((direction: -1 | 1) => {
    const next = direction < 0
      ? previousMemorySlot(selectedDate, selectedMeal)
      : nextMemorySlot(selectedDate, selectedMeal);
    if (!next) return;
    setSelectedDate(next.date);
    setSelectedMeal(next.mealType);
  }, [selectedDate, selectedMeal]);

  const saveAsset = useCallback(async (asset?: Asset, mealType: MealType = selectedMeal) => {
    if (!asset?.uri) return;
    setSaving(true);
    try {
      const localEntry = await addDietDiaryEntry(asset, mealType, undefined, timestampForDiaryDate(selectedDate));
      await load();
      displayBehavioralNotification('dietPhotoLogged', { mealType: mealLabel(mealType) }).catch(() => undefined);
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
        await load({ force: true });
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
  }, [load, selectedDate, selectedMeal]);

  const addFromCamera = useCallback(async (mealType: MealType = selectedMeal) => {
    const result = await launchCamera({
      mediaType: 'photo',
      cameraType: 'back',
      quality: 0.7,
      maxWidth: 1280,
      maxHeight: 1280,
      includeBase64: true,
      saveToPhotos: false,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('Camera unavailable', result.errorMessage);
      return;
    }
    await saveAsset(result.assets?.[0], mealType);
  }, [saveAsset, selectedMeal]);

  const addFromLibrary = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.7,
      maxWidth: 1280,
      maxHeight: 1280,
      includeBase64: true,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('Photo library unavailable', result.errorMessage);
      return;
    }
    await saveAsset(result.assets?.[0]);
  };

  const showSavedMealAnimation = useCallback((mealType: MealType, note: string) => {
    setSavedMeal({ mealType, note });
    saveToastOpacity.setValue(0);
    saveToastScale.setValue(0.86);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(saveToastOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(saveToastScale, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(850),
      Animated.parallel([
        Animated.timing(saveToastOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(saveToastScale, {
          toValue: 0.96,
          duration: 220,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setSavedMeal(null));
  }, [saveToastOpacity, saveToastScale]);

  const saveTextEntry = async () => {
    const note = textEntry.trim();
    if (!note) {
      Alert.alert('Add remembered food', 'Write one food or meal you remember eating.');
      return;
    }
    setSaving(true);
    const entryMeal = selectedMeal;
    const entryDate = selectedDate;
    try {
      const localEntry = await addTextDietDiaryEntry(entryMeal, note, timestampForDiaryDate(entryDate));
      setTextEntry('');
      displayBehavioralNotification('dietPhotoLogged', { mealType: mealLabel(entryMeal) }).catch(() => undefined);
      await load();
      setMemorySessionPoints((points) => points + 1);
      showSavedMealAnimation(entryMeal, note);
      const nextSlot = previousMemorySlot(entryDate, entryMeal);
      setSelectedDate(nextSlot.date);
      setSelectedMeal(nextSlot.mealType);
      try {
        const uploaded = await uploadTextDietDiaryEntry({
          clientId: localEntry.id,
          mealType: localEntry.mealType,
          note: localEntry.note || note,
          createdAt: localEntry.createdAt,
        });
        await updateDietDiaryEntry(localEntry.id, {
          remoteId: uploaded.entry.entryId,
          remoteImageUrl: uploaded.entry.imageUrl,
          syncedAt: new Date().toISOString(),
          syncError: undefined,
        });
        await load({ force: true });
      } catch (uploadError) {
        await updateDietDiaryEntry(localEntry.id, {
          syncError: uploadError instanceof Error ? uploadError.message : 'Could not sync meal yet.',
        });
        await load();
      }
    } catch (e) {
      Alert.alert('Could not save meal', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openMemoryGame = () => {
    setMemorySessionPoints(0);
    setTextEntry('');
    setTextModalOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  };

  useEffect(() => {
    const requestId = route.params?.action === 'camera' ? route.params.requestId : undefined;
    if (!requestId || handledCameraRequestRef.current === requestId) return;
    handledCameraRequestRef.current = requestId;
    const mealType = route.params?.mealType || selectedMeal;
    setSelectedMeal(mealType);
    navigation.setParams({ action: undefined, requestId: undefined, mealType: undefined });
    const timer = setTimeout(() => addFromCamera(mealType), 250);
    return () => clearTimeout(timer);
  }, [route.params?.action, route.params?.requestId, route.params?.mealType, selectedMeal, navigation, addFromCamera]);

  useEffect(() => {
    if (route.params?.action === 'camera' || !route.params?.mealType) return;
    setSelectedMeal(route.params.mealType);
    navigation.setParams({ mealType: undefined });
  }, [route.params?.action, route.params?.mealType, navigation]);

  const confirmDelete = (entry: DietDiaryEntry) => {
    const isTextEntry = entry.kind === 'text' || !entry.uri;
    Alert.alert(isTextEntry ? 'Delete meal note?' : 'Delete food photo?', `This removes the ${isTextEntry ? 'note' : 'photo'} from your diet diary on this device.`, [
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
          await load({ force: true });
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
              <MaterialCommunityIcon name="brain" size={25} color={colors.accent} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Food memory</Text>
              <Text style={styles.heroCopy}>Remember what you ate, one item at a time. Every entry gives +1 point.</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <Badge label={`${memoryPoints} points`} tone="accent" icon="award" />
            <Badge label={`${totalMemoryPoints} lifetime`} tone="neutral" icon="target" />
          </View>
        </Card>

        <View style={styles.dateNavigator}>
          <TouchableOpacity
            onPress={() => setSelectedDate((value) => shiftDate(value, -1))}
            style={styles.dateArrow}
            accessibilityRole="button"
            accessibilityLabel="Previous diary date"
          >
            <Feather name="chevron-left" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.dateCenter}>
            <Text style={styles.dateLabel}>Diary date</Text>
            <Text style={styles.dateValue}>{formatDiaryDate(selectedDate)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setSelectedDate((value) => shiftDate(value, 1))}
            disabled={!canGoForward}
            style={[styles.dateArrow, !canGoForward && styles.dateArrowDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Next diary date"
            accessibilityState={{ disabled: !canGoForward }}
          >
            <Feather name="chevron-right" size={22} color={canGoForward ? colors.ink : colors.inkSubtle} />
          </TouchableOpacity>
        </View>

        <View style={styles.memoryPanel}>
          <View style={styles.memoryScore}>
            <Text style={styles.memoryScoreValue}>{memoryPoints}</Text>
            <Text style={styles.memoryScoreLabel}>points</Text>
          </View>
          <View style={styles.memoryCopy}>
            <Text style={styles.memoryTitle}>Start from the latest food you remember</Text>
            <Text style={styles.memoryText}>Keep adding until you cannot remember the previous food item.</Text>
          </View>
        </View>

        <SectionTitle>Time of day</SectionTitle>
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
                accessibilityLabel={`Select ${meal.label}`}
              >
                <Feather name={meal.icon} size={20} color={selected ? colors.white : colors.accent} />
                <Text style={[styles.mealTitle, selected && styles.mealTitleSelected]}>{meal.label}</Text>
                <Text style={[styles.mealHint, selected && styles.mealHintSelected]}>{meal.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Play food memory" icon="plus" onPress={openMemoryGame} loading={saving} />
          <View style={styles.secondaryActionRow}>
            <PrimaryButton title="Photo" icon="camera" variant="secondary" onPress={() => addFromCamera()} disabled={saving} style={styles.secondaryAction} />
            <PrimaryButton title="Upload" icon="image" variant="secondary" onPress={addFromLibrary} disabled={saving} style={styles.secondaryAction} />
          </View>
        </View>

        <SectionTitle>Diet diary</SectionTitle>
        {visibleEntries.length === 0 ? (
          <EmptyState
            icon="edit-3"
            title={`No food logged for ${formatDiaryDate(selectedDate).toLowerCase()}`}
            message="Play the food memory game and add each remembered item for points."
            actionLabel="Start memory game"
            onAction={openMemoryGame}
          />
        ) : (
          <View style={styles.grid}>
            {visibleEntries.map((entry) => {
              const isTextEntry = entry.kind === 'text' || !entry.uri;
              return (
                <TouchableOpacity
                  key={entry.id}
                  activeOpacity={0.85}
                  style={[styles.diaryCard, isTextEntry && styles.textCard]}
                  onPress={() => setPreview(entry)}
                >
                  {isTextEntry ? (
                    <View style={styles.textCardBody}>
                      <View style={styles.foodCardHeader}>
                        <View style={styles.foodIcon}>
                          <MaterialCommunityIcon name="silverware-fork-knife" size={22} color={colors.accent} />
                        </View>
                      </View>
                      <View style={styles.foodCardContent}>
                        <Text style={styles.foodLabel}>Food item</Text>
                        <Text style={styles.foodName} numberOfLines={3}>{entry.note}</Text>
                      </View>
                      <View style={styles.foodCardFooter}>
                        <Feather name="clock" size={13} color={colors.accentDark} />
                        <Text style={styles.foodFooterText}>{mealLabel(entry.mealType)}</Text>
                      </View>
                    </View>
                  ) : (
                    <Image source={imageSource(entry)} style={styles.photo} resizeMode="cover" />
                  )}
                  <View style={styles.photoMeta}>
                    <View style={styles.photoMealRow}>
                      <Text style={styles.photoMeal}>{mealLabel(entry.mealType)}</Text>
                      {entry.syncError ? <Feather name="cloud-off" size={13} color={colors.warn} /> : null}
                    </View>
                    <Text style={styles.photoTime}>{formatEntryTime(entry.createdAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {preview?.uri ? (
              <Image source={imageSource(preview)} style={styles.previewImage} resizeMode="cover" />
            ) : preview ? (
              <View style={styles.previewNote}>
                <View style={styles.previewFoodIcon}>
                  <MaterialCommunityIcon name="silverware-fork-knife" size={28} color={colors.accent} />
                </View>
                <Text style={styles.previewNoteLabel}>Food item logged</Text>
                <Text style={styles.previewNoteText}>{preview.note}</Text>
              </View>
            ) : null}
            {preview ? (
              <View style={styles.previewBody}>
                <View>
                  <Text style={styles.previewTitle}>{mealLabel(preview.mealType)}</Text>
                  <Text style={styles.previewTime}>{formatEntryTime(preview.createdAt)}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(preview)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete diary entry">
                  <Feather name="trash-2" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
            <PrimaryButton title="Close" variant="secondary" onPress={() => setPreview(null)} style={styles.closePreview} />
          </View>
        </View>
      </Modal>

      <Modal visible={textModalOpen} transparent animationType="slide" onRequestClose={() => setTextModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.textModalCard}>
            <View style={styles.textModalHeader}>
              <View>
                <Text style={styles.textModalEyebrow}>Food memory · +1 each</Text>
                <Text style={styles.textModalTitle}>{memorySessionPoints ? 'Next remembered food' : 'What did you eat last?'}</Text>
              </View>
              <TouchableOpacity onPress={() => setTextModalOpen(false)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close meal text entry">
                <Feather name="x" size={22} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.memorySlotNavigator}>
              <TouchableOpacity
                onPress={() => moveMemorySlot(-1)}
                style={styles.memorySlotArrow}
                accessibilityRole="button"
                accessibilityLabel="Previous food memory slot"
              >
                <Feather name="chevron-left" size={24} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.memorySlotCenter}>
                <Text style={styles.memorySlotLabel}>Logging</Text>
                <Text style={styles.memorySlotValue}>{mealLabel(selectedMeal)}</Text>
                <Text style={styles.memorySlotDate}>{formatDiaryDate(selectedDate)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => moveMemorySlot(1)}
                disabled={!canMoveMemoryForward}
                style={[styles.memorySlotArrow, !canMoveMemoryForward && styles.memorySlotArrowDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Next food memory slot"
                accessibilityState={{ disabled: !canMoveMemoryForward }}
              >
                <Feather name="chevron-right" size={24} color={canMoveMemoryForward ? colors.ink : colors.inkSubtle} />
              </TouchableOpacity>
            </View>
            <View style={styles.memorySessionRow}>
              <View style={styles.memorySessionScore}>
                <Text style={styles.memorySessionValue}>+{memorySessionPoints}</Text>
                <Text style={styles.memorySessionLabel}>this round</Text>
              </View>
              <Text style={styles.memorySessionHint}>After each entry, the game moves one slot back automatically.</Text>
            </View>
            <TextInput
              value={textEntry}
              onChangeText={setTextEntry}
              placeholder="Example: chicken salad, coffee, banana"
              placeholderTextColor={colors.inkSubtle}
              multiline
              textAlignVertical="top"
              style={styles.textInput}
              maxLength={280}
              autoFocus
            />
            <Text style={styles.characterCount}>{textEntry.trim().length}/280</Text>
            <View style={styles.textModalActions}>
              <PrimaryButton title="Finish" variant="secondary" onPress={() => setTextModalOpen(false)} disabled={saving} style={styles.modalActionButton} />
              <PrimaryButton title="Add +1" icon="plus" onPress={saveTextEntry} loading={saving} style={styles.modalActionButton} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {savedMeal ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.saveToast,
            {
              opacity: saveToastOpacity,
              transform: [{ scale: saveToastScale }],
            },
          ]}
        >
          <View style={styles.saveToastIcon}>
            <Feather name="check" size={34} color={colors.white} />
          </View>
          <Text style={styles.saveToastTitle}>Meal logged</Text>
          <Text style={styles.saveToastMeal}>{mealLabel(savedMeal.mealType)}</Text>
          <Text style={styles.saveToastNote} numberOfLines={2}>{savedMeal.note}</Text>
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroIcon: { width: 50, height: 50, borderRadius: radius.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  heroTitle: { ...typography.title, color: colors.accentDarker },
  heroCopy: { ...typography.body, color: colors.accentDarker, marginTop: 2 },
  heroStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.sm,
  },
  dateArrow: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateArrowDisabled: { opacity: 0.42 },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  dateValue: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  memoryPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    borderRadius: 26,
    backgroundColor: colors.black,
    padding: spacing.lg,
    ...shadows.accent,
  },
  memoryScore: {
    width: 74,
    height: 74,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryScoreValue: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: colors.black },
  memoryScoreLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },
  memoryCopy: { flex: 1 },
  memoryTitle: { ...typography.subtitle, color: colors.white },
  memoryText: { ...typography.caption, color: colors.onAccentMuted, marginTop: spacing.xs },
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  mealCardSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  mealTitle: { ...typography.bodyBold, color: colors.ink, marginTop: spacing.sm },
  mealTitleSelected: { color: colors.white },
  mealHint: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  mealHintSelected: { color: colors.onAccentMuted },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  secondaryActionRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryAction: { flex: 1, paddingHorizontal: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  diaryCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  textCard: { backgroundColor: colors.panel, borderColor: colors.borderStrong },
  textCardBody: { minHeight: 176, padding: spacing.md, justifyContent: 'space-between', backgroundColor: colors.accentLight },
  foodCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  foodIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  foodCardContent: { marginTop: spacing.md },
  foodLabel: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  foodName: { ...typography.subtitle, color: colors.ink, marginTop: spacing.xs },
  foodCardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  foodFooterText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  photo: { width: '100%', aspectRatio: 1 },
  photoMeta: { padding: spacing.sm },
  photoMealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  photoMeal: { ...typography.bodyBold, color: colors.ink },
  photoTime: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.panel, borderRadius: radius.xl, overflow: 'hidden' },
  previewImage: { width: '100%', aspectRatio: 1 },
  previewNote: { minHeight: 240, padding: spacing.xl, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.accentLight },
  previewFoodIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  previewNoteLabel: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  previewNoteText: { ...typography.title, color: colors.accentDarker },
  previewBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  previewTitle: { ...typography.title, color: colors.ink },
  previewTime: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  deleteButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.errorLight, alignItems: 'center', justifyContent: 'center' },
  closePreview: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  textModalCard: { backgroundColor: colors.panel, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  textModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  textModalEyebrow: { ...typography.overline, color: colors.accent },
  textModalTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center' },
  memorySlotNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 24,
    backgroundColor: colors.black,
    padding: spacing.sm,
  },
  memorySlotArrow: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memorySlotArrowDisabled: { opacity: 0.38 },
  memorySlotCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  memorySlotLabel: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  memorySlotValue: { ...typography.title, color: colors.white, marginTop: 1 },
  memorySlotDate: { ...typography.caption, color: colors.onAccentMuted, marginTop: 2 },
  memorySessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  memorySessionScore: {
    width: 68,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  memorySessionValue: { ...typography.title, color: colors.ink },
  memorySessionLabel: { fontSize: 10, lineHeight: 12, color: colors.inkMuted, fontWeight: '700' },
  memorySessionHint: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  textInput: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  characterCount: { ...typography.caption, color: colors.inkMuted, textAlign: 'right' },
  textModalActions: { flexDirection: 'row', gap: spacing.sm },
  modalActionButton: { flex: 1 },
  saveToast: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    top: '38%',
    alignItems: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadows.lg,
  },
  saveToastIcon: {
    width: 74,
    height: 74,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.accent,
  },
  saveToastTitle: { ...typography.hero, color: colors.ink, textAlign: 'center' },
  saveToastMeal: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginTop: spacing.xs },
  saveToastNote: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm },
});
