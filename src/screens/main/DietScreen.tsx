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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, Card } from '../../components/Card';
import { FoodBowlGraphic } from '../../components/FoodBowlGraphic';
import { PrimaryButton } from '../../components/PrimaryButton';
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
import {
  deleteRemoteDietDiaryEntry,
  resolveDietDiaryImageUrl,
  uploadDietDiaryEntry,
  uploadTextDietDiaryEntry,
  type DietCoachFeedback,
} from '../../services/dietDiaryService';
import { getAuthToken } from '../../services/apiClient';
import { loadDietDiaryCached } from '../../services/preloadService';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { isDateInCurrentWeek } from '../../utils/weeklyMuscles';
import {
  isFutureLocalDay as isFutureDay,
  isMealSlotInFuture,
  isSameLocalDay as isSameDay,
  mealForCurrentTime,
  nextMealSlot as nextMemorySlot,
  previousMealSlot as previousMemorySlot,
  previousUnloggedMealSlot,
  shiftLocalDate as shiftDate,
  timestampForMealSlot as timestampForFoodSlot,
  timestampValue,
} from '../../utils/dietDiaryTime';

const meals: Array<{ type: MealType; icon: string; label: string; hint: string }> = [
  { type: 'Breakfast', icon: 'sunrise', label: 'Breakfast', hint: 'Morning meal' },
  { type: 'Lunch', icon: 'sun', label: 'Lunch', hint: 'Midday meal' },
  { type: 'Evening', icon: 'sunset', label: 'Evening', hint: 'Evening meal' },
  { type: 'Dinner', icon: 'moon', label: 'Dinner', hint: 'Night meal' },
];

const confettiColors = ['#050505', '#ffffff', '#d9d6ce', '#8f8b82'];
const confettiPieces = Array.from({ length: 32 }, (_, index) => ({
  id: `confetti-${index}`,
  left: 6 + ((index * 23) % 88),
  drift: ((index % 7) - 3) * 12,
  size: 7 + (index % 4) * 3,
  color: confettiColors[index % confettiColors.length],
  delay: 0.02 + (index % 8) * 0.035,
  rotate: index % 2 === 0 ? '1' : '-1',
}));

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

function formatFoodTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', {
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

function entryTimestamp(entry: DietDiaryEntry) {
  return timestampValue(entry.createdAt);
}

function mealLabel(type: MealType) {
  return meals.find((meal) => meal.type === type)?.label || type;
}

function feedbackStatusText(feedback?: DietCoachFeedback | null) {
  if (!feedback || feedback.status === 'pending') {
    const days = feedback?.nextInDays ?? 7;
    return `Insights unlock in ${days} day${days === 1 ? '' : 's'}`;
  }
  const days = feedback.nextInDays ?? 7;
  return `Next AI feedback in ${days} day${days === 1 ? '' : 's'}`;
}

function isMemoryEntry(entry: DietDiaryEntry) {
  return entry.kind === 'text' || (!entry.uri && Boolean(entry.note?.trim()));
}

