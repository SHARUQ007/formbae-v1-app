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
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
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

const meals: Array<{ type: MealType; icon: string; label: string; hint: string }> = [
  { type: 'Breakfast', icon: 'sunrise', label: 'Morning', hint: 'After waking' },
  { type: 'Lunch', icon: 'sun', label: 'Afternoon', hint: 'Midday food' },
  { type: 'Dinner', icon: 'sunset', label: 'Evening', hint: 'Later meal' },
  { type: 'Snack', icon: 'moon', label: 'Night', hint: 'Late bites' },
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
  const time = new Date(entry.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
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

function mealTime(type: MealType) {
  if (type === 'Breakfast') return { hour: 8, minute: 30 };
  if (type === 'Lunch') return { hour: 13, minute: 30 };
  if (type === 'Dinner') return { hour: 19, minute: 30 };
  return { hour: 22, minute: 0 };
}

function timestampForFoodSlot(value: Date, mealType: MealType) {
  const slot = mealTime(mealType);
  const next = new Date(value);
  next.setHours(slot.hour, slot.minute, 0, 0);
  return next.toISOString();
}

function mealLabel(type: MealType) {
  return meals.find((meal) => meal.type === type)?.label || type;
}

function mealForCurrentTime(now = new Date()): MealType {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 16 && hour < 21) return 'Dinner';
  return 'Snack';
}

function nextFeedbackText(feedback?: DietCoachFeedback | null) {
  if (!feedback?.generatedAt) return 'Next feedback in 7 days';
  const generated = new Date(feedback.generatedAt);
  if (Number.isNaN(generated.getTime())) return 'Next feedback in 7 days';
  const next = new Date(generated);
  next.setDate(next.getDate() + 7);
  const diff = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diff <= 0) return 'Next feedback due now';
  if (diff === 1) return 'Next feedback in 1 day';
  return `Next feedback in ${diff} days`;
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
      <Feather name={icon} size={18} color={active ? colors.white : colors.inkMuted} />
      <Text style={[styles.dietTabText, active && styles.dietTabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DietScreen(props: Props) {
  return <DietScreenContent {...props} />;
}

function DietScreenContent({ route, navigation }: Props) {
  const [entries, setEntries] = useState<DietDiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => route.params?.mealType || mealForCurrentTime());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dietFeedback, setDietFeedback] = useState<DietCoachFeedback | null>(null);
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [savedMeal, setSavedMeal] = useState<{ mealType: MealType; note: string } | null>(null);
  const [memorySessionPoints, setMemorySessionPoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'log' | 'diary'>('log');
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const celebrationProgress = useRef(new Animated.Value(0)).current;
  const handledCameraRequestRef = useRef<number | null>(null);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const local = await loadDietDiaryEntries();
    setEntries(local);
    try {
      const remote = await loadDietDiaryCached({ force: options?.force });
      setDietFeedback(remote.feedback ?? null);
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
  const diarySections = useMemo(() => {
    const sections: Array<{ key: string; title: string; entries: DietDiaryEntry[] }> = [];
    const byDate = new Map<string, DietDiaryEntry[]>();
    [...entries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((entry) => {
        const date = new Date(entry.createdAt);
        const key = Number.isNaN(date.getTime()) ? 'unknown' : date.toDateString();
        const bucket = byDate.get(key) ?? [];
        bucket.push(entry);
        byDate.set(key, bucket);
      });
    byDate.forEach((dateEntries, key) => {
      const sortedDateEntries = [...dateEntries].sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
      sections.push({
        key,
        title: key === 'unknown' ? 'Unknown date' : formatDiaryDate(new Date(dateEntries[0].createdAt)),
        entries: sortedDateEntries,
      });
    });
    return sections;
  }, [entries]);
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
      const localEntry = await addDietDiaryEntry(asset, mealType, undefined, timestampForFoodSlot(selectedDate, mealType));
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
      const localEntry = await addTextDietDiaryEntry(entryMeal, note, timestampForFoodSlot(entryDate, entryMeal));
      setTextEntry('');
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
                        <Text style={styles.diaryFoodName} numberOfLines={2}>
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
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <ScreenTitle>Diet</ScreenTitle>

        <View style={styles.dietTabs}>
          <DietTab label="Log" icon="plus-circle" active={activeTab === 'log'} onPress={() => setActiveTab('log')} />
          <DietTab label="Diary" icon="book-open" active={activeTab === 'diary'} onPress={() => setActiveTab('diary')} />
        </View>

        {activeTab === 'diary' ? (
          <View style={styles.diaryScreen}>
            <View style={styles.feedbackHero}>
              <View style={styles.feedbackHeroIcon}>
                <Feather name="message-circle" size={24} color={colors.white} />
              </View>
              <View style={styles.feedbackHeroText}>
                <Text style={styles.feedbackEyebrow}>Weekly diet feedback</Text>
                <Text style={styles.feedbackTitle}>{dietFeedback?.title || 'Ava will review your meals'}</Text>
                <Text style={styles.feedbackMeta}>{nextFeedbackText(dietFeedback)}</Text>
              </View>
            </View>

            <Card style={styles.feedbackCard}>
              <Text style={styles.feedbackSectionTitle}>What you are eating</Text>
              <Text style={styles.feedbackBody}>
                {dietFeedback?.summary || 'Log a few meals with photos or the memory game so Ava can summarize your eating pattern.'}
              </Text>
              {dietFeedback?.stats.recentFoods?.length ? (
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
                {dietFeedback?.nextFocus || 'Keep logging normally. Ava will use your actual meals to suggest simple swaps and additions.'}
              </Text>
              {dietFeedback?.highlights?.length ? (
                <View style={styles.feedbackList}>
                  {dietFeedback.highlights.slice(0, 4).map((highlight) => (
                    <View key={highlight} style={styles.feedbackListItem}>
                      <Feather name="check" size={16} color={colors.white} />
                      <Text style={styles.feedbackListText}>{highlight}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>

            <View style={styles.feedbackStatsCard}>
              <View style={styles.feedbackStat}>
                <Text style={styles.feedbackStatValue}>{dietFeedback?.stats.loggedItems ?? entries.length}</Text>
                <Text style={styles.feedbackStatLabel}>logged</Text>
              </View>
              <View style={styles.feedbackStatDivider} />
              <View style={styles.feedbackStat}>
                <Text style={styles.feedbackStatValue}>{dietFeedback?.stats.daysLogged ?? new Set(entries.map((entry) => new Date(entry.createdAt).toDateString())).size}</Text>
                <Text style={styles.feedbackStatLabel}>days</Text>
              </View>
              <View style={styles.feedbackStatDivider} />
              <View style={styles.feedbackStat}>
                <Text style={styles.feedbackStatValue}>{dietFeedback?.stats.memoryEntries ?? totalMemoryPoints}</Text>
                <Text style={styles.feedbackStatLabel}>memory</Text>
              </View>
            </View>

            <PrimaryButton title="Start memory game" icon="plus" onPress={() => { setActiveTab('log'); openMemoryGame(); }} style={styles.feedbackCta} />

            {renderDiaryFeed()}
          </View>
        ) : (
          <>
            <View style={styles.logPanel}>
              <View style={styles.logHero}>
                <View style={styles.logHeroTop}>
                  <Text style={styles.logEyebrow}>Food logging</Text>
                  <View style={styles.logScorePill}>
                    <Text style={styles.logScorePillValue}>{memoryPoints}</Text>
                    <Text style={styles.logScorePillLabel}>today</Text>
                  </View>
                </View>
                <Text style={styles.logTitle}>Remember what you ate</Text>
                <Text style={styles.logCopy}>{totalMemoryPoints} lifetime points · add one item at a time</Text>
              </View>

              <View style={styles.logControlsCard}>
                <View style={styles.dateNavigator}>
                  <TouchableOpacity
                    onPress={() => setSelectedDate((value) => shiftDate(value, -1))}
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
                    onPress={() => setSelectedDate((value) => shiftDate(value, 1))}
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
                    return (
                      <TouchableOpacity
                        key={meal.type}
                        activeOpacity={0.85}
                        onPress={() => setSelectedMeal(meal.type)}
                        style={[styles.mealPill, selected && styles.mealPillSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Select ${meal.label}`}
                      >
                        <Feather name={meal.icon} size={16} color={selected ? colors.white : colors.inkMuted} />
                        <Text style={[styles.mealPillText, selected && styles.mealPillTextSelected]}>{meal.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.actions}>
                <PrimaryButton title="Start memory game" icon="plus" onPress={openMemoryGame} loading={saving} />
                <View style={styles.secondaryActionRow}>
                  <PrimaryButton title="Photo" icon="camera" variant="secondary" onPress={() => addFromCamera()} disabled={saving} style={styles.secondaryAction} />
                  <PrimaryButton title="Upload" icon="image" variant="secondary" onPress={addFromLibrary} disabled={saving} style={styles.secondaryAction} />
                </View>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.86} style={styles.feedbackPreview} onPress={() => setActiveTab('diary')}>
              <View style={styles.feedbackPreviewIcon}>
                <Feather name="message-circle" size={19} color={colors.white} />
              </View>
              <View style={styles.feedbackPreviewText}>
                <Text style={styles.feedbackPreviewTitle}>Weekly feedback</Text>
                <Text style={styles.feedbackPreviewCopy}>{nextFeedbackText(dietFeedback)}</Text>
              </View>
              <Feather name="chevron-right" size={22} color={colors.inkMuted} />
            </TouchableOpacity>
          </>
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
              <Feather name="award" size={34} color={colors.white} />
            </View>
            <View style={styles.pointsBurst}>
              <Text style={styles.pointsBurstText}>+1</Text>
            </View>
            <Text style={styles.saveToastTitle}>Nice memory</Text>
            <Text style={styles.saveToastMeal}>{mealLabel(savedMeal.mealType)}</Text>
            <Text style={styles.saveToastNote} numberOfLines={2}>{savedMeal.note}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  dietTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  dietTab: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dietTabActive: { backgroundColor: colors.black },
  dietTabText: { ...typography.bodyBold, color: colors.inkMuted },
  dietTabTextActive: { color: colors.white },
  feedbackScreen: { gap: spacing.md },
  diaryScreen: { gap: spacing.md },
  feedbackHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 26,
    backgroundColor: colors.black,
    padding: spacing.lg,
    ...shadows.accent,
  },
  feedbackHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackHeroText: { flex: 1 },
  feedbackEyebrow: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  feedbackTitle: { ...typography.title, color: colors.white, marginTop: 2 },
  feedbackMeta: { ...typography.bodyBold, color: colors.onAccentMuted, marginTop: spacing.xs },
  feedbackCard: { gap: spacing.sm },
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
  feedbackList: { gap: spacing.xs, marginTop: spacing.xs },
  feedbackListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  feedbackListText: { ...typography.caption, color: colors.white, flex: 1, fontWeight: '800' },
  feedbackStatsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
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
    minWidth: 68,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  diaryFeedCountValue: { fontSize: 22, lineHeight: 25, fontWeight: '900', color: colors.white },
  diaryFeedCountLabel: { fontSize: 10, lineHeight: 12, color: colors.onAccentMuted, fontWeight: '800' },
  diaryFeed: { gap: spacing.lg },
  diaryDateSection: { gap: spacing.sm },
  diaryDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  diaryDateTitle: { ...typography.bodyBold, color: colors.ink },
  diaryDateCount: { ...typography.caption, color: colors.inkMuted },
  diaryList: { gap: spacing.sm },
  diaryListCard: {
    minHeight: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  diaryThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
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
    borderRadius: radius.xl,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  logHero: {
    borderRadius: 26,
    backgroundColor: colors.black,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  logHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  logScorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  logScorePillValue: { fontSize: 17, lineHeight: 20, fontWeight: '900', color: colors.black },
  logScorePillLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  logEyebrow: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  logTitle: { ...typography.title, color: colors.white },
  logCopy: { ...typography.caption, color: colors.onAccentMuted, lineHeight: 18 },
  logControlsCard: {
    borderRadius: 24,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  mealGridCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mealPill: {
    flexGrow: 1,
    minWidth: '47%',
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  mealPillSelected: { backgroundColor: colors.black, borderColor: colors.black },
  mealPillText: { ...typography.bodyBold, color: colors.inkMuted },
  mealPillTextSelected: { color: colors.white },
  feedbackPreview: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  feedbackPreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
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
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
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
  memoryScoreValue: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: colors.black },
  memoryScoreLabel: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },
  memoryTitle: { ...typography.subtitle, color: colors.ink },
  memoryText: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
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