function uniqueMemoryEntries(entries: DietDiaryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!isMemoryEntry(entry)) return false;
    // Entries are unique records even when the same food is logged more than
    // once for one meal. Only collapse the same local/remote record after sync.
    const key = entry.remoteId || entry.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function imageSource(entry: DietDiaryEntry) {
  const uri = resolveDietDiaryImageUrl(entry.remoteImageUrl || entry.uri || '');
  const token = getAuthToken();
  if (uri.startsWith('http') && token) {
    return { uri, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri };
}

function DietTab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={[styles.dietTab, active && styles.dietTabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Feather name={icon} size={18} color={active ? colors.accent : colors.inkMuted} />
      <Text style={[styles.dietTabText, active && styles.dietTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DietScreen(props: Props) {
  return <DietScreenContent {...props} />;
}

function DietScreenContent({ route, navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [entries, setEntries] = useState<DietDiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => {
    const requested = route.params?.mealType;
    return requested && !isMealSlotInFuture(new Date(), requested) ? requested : mealForCurrentTime();
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dietFeedback, setDietFeedback] = useState<DietCoachFeedback | null>(null);
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [savedMeal, setSavedMeal] = useState<{ mealType: MealType; note: string } | null>(null);
  const [memorySessionPoints, setMemorySessionPoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'log' | 'diary' | 'feedback'>('log');
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const celebrationProgress = useRef(new Animated.Value(0)).current;
  const handledCameraRequestRef = useRef<number | null>(null);

  const load = useCallback(async (options?: { force?: boolean; retryPending?: boolean }) => {
    const local = await loadDietDiaryEntries();
    setEntries(local);
    try {
      const remote = await loadDietDiaryCached({ force: options?.force });
      setDietFeedback(remote.feedback ?? null);
      let merged = await mergeRemoteDietDiaryEntries(remote.entries);

      if (options?.retryPending) {
        const pendingTextEntries = merged.filter(
          (entry) => isMemoryEntry(entry) && !entry.remoteId && Boolean(entry.note?.trim()),
        );
        if (pendingTextEntries.length) {
          // Keep writes ordered because the legacy backend stores a user's
          // diary as one document. Sequential retries prevent lost updates.
          for (const entry of pendingTextEntries) {
            try {
              const uploaded = await uploadTextDietDiaryEntry({
                clientId: entry.id,
                mealType: entry.mealType,
                note: entry.note || '',
                createdAt: entry.createdAt,
              });
              await updateDietDiaryEntry(entry.id, {
                remoteId: uploaded.entry.entryId,
                remoteImageUrl: uploaded.entry.imageUrl,
                createdAt: uploaded.entry.createdAt,
                loggedAt: uploaded.entry.loggedAt || entry.loggedAt,
                syncedAt: new Date().toISOString(),
                syncError: undefined,
              });
            } catch (error) {
              await updateDietDiaryEntry(entry.id, {
                syncError: error instanceof Error ? error.message : 'Could not sync meal yet.',
              });
            }
          }
          merged = await loadDietDiaryEntries();
        }
      }

      setEntries(merged);
    } catch {
      // Offline/local-only mode is still useful for the diary.
    }
  }, []);

  useEffect(() => {
    load({ retryPending: true });
  }, [load]);

  const diarySections = useMemo(() => {
    const sections: Array<{ key: string; title: string; entries: DietDiaryEntry[] }> = [];
    const byDate = new Map<string, DietDiaryEntry[]>();
    [...entries]
      .sort((a, b) => entryTimestamp(b) - entryTimestamp(a))
      .forEach((entry) => {
        const date = new Date(entry.createdAt);
        const key = Number.isNaN(date.getTime()) ? 'unknown' : date.toDateString();
        const bucket = byDate.get(key) ?? [];
        bucket.push(entry);
        byDate.set(key, bucket);
      });
    byDate.forEach((dateEntries, key) => {
      // A diary is read from the current/latest meal backward through the day.
      const sortedDateEntries = [...dateEntries].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
      sections.push({
        key,
        title: key === 'unknown' ? 'Unknown date' : formatDiaryDate(new Date(dateEntries[0].createdAt)),
        entries: sortedDateEntries,
      });
    });
    return sections;
  }, [entries]);
  const weeklyMemoryPoints = useMemo(
    () => uniqueMemoryEntries(entries.filter((entry) => isDateInCurrentWeek(entry.createdAt))).length,
    [entries],
  );
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

  const changeSelectedDate = useCallback((direction: -1 | 1) => {
    setSelectedDate((value) => {
      const next = shiftDate(value, direction);
      if (isSameDay(next, new Date()) && isMealSlotInFuture(next, selectedMeal)) {
        setSelectedMeal(mealForCurrentTime());
      }
      return next;
    });
  }, [selectedMeal]);

  const selectMeal = useCallback((mealType: MealType) => {
    if (isMealSlotInFuture(selectedDate, mealType)) return;
    setSelectedMeal(mealType);
  }, [selectedDate]);

  const saveAsset = useCallback(async (
    asset?: Asset,
    mealType: MealType = selectedMeal,
    mealDate: Date = selectedDate,
  ) => {
    if (!asset?.uri) return;
    setSaving(true);
    try {
      const loggedMeal = isMealSlotInFuture(mealDate, mealType) ? mealForCurrentTime() : mealType;
      const localEntry = await addDietDiaryEntry(asset, loggedMeal, undefined, timestampForFoodSlot(mealDate, loggedMeal));
      await load();
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
          createdAt: uploaded.entry.createdAt,
          loggedAt: uploaded.entry.loggedAt || localEntry.loggedAt,
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

  const addFromCamera = useCallback(async (
    mealType: MealType = selectedMeal,
    mealDate: Date = selectedDate,
  ) => {
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
    await saveAsset(result.assets?.[0], mealType, mealDate);
  }, [saveAsset, selectedDate, selectedMeal]);

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
    celebrationProgress.setValue(0);
    Animated.parallel([
      Animated.timing(celebrationProgress, {
        toValue: 1,
        duration: 1650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
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
        Animated.delay(1050),
        Animated.parallel([
          Animated.timing(saveToastOpacity, {
            toValue: 0,
            duration: 260,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(saveToastScale, {
            toValue: 0.96,
            duration: 260,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => setSavedMeal(null));
  }, [celebrationProgress, saveToastOpacity, saveToastScale]);

  const saveTextEntry = async (options?: { finishAfterSave?: boolean; moveToPreviousMissed?: boolean }) => {
    const note = textEntry.trim();
    if (!note) {
      Alert.alert('Add remembered food', 'Write one food or meal you remember eating.');
      return false;
    }
    setSaving(true);
    const entryMeal = selectedMeal;
    const entryDate = selectedDate;
    try {
      const localEntry = await addTextDietDiaryEntry(entryMeal, note, timestampForFoodSlot(entryDate, entryMeal));
      const entriesAfterSave = [localEntry, ...entries.filter((entry) => entry.id !== localEntry.id)];
      setEntries(entriesAfterSave);
      setTextEntry('');
      setMemorySessionPoints((points) => points + 1);
      showSavedMealAnimation(entryMeal, note);
      if (options?.finishAfterSave) {
        setTextModalOpen(false);
        setActiveTab('diary');
      } else if (options?.moveToPreviousMissed) {
        const previousMissed = previousUnloggedMealSlot(
          entryDate,
          entryMeal,
          (slot) => entriesAfterSave.some(
            (entry) => entry.mealType === slot.mealType && isSameDay(entry.createdAt, slot.date),
          ),
        );
        setSelectedDate(previousMissed.date);
        setSelectedMeal(previousMissed.mealType);
      }
      await load();
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
          createdAt: uploaded.entry.createdAt,
          loggedAt: uploaded.entry.loggedAt || localEntry.loggedAt,
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
      return true;
    } catch (e) {
      Alert.alert('Could not save meal', e instanceof Error ? e.message : 'Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finishMemoryGame = async () => {
    if (saving) return;
    if (textEntry.trim()) {
      await saveTextEntry({ finishAfterSave: true });
      return;
    }
    setTextModalOpen(false);
  };

  const openMemoryGame = () => {
    const now = new Date();
    setSelectedDate(now);
    setSelectedMeal(mealForCurrentTime(now));
    setMemorySessionPoints(0);
    setTextEntry('');
    setTextModalOpen(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true, retryPending: true });
    setRefreshing(false);
  };

  useEffect(() => {
    const requestId = route.params?.action === 'camera' ? route.params.requestId : undefined;
    if (!requestId || handledCameraRequestRef.current === requestId) return;
    handledCameraRequestRef.current = requestId;
    const currentDate = new Date();
    const requestedMeal = route.params?.mealType || selectedMeal;
    const mealType = isMealSlotInFuture(currentDate, requestedMeal) ? mealForCurrentTime(currentDate) : requestedMeal;
    setSelectedDate(currentDate);
    setSelectedMeal(mealType);
    navigation.setParams({ action: undefined, requestId: undefined, mealType: undefined });
    const timer = setTimeout(() => addFromCamera(mealType, currentDate), 250);
    return () => clearTimeout(timer);
  }, [route.params?.action, route.params?.requestId, route.params?.mealType, selectedMeal, navigation, addFromCamera]);

  useEffect(() => {
    if (route.params?.action === 'camera' || !route.params?.mealType) return;
    const currentDate = new Date();
    const requestedMeal = route.params.mealType;
    setSelectedDate(currentDate);
    setSelectedMeal(isMealSlotInFuture(currentDate, requestedMeal) ? mealForCurrentTime(currentDate) : requestedMeal);
    navigation.setParams({ mealType: undefined });
  }, [route.params?.action, route.params?.mealType, navigation]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (route.params?.mealType || route.params?.action === 'camera' || textModalOpen) return;
      if (!isSameDay(selectedDate, new Date())) return;
      setSelectedMeal(mealForCurrentTime());
    });
    return unsub;
  }, [navigation, route.params?.action, route.params?.mealType, selectedDate, textModalOpen]);

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

  const renderDiaryFeed = () => (
    <>
      <View style={styles.diaryFeedHeader}>
        <View>
          <Text style={styles.diaryFeedEyebrow}>Diet diary</Text>
          <Text style={styles.diaryFeedTitle}>Your food log</Text>
        </View>
        <View style={styles.diaryFeedCount}>
          <Text style={styles.diaryFeedCountValue}>{entries.length}</Text>
          <Text style={styles.diaryFeedCountLabel}>items</Text>
        </View>
      </View>
      {entries.length === 0 ? (
        <EmptyState
          icon="edit-3"
          title="No food logged yet"
          message="Play the food memory game and add each remembered item for points."
          actionLabel="Start memory game"
          onAction={openMemoryGame}
        />
      ) : (
        <View style={styles.diaryFeed}>
          {diarySections.map((section) => (
            <View key={section.key} style={styles.diaryDateSection}>
              <View style={styles.diaryDateHeader}>
                <Text style={styles.diaryDateTitle}>{section.title}</Text>
                <Text style={styles.diaryDateCount}>{section.entries.length} logged</Text>
              </View>
              <View style={styles.diaryList}>
                {section.entries.map((entry) => {
                  const isTextEntry = entry.kind === 'text' || !entry.uri;
                  return (
                    <TouchableOpacity
                      key={entry.id}
                      activeOpacity={0.85}
                      style={styles.diaryListCard}
                      onPress={() => setPreview(entry)}
                    >
                      <View style={[styles.diaryThumb, isTextEntry && styles.diaryTextThumb]}>
                        {isTextEntry ? (
                          <MaterialCommunityIcon name="silverware-fork-knife" size={24} color={colors.ink} />
                        ) : (
                          <Image source={imageSource(entry)} style={styles.diaryThumbImage} resizeMode="cover" />
                        )}
                      </View>
                      <View style={styles.diaryListBody}>
                        <View style={styles.diaryListTop}>
                          <Text style={styles.diaryMeal}>{mealLabel(entry.mealType)}</Text>
                          {entry.syncError ? <Feather name="cloud-off" size={14} color={colors.warn} /> : null}
                        </View>
                        <Text style={styles.diaryFoodName}>
                          {isTextEntry ? entry.note : 'Food photo'}
                        </Text>
                        <Text style={styles.diaryFoodTime}>{formatFoodTime(entry.createdAt)}</Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.dietHeaderRow}>
          <Text style={styles.dietScreenTitle}>Diet</Text>
          <View style={styles.weeklyPointsBadge} accessibilityLabel={`${weeklyMemoryPoints} food memory points this week`}>
            <View style={styles.weeklyPointsIcon}>
              <Feather name="star" size={17} color={colors.gold} />
            </View>
            <View style={styles.weeklyPointsCopy}>
              <Text style={styles.weeklyPointsValue}>{weeklyMemoryPoints}</Text>
              <Text style={styles.weeklyPointsLabel}>WEEKLY POINTS</Text>
            </View>
          </View>
        </View>

        <View style={styles.dietTabs}>
          <DietTab label="Log" icon="plus-circle" active={activeTab === 'log'} onPress={() => setActiveTab('log')} />
          <DietTab label="Diary" icon="book-open" active={activeTab === 'diary'} onPress={() => setActiveTab('diary')} />
          <DietTab label="Feedback" icon="message-circle" active={activeTab === 'feedback'} onPress={() => setActiveTab('feedback')} />
        </View>

        {activeTab === 'diary' ? (
          <View style={styles.diaryScreen}>{renderDiaryFeed()}</View>
        ) : activeTab === 'feedback' ? (
          <View style={styles.diaryScreen}>
            <View style={styles.feedbackHero}>
              <View style={styles.feedbackHeroIcon}>
                <Feather name="message-circle" size={24} color={colors.accent} />
              </View>
              <View style={styles.feedbackHeroText}>
                <Text style={styles.feedbackEyebrow}>Diet feedback</Text>
                <Text style={styles.feedbackTitle}>{dietFeedback?.title || "Ava's diet feedback"}</Text>
                <Text style={styles.feedbackMeta}>{feedbackStatusText(dietFeedback)}</Text>
              </View>
            </View>

            {!dietFeedback || dietFeedback.status === 'pending' ? (
              <Card style={styles.feedbackCard}>
                <View style={styles.countdownRow}>
                  <View style={styles.countdownBadge}>
                    <Text style={styles.countdownValue}>{dietFeedback?.nextInDays ?? 7}</Text>
                    <Text style={styles.countdownUnit}>days</Text>
                  </View>
                  <View style={styles.countdownCopy}>
                    <Text style={styles.feedbackSectionTitle}>Insights on the way</Text>
                    <Text style={styles.feedbackBody}>
                      Ava is getting to know your eating. Your first personalized diet insights unlock in {dietFeedback?.nextInDays ?? 7} day{(dietFeedback?.nextInDays ?? 7) === 1 ? '' : 's'} — keep logging your meals so the review is accurate.
                    </Text>
                  </View>
                </View>
              </Card>
            ) : (
              <>
                <Card style={styles.feedbackCard}>
                  <Text style={styles.feedbackSectionTitle}>What you are eating</Text>
                  <Text style={styles.feedbackBody}>
                    {dietFeedback.summary || 'Log a few meals so Ava can review your eating pattern.'}
                  </Text>
                  {dietFeedback.stats?.recentFoods?.length ? (
                    <View style={styles.foodPillRow}>
                      {dietFeedback.stats.recentFoods.slice(0, 6).map((food) => (
                        <View key={food} style={styles.foodPill}>
                          <Text style={styles.foodPillText}>{food}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>

                <Card style={styles.feedbackCard}>
                  <Text style={styles.feedbackSectionTitle}>What to eat next</Text>
                  <Text style={styles.feedbackFocusText}>
                    {dietFeedback.nextFocus || 'Keep meals balanced and protein-forward.'}
                  </Text>
                  {dietFeedback.highlights?.length ? (
                    <View style={styles.feedbackList}>
                      {dietFeedback.highlights.slice(0, 4).map((highlight) => (
                        <View key={highlight} style={styles.feedbackListItem}>
                          <Feather name="check" size={16} color={colors.goldMuted} />
                          <Text style={styles.feedbackListText}>{highlight}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </>
            )}

            <PrimaryButton title="Log a meal" icon="plus" onPress={() => setActiveTab('log')} style={styles.feedbackCta} />
          </View>
        ) : (
          <>
            <View style={styles.logPanel}>
              <View style={styles.logHero}>
                <Text style={styles.logEyebrow}>Food logging</Text>
                <Text style={styles.logTitle}>Remember what you ate</Text>
                <Text style={styles.logCopy}>Every saved item adds one point to this week.</Text>
              </View>

              <View style={styles.logControlsCard}>
                <View style={styles.dateNavigator}>
                  <TouchableOpacity
                    onPress={() => changeSelectedDate(-1)}
                    style={styles.dateArrow}
                    accessibilityRole="button"
                    accessibilityLabel="Previous log date"
                  >
                    <Feather name="chevron-left" size={22} color={colors.ink} />
                  </TouchableOpacity>
                  <View style={styles.dateCenter}>
                    <Text style={styles.dateLabel}>Log date</Text>
                    <Text style={styles.dateValue}>{formatDiaryDate(selectedDate)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => changeSelectedDate(1)}
                    disabled={!canGoForward}
                    style={[styles.dateArrow, !canGoForward && styles.dateArrowDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Next log date"
                    accessibilityState={{ disabled: !canGoForward }}
                  >
                    <Feather name="chevron-right" size={22} color={canGoForward ? colors.ink : colors.inkSubtle} />
                  </TouchableOpacity>
                </View>

                <View style={styles.mealGridCompact}>
                  {meals.map((meal) => {
                    const selected = selectedMeal === meal.type;
                    const disabled = isMealSlotInFuture(selectedDate, meal.type);
                    return (
                      <TouchableOpacity
                        key={meal.type}
                        activeOpacity={0.85}
                        onPress={() => selectMeal(meal.type)}
                        disabled={disabled}
                        style={[styles.mealPill, selected && styles.mealPillSelected, disabled && styles.mealPillDisabled]}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={`Select ${meal.label}`}
                      >
                        <Feather name={meal.icon} size={16} color={selected ? colors.accent : disabled ? colors.inkSubtle : colors.inkMuted} />
                        <Text style={[styles.mealPillText, selected && styles.mealPillTextSelected, disabled && styles.mealPillTextDisabled]}>{meal.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.actions}>
                <FoodBowlGraphic />
                <PrimaryButton title="Start memory game" icon="plus" onPress={openMemoryGame} loading={saving} />
                <View style={styles.secondaryActionRow}>
                  <PrimaryButton title="Photo" icon="camera" variant="secondary" onPress={() => addFromCamera()} disabled={saving} style={styles.secondaryAction} />
                  <PrimaryButton title="Upload" icon="image" variant="secondary" onPress={addFromLibrary} disabled={saving} style={styles.secondaryAction} />
                </View>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.86} style={styles.feedbackPreview} onPress={() => setActiveTab('feedback')}>
              <View style={styles.feedbackPreviewIcon}>
                <Feather name="message-circle" size={19} color={colors.accent} />
              </View>
              <View style={styles.feedbackPreviewText}>
                <Text style={styles.feedbackPreviewTitle}>Diet feedback</Text>
                <Text style={styles.feedbackPreviewCopy}>{feedbackStatusText(dietFeedback)}</Text>
              </View>
              <Feather name="chevron-right" size={22} color={colors.inkMuted} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalCard} showsVerticalScrollIndicator={false} bounces={false}>
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
                <View style={styles.previewBodyCopy}>
                  <Text style={styles.previewTitle}>{mealLabel(preview.mealType)}</Text>
                  <Text style={styles.previewTime}>{formatEntryTime(preview.createdAt)}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(preview)} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete diary entry">
                  <Feather name="trash-2" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
            <PrimaryButton title="Close" variant="secondary" onPress={() => setPreview(null)} style={styles.closePreview} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={textModalOpen} transparent animationType="slide" onRequestClose={() => setTextModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <ScrollView
            style={styles.textModalCard}
            contentContainerStyle={styles.textModalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
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
                <Text style={styles.memorySlotDate}>
                  {formatDiaryDate(selectedDate)} · {formatFoodTime(timestampForFoodSlot(selectedDate, selectedMeal))}
                </Text>
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
              <Text style={styles.memorySessionHint}>Add +1 saves this entry, then takes you to the closest earlier meal you missed.</Text>
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
              <PrimaryButton title={textEntry.trim() ? 'Save & finish' : 'Finish'} variant="secondary" onPress={finishMemoryGame} disabled={saving} style={styles.modalActionButton} />
              <PrimaryButton title="Add +1" icon="plus" onPress={() => saveTextEntry({ moveToPreviousMissed: true })} loading={saving} style={styles.modalActionButton} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {savedMeal ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.celebrationOverlay,
            {
              opacity: saveToastOpacity,
            },
          ]}
        >
          <View style={styles.confettiLayer}>
            {confettiPieces.map((piece) => {
              const start = piece.delay;
              const mid = Math.min(start + 0.42, 0.86);
              const end = Math.min(start + 0.76, 1);
              const translateY = celebrationProgress.interpolate({
                inputRange: [0, start, end],
                outputRange: [-120, -120, 420],
                extrapolate: 'clamp',
              });
              const translateX = celebrationProgress.interpolate({
                inputRange: [0, mid, end],
                outputRange: [0, piece.drift, piece.drift * 1.8],
                extrapolate: 'clamp',
              });
              const rotate = celebrationProgress.interpolate({
                inputRange: [0, end],
                outputRange: ['0deg', `${piece.rotate === '1' ? 540 : -540}deg`],
                extrapolate: 'clamp',
              });
              const opacity = celebrationProgress.interpolate({
                inputRange: [0, start, mid, end],
                outputRange: [0, 1, 1, 0],
                extrapolate: 'clamp',
              });
              return (
                <Animated.View
                  key={piece.id}
                  style={[
                    styles.confettiPiece,
                    {
                      left: `${piece.left}%`,
                      width: piece.size,
                      height: piece.size * 1.6,
                      backgroundColor: piece.color,
                      opacity,
                      transform: [{ translateX }, { translateY }, { rotate }],
                    },
                  ]}
                />
              );
            })}
          </View>
          <Animated.View style={[styles.saveToast, { transform: [{ scale: saveToastScale }] }]}>
            <View style={styles.saveToastIcon}>
              <Feather name="award" size={34} color={colors.accent} />
            </View>
            <View style={styles.pointsBurst}>
              <Text style={styles.pointsBurstText}>+1</Text>
            </View>
            <Text style={styles.saveToastTitle}>Meal saved</Text>
            <Text style={styles.saveToastMeal}>{mealLabel(savedMeal.mealType)}</Text>
            <Text style={styles.saveToastNote}>{savedMeal.note}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  dietHeaderRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  dietScreenTitle: { ...typography.display, color: colors.ink, flexShrink: 1 },
  weeklyPointsBadge: {
    height: 46,
    minWidth: 132,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  weeklyPointsIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.panelWarm,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyPointsCopy: { flex: 1, minWidth: 0, justifyContent: 'center', alignItems: 'flex-start' },
  weeklyPointsValue: { fontSize: 18, lineHeight: 19, fontWeight: '900', color: colors.ink },
  weeklyPointsLabel: { fontSize: 8, lineHeight: 10, letterSpacing: 0.7, fontWeight: '800', color: colors.inkMuted },
  dietTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  dietTab: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dietTabActive: {
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.goldMuted,
  },
  dietTabText: { ...typography.bodyBold, color: colors.inkMuted },
  dietTabTextActive: { color: colors.ink },
  feedbackScreen: { gap: spacing.md },
  diaryScreen: { gap: spacing.md },
  feedbackHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  feedbackHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackHeroText: { flex: 1 },
  feedbackEyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  feedbackTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  feedbackMeta: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  feedbackCard: { gap: spacing.sm },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  countdownBadge: {
    width: 66,
    height: 66,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownValue: { fontSize: 26, lineHeight: 28, fontWeight: '900', color: colors.accent },
  countdownUnit: { fontSize: 10, lineHeight: 12, color: colors.inkMuted, fontWeight: '700' },
  countdownCopy: { flex: 1 },
  feedbackSectionTitle: { ...typography.subtitle, color: colors.ink },
  feedbackBody: { ...typography.body, color: colors.inkMuted },
  foodPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  foodPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  foodPillText: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  feedbackFocusText: { ...typography.bodyBold, color: colors.ink },
  feedbackList: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  feedbackListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  feedbackListText: { ...typography.body, color: colors.ink, flex: 1 },
  feedbackStatsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  feedbackStat: { flex: 1, alignItems: 'center' },
  feedbackStatDivider: { width: 1, height: 42, backgroundColor: colors.border },
  feedbackStatValue: { ...typography.title, color: colors.ink },
  feedbackStatLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  feedbackCta: { marginTop: spacing.xs },
  diaryFeedHeader: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  diaryFeedEyebrow: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  diaryFeedTitle: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  diaryFeedCount: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderStrong,
  },
  diaryFeedCountValue: { ...typography.subtitle, color: colors.ink },
  diaryFeedCountLabel: { ...typography.caption, color: colors.inkMuted },
  diaryFeed: { gap: spacing.lg },
  diaryDateSection: { gap: spacing.sm },
  diaryDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  diaryDateTitle: { ...typography.bodyBold, color: colors.ink, flex: 1, minWidth: 0 },
  diaryDateCount: { ...typography.caption, color: colors.inkMuted, flexShrink: 1, textAlign: 'right' },
  diaryList: { borderTopWidth: 1, borderTopColor: colors.border },
  diaryListCard: {
    minHeight: 88,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  diaryThumb: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaryTextThumb: { backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  diaryThumbImage: { width: '100%', height: '100%' },
  diaryListBody: { flex: 1, minWidth: 0 },
  diaryListTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  diaryMeal: { ...typography.caption, color: colors.inkMuted, fontWeight: '900', textTransform: 'uppercase' },
  diaryFoodName: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  diaryFoodTime: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  logPanel: {
    backgroundColor: 'transparent',
    gap: 10,
  },
  logHero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
  },
  logEyebrow: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  logTitle: { ...typography.title, color: colors.ink },
  logCopy: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
  logControlsCard: {
    paddingVertical: spacing.xs,
    gap: 10,
  },
  mealGridCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mealPill: {
    flexGrow: 1,
    minWidth: '47%',
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  mealPillSelected: { backgroundColor: colors.accentLight, borderColor: colors.goldMuted },
  mealPillDisabled: { opacity: 0.38 },
  mealPillText: { ...typography.bodyBold, color: colors.inkMuted },
  mealPillTextSelected: { color: colors.accent },
  mealPillTextDisabled: { color: colors.inkSubtle },
  feedbackPreview: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  feedbackPreviewIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackPreviewText: { flex: 1 },
  feedbackPreviewTitle: { ...typography.bodyBold, color: colors.ink },
  feedbackPreviewCopy: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  dateArrow: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateArrowDisabled: { opacity: 0.42 },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  dateValue: { ...typography.subtitle, color: colors.ink, marginTop: 2 },
  memoryScoreValue: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: colors.ink },
  memoryScoreLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },
  memoryTitle: { ...typography.subtitle, color: colors.ink },
  memoryText: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
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
    backgroundColor: colors.panelRaised,
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
  modalCard: { width: '100%', maxHeight: '88%', backgroundColor: colors.panel, borderRadius: radius.xl, overflow: 'hidden' },
  previewImage: { width: '100%', aspectRatio: 1 },
  previewNote: { minHeight: 240, padding: spacing.xl, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.accentLight },
  previewFoodIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  previewNoteLabel: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  previewNoteText: { ...typography.title, color: colors.accentDarker },
  previewBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  previewBodyCopy: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  previewTitle: { ...typography.title, color: colors.ink },
  previewTime: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  deleteButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.errorLight, alignItems: 'center', justifyContent: 'center' },
  closePreview: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  textModalCard: { width: '100%', maxHeight: '90%', backgroundColor: colors.panel, borderRadius: radius.xl },
  textModalContent: { padding: spacing.lg, gap: spacing.md },
  textModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  textModalEyebrow: { ...typography.overline, color: colors.accent },
  textModalTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center' },
  memorySlotNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  memorySlotArrow: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memorySlotArrowDisabled: { opacity: 0.38 },
  memorySlotCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  memorySlotLabel: { ...typography.overline, color: colors.accent, textTransform: 'uppercase' },
  memorySlotValue: { ...typography.title, color: colors.ink, marginTop: 1 },
  memorySlotDate: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  memorySessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    padding: spacing.md,
  },
  memorySessionScore: {
    width: 68,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  memorySessionValue: { ...typography.title, color: colors.accent },
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
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confettiLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    top: '34%',
    borderRadius: 3,
  },
  saveToast: {
    width: '100%',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadows.card,
  },
  saveToastIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pointsBurst: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    minWidth: 54,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pointsBurstText: { ...typography.subtitle, color: colors.white, fontWeight: '900' },
  saveToastTitle: { ...typography.hero, color: colors.ink, textAlign: 'center' },
  saveToastMeal: { ...typography.overline, color: colors.accent, textTransform: 'uppercase', marginTop: spacing.xs },
  saveToastNote: { ...typography.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm },
});
