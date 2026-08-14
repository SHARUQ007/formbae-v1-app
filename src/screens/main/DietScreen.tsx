import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
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
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
} from 'react-native-image-picker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Circle } from 'react-native-svg';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { EmptyState } from '../../components/States';
import {
  addDietDiaryEntry,
  addSkippedDietDiaryEntry,
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
  uploadSkippedDietMeal,
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

const meals: Array<{
  type: MealType;
  icon: string;
  label: string;
  hint: string;
}> = [
  {
    type: 'Breakfast',
    icon: 'sunrise',
    label: 'Breakfast',
    hint: 'Morning meal',
  },
  { type: 'Lunch', icon: 'sun', label: 'Lunch', hint: 'Midday meal' },
  { type: 'Evening', icon: 'sunset', label: 'Evening', hint: 'Evening meal' },
  { type: 'Dinner', icon: 'moon', label: 'Dinner', hint: 'Night meal' },
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
  return meals.find(meal => meal.type === type)?.label || type;
}

/** Ava regenerates the diet report on a fixed weekly cadence (backend: FEEDBACK_INTERVAL_DAYS). */
const REPORT_CYCLE_DAYS = 7;

function reportDaysLeft(feedback?: DietCoachFeedback | null) {
  const days = feedback?.nextInDays ?? REPORT_CYCLE_DAYS;
  return Math.max(1, Math.round(days));
}

function reportCycleProgress(feedback?: DietCoachFeedback | null) {
  const remaining = reportDaysLeft(feedback);
  const elapsed = (REPORT_CYCLE_DAYS - remaining) / REPORT_CYCLE_DAYS;
  return Math.max(0, Math.min(1, elapsed));
}

function reportCountdownText(feedback?: DietCoachFeedback | null) {
  const days = reportDaysLeft(feedback);
  return `Next diet report generated in ${days} day${days === 1 ? '' : 's'}`;
}

function isMemoryEntry(entry: DietDiaryEntry) {
  return entry.kind === 'text' || (!entry.uri && Boolean(entry.note?.trim()));
}

function isSkippedEntry(entry: DietDiaryEntry) {
  return entry.status === 'skipped' || entry.kind === 'skip';
}

function uniqueMemoryEntries(entries: DietDiaryEntry[]) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    if (!isMemoryEntry(entry)) return false;
    const key = entry.remoteId || entry.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FoodPointsBadge({ points }: { points: number }) {
  const star = useRef(new Animated.Value(0)).current;
  const number = useRef(new Animated.Value(1)).current;
  const previousPoints = useRef(points);

  useEffect(() => {
    const gainedPoints = points > previousPoints.current;
    previousPoints.current = points;
    star.setValue(0);
    number.setValue(1);

    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(star, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(star, {
          toValue: 0,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      gainedPoints
        ? Animated.sequence([
            Animated.spring(number, {
              toValue: 1.2,
              friction: 4,
              tension: 150,
              useNativeDriver: true,
            }),
            Animated.spring(number, {
              toValue: 1,
              friction: 5,
              tension: 130,
              useNativeDriver: true,
            }),
          ])
        : Animated.delay(0),
    ]);
    animation.start();
    return () => animation.stop();
  }, [number, points, star]);

  const starScale = star.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.28],
  });
  const starRotate = star.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '16deg'],
  });
  const glowOpacity = star.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0.3, 0],
  });
  const glowScale = star.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.5],
  });

  return (
    <View
      style={styles.pointsBadge}
      accessibilityLabel={`${points} food logging points`}
    >
      <View style={styles.pointsStarWrap}>
        <Animated.View
          style={[
            styles.pointsStarGlow,
            { opacity: glowOpacity, transform: [{ scale: glowScale }] },
          ]}
        />
        <Animated.View
          style={{ transform: [{ scale: starScale }, { rotate: starRotate }] }}
        >
          <Feather name="star" size={17} color={colors.gold} />
        </Animated.View>
      </View>
      <Animated.Text
        style={[styles.pointsValue, { transform: [{ scale: number }] }]}
      >
        {points}
      </Animated.Text>
    </View>
  );
}

function ReportRing({
  days,
  progress,
  size = 58,
}: {
  days: number;
  progress: number;
  size?: number;
}) {
  const stroke = size >= 80 ? 6 : 5;
  const center = size / 2;
  const ringRadius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dash = Math.max(clamped * circumference, clamped > 0 ? 3 : 0);

  return (
    <View style={[styles.reportRing, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={ringRadius}
          stroke={colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.reportRingCenter}>
        <Text
          style={[styles.reportRingValue, size >= 80 && styles.reportRingValueLarge]}
        >
          {days}
        </Text>
        <Text style={styles.reportRingUnit}>{days === 1 ? 'DAY' : 'DAYS'}</Text>
      </View>
    </View>
  );
}

function imageSource(entry: DietDiaryEntry) {
  const uri = resolveDietDiaryImageUrl(entry.remoteImageUrl || entry.uri || '');
  const token = getAuthToken();
  if (uri.startsWith('http') && token) {
    return { uri, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri };
}

function imageMimeForUri(uri: string) {
  const clean = uri.toLowerCase().split('?')[0];
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.heic') || clean.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

export function DietScreen(props: Props) {
  return <DietScreenContent {...props} />;
}

function DietScreenContent({ route, navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [entries, setEntries] = useState<DietDiaryEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState('');
  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => {
    const requested = route.params?.mealType;
    return requested && !isMealSlotInFuture(new Date(), requested)
      ? requested
      : mealForCurrentTime();
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dietFeedback, setDietFeedback] = useState<DietCoachFeedback | null>(
    null,
  );
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [savedMeal, setSavedMeal] = useState<{
    mealType: MealType;
    note: string;
  } | null>(null);
  const [memorySessionPoints, setMemorySessionPoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'log' | 'diary' | 'report'>('log');
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const handledCameraRequestRef = useRef<number | null>(null);

  const load = useCallback(
    async (options?: { force?: boolean; retryPending?: boolean }) => {
      const local = await loadDietDiaryEntries();
      setEntries(local);
      try {
        const remote = await loadDietDiaryCached({ force: options?.force });
        setDietFeedback(remote.feedback ?? null);
        let merged = await mergeRemoteDietDiaryEntries(remote.entries);

        if (options?.retryPending) {
          const pendingTextEntries = merged.filter(
            entry =>
              isMemoryEntry(entry) &&
              !entry.remoteId &&
              Boolean(entry.note?.trim()),
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
                  syncError:
                    error instanceof Error
                      ? error.message
                      : 'Could not sync meal yet.',
                });
              }
            }
            merged = await loadDietDiaryEntries();
          }

          const pendingSkippedEntries = merged.filter(
            entry => isSkippedEntry(entry) && !entry.remoteId,
          );
          for (const entry of pendingSkippedEntries) {
            try {
              const uploaded = await uploadSkippedDietMeal({
                clientId: entry.id,
                mealType: entry.mealType,
                createdAt: entry.createdAt,
              });
              await updateDietDiaryEntry(entry.id, {
                remoteId: uploaded.entry.entryId,
                createdAt: uploaded.entry.createdAt,
                loggedAt: uploaded.entry.loggedAt || entry.loggedAt,
                syncedAt: new Date().toISOString(),
                syncError: undefined,
              });
            } catch (error) {
              await updateDietDiaryEntry(entry.id, {
                syncError:
                  error instanceof Error
                    ? error.message
                    : 'Could not sync skipped meal yet.',
              });
            }
          }
          if (pendingSkippedEntries.length)
            merged = await loadDietDiaryEntries();

          const pendingPhotoEntries = merged.filter(
            entry =>
              !isMemoryEntry(entry) && !entry.remoteId && Boolean(entry.uri),
          );
          for (const entry of pendingPhotoEntries) {
            try {
              const uploaded = await uploadDietDiaryEntry({
                clientId: entry.id,
                mealType: entry.mealType,
                note: entry.note,
                createdAt: entry.createdAt,
                asset: {
                  uri: entry.uri,
                  type: imageMimeForUri(entry.uri || ''),
                },
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
                syncError:
                  error instanceof Error
                    ? error.message
                    : 'Could not sync photo yet.',
              });
            }
          }
          if (pendingPhotoEntries.length) merged = await loadDietDiaryEntries();
        }

        setEntries(merged);
      } catch {
        // Offline/local-only mode is still useful for the diary.
      }
    },
    [],
  );

  useEffect(() => {
    load({ retryPending: true }).finally(() => setInitialLoading(false));
  }, [load]);

  const diarySections = useMemo(() => {
    const sections: Array<{
      key: string;
      title: string;
      entries: DietDiaryEntry[];
    }> = [];
    const byDate = new Map<string, DietDiaryEntry[]>();
    entries
      .filter(entry => !isSkippedEntry(entry))
      .sort((a, b) => entryTimestamp(b) - entryTimestamp(a))
      .forEach(entry => {
        const date = new Date(entry.createdAt);
        const key = Number.isNaN(date.getTime())
          ? 'unknown'
          : date.toDateString();
        const bucket = byDate.get(key) ?? [];
        bucket.push(entry);
        byDate.set(key, bucket);
      });
    byDate.forEach((dateEntries, key) => {
      // A diary is read from the current/latest meal backward through the day.
      const sortedDateEntries = [...dateEntries].sort(
        (a, b) => entryTimestamp(b) - entryTimestamp(a),
      );
      sections.push({
        key,
        title:
          key === 'unknown'
            ? 'Unknown date'
            : formatDiaryDate(new Date(dateEntries[0].createdAt)),
        entries: sortedDateEntries,
      });
    });
    return sections;
  }, [entries]);
  const weeklyMemoryPoints = useMemo(
    () =>
      uniqueMemoryEntries(
        entries.filter(entry => isDateInCurrentWeek(entry.createdAt)),
      ).length,
    [entries],
  );
  const selectedDateEntries = useMemo(
    () =>
      entries
        .filter(
          entry =>
            !isSkippedEntry(entry) && isSameDay(entry.createdAt, selectedDate),
        )
        .sort((a, b) => entryTimestamp(b) - entryTimestamp(a)),
    [entries, selectedDate],
  );
  const selectedDateSkips = useMemo(
    () =>
      entries.filter(
        entry =>
          isSkippedEntry(entry) && isSameDay(entry.createdAt, selectedDate),
      ),
    [entries, selectedDate],
  );
  const unsyncedCount = useMemo(
    () => entries.filter(entry => Boolean(entry.syncError)).length,
    [entries],
  );
  const reportReady = dietFeedback?.status === 'ready';
  const reportDays = reportDaysLeft(dietFeedback);
  const reportProgress = reportCycleProgress(dietFeedback);
  const reportCountdown = reportCountdownText(dietFeedback);
  const reportStats = dietFeedback?.stats;
  const canGoForward =
    !isSameDay(selectedDate, new Date()) &&
    !isFutureDay(shiftDate(selectedDate, 1));
  const canMoveMemoryForward = useMemo(
    () => Boolean(nextMemorySlot(selectedDate, selectedMeal)),
    [selectedDate, selectedMeal],
  );
  const selectedMealEntryCount = selectedDateEntries.filter(
    entry => entry.mealType === selectedMeal,
  ).length;
  const selectedMealSkip = selectedMealEntryCount
    ? undefined
    : selectedDateSkips.find(entry => entry.mealType === selectedMeal);
  const selectedLoggedMealTypes = new Set(
    selectedDateEntries.map(entry => entry.mealType),
  );
  const selectedSkippedMealTypes = new Set(
    selectedDateSkips
      .filter(entry => !selectedLoggedMealTypes.has(entry.mealType))
      .map(entry => entry.mealType),
  );

  const moveMemorySlot = useCallback(
    (direction: -1 | 1) => {
      const next =
        direction < 0
          ? previousMemorySlot(selectedDate, selectedMeal)
          : nextMemorySlot(selectedDate, selectedMeal);
      if (!next) return;
      setSelectedDate(next.date);
      setSelectedMeal(next.mealType);
    },
    [selectedDate, selectedMeal],
  );

  const changeSelectedDate = useCallback(
    (direction: -1 | 1) => {
      setSelectedDate(value => {
        const next = shiftDate(value, direction);
        if (
          isSameDay(next, new Date()) &&
          isMealSlotInFuture(next, selectedMeal)
        ) {
          setSelectedMeal(mealForCurrentTime());
        }
        return next;
      });
    },
    [selectedMeal],
  );

  const selectMeal = useCallback(
    (mealType: MealType) => {
      if (isMealSlotInFuture(selectedDate, mealType)) return;
      setSelectedMeal(mealType);
    },
    [selectedDate],
  );

  const saveAsset = useCallback(
    async (
      asset?: Asset,
      mealType: MealType = selectedMeal,
      mealDate: Date = selectedDate,
    ) => {
      if (!asset?.uri) return;
      setSaving(true);
      try {
        const loggedMeal = isMealSlotInFuture(mealDate, mealType)
          ? mealForCurrentTime()
          : mealType;
        const localEntry = await addDietDiaryEntry(
          asset,
          loggedMeal,
          undefined,
          timestampForFoodSlot(mealDate, loggedMeal),
        );
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
            syncError:
              uploadError instanceof Error
                ? uploadError.message
                : 'Could not sync photo yet.',
          });
          await load();
        }
      } catch (e) {
        Alert.alert(
          'Could not save photo',
          e instanceof Error ? e.message : 'Please try again.',
        );
      } finally {
        setSaving(false);
      }
    },
    [load, selectedDate, selectedMeal],
  );

  const addFromCamera = useCallback(
    async (
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
    },
    [saveAsset, selectedDate, selectedMeal],
  );

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

  const showSavedMealAnimation = useCallback(
    (mealType: MealType, note: string) => {
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
        Animated.delay(900),
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
      ]).start(() => setSavedMeal(null));
    },
    [saveToastOpacity, saveToastScale],
  );

  const saveTextEntry = async (options?: {
    finishAfterSave?: boolean;
    moveToPreviousMissed?: boolean;
  }) => {
    const note = textEntry.trim();
    if (!note) {
      Alert.alert('Add food', 'Write one food or meal before saving.');
      return false;
    }
    setSaving(true);
    const entryMeal = selectedMeal;
    const entryDate = selectedDate;
    try {
      const localEntry = await addTextDietDiaryEntry(
        entryMeal,
        note,
        timestampForFoodSlot(entryDate, entryMeal),
      );
      const entriesAfterSave = [
        localEntry,
        ...entries.filter(entry => entry.id !== localEntry.id),
      ];
      setEntries(entriesAfterSave);
      setTextEntry('');
      setMemorySessionPoints(points => points + 1);
      showSavedMealAnimation(entryMeal, note);
      if (options?.finishAfterSave) {
        setTextModalOpen(false);
        setActiveTab('diary');
      } else if (options?.moveToPreviousMissed) {
        const previousMissed = previousUnloggedMealSlot(
          entryDate,
          entryMeal,
          slot =>
            entriesAfterSave.some(
              entry =>
                entry.mealType === slot.mealType &&
                isSameDay(entry.createdAt, slot.date),
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
          syncError:
            uploadError instanceof Error
              ? uploadError.message
              : 'Could not sync meal yet.',
        });
        await load();
      }
      return true;
    } catch (e) {
      Alert.alert(
        'Could not save meal',
        e instanceof Error ? e.message : 'Please try again.',
      );
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

  const closeTextEditor = () => {
    if (saving) return;
    if (!textEntry.trim()) {
      setTextModalOpen(false);
      return;
    }
    Alert.alert('Discard this meal note?', 'Your unsaved text will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => setTextModalOpen(false),
      },
    ]);
  };

  const openMemoryGame = () => {
    setMemorySessionPoints(0);
    setTextEntry('');
    setTextModalOpen(true);
  };

  const markMealSkipped = async () => {
    if (saving || selectedMealEntryCount || selectedMealSkip) return;
    setSaving(true);
    try {
      const localEntry = await addSkippedDietDiaryEntry(
        selectedMeal,
        timestampForFoodSlot(selectedDate, selectedMeal),
      );
      setEntries(current => [
        localEntry,
        ...current.filter(entry => entry.id !== localEntry.id),
      ]);
      try {
        const uploaded = await uploadSkippedDietMeal({
          clientId: localEntry.id,
          mealType: localEntry.mealType,
          createdAt: localEntry.createdAt,
        });
        await updateDietDiaryEntry(localEntry.id, {
          remoteId: uploaded.entry.entryId,
          createdAt: uploaded.entry.createdAt,
          loggedAt: uploaded.entry.loggedAt || localEntry.loggedAt,
          syncedAt: new Date().toISOString(),
          syncError: undefined,
        });
        await load({ force: true });
      } catch (error) {
        await updateDietDiaryEntry(localEntry.id, {
          syncError:
            error instanceof Error
              ? error.message
              : 'Could not sync skipped meal yet.',
        });
        await load();
      }
    } catch (error) {
      Alert.alert(
        'Could not skip meal',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const undoMealSkipped = async () => {
    if (saving || !selectedMealSkip) return;
    setSaving(true);
    try {
      if (selectedMealSkip.remoteId)
        await deleteRemoteDietDiaryEntry(selectedMealSkip.remoteId);
      await deleteDietDiaryEntry(selectedMealSkip.id);
      setEntries(current =>
        current.filter(entry => entry.id !== selectedMealSkip.id),
      );
      await load({ force: Boolean(selectedMealSkip.remoteId) });
    } catch (error) {
      Alert.alert(
        'Could not undo skip',
        error instanceof Error
          ? error.message
          : 'Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true, retryPending: true });
    setRefreshing(false);
  };

  useEffect(() => {
    const requestId =
      route.params?.action === 'camera' ? route.params.requestId : undefined;
    if (!requestId || handledCameraRequestRef.current === requestId) return;
    handledCameraRequestRef.current = requestId;
    const currentDate = new Date();
    const requestedMeal = route.params?.mealType || selectedMeal;
    const mealType = isMealSlotInFuture(currentDate, requestedMeal)
      ? mealForCurrentTime(currentDate)
      : requestedMeal;
    setSelectedDate(currentDate);
    setSelectedMeal(mealType);
    navigation.setParams({
      action: undefined,
      requestId: undefined,
      mealType: undefined,
    });
    const timer = setTimeout(() => addFromCamera(mealType, currentDate), 250);
    return () => clearTimeout(timer);
  }, [
    route.params?.action,
    route.params?.requestId,
    route.params?.mealType,
    selectedMeal,
    navigation,
    addFromCamera,
  ]);

  useEffect(() => {
    if (route.params?.action === 'camera' || !route.params?.mealType) return;
    const currentDate = new Date();
    const requestedMeal = route.params.mealType;
    setSelectedDate(currentDate);
    setSelectedMeal(
      isMealSlotInFuture(currentDate, requestedMeal)
        ? mealForCurrentTime(currentDate)
        : requestedMeal,
    );
    navigation.setParams({ mealType: undefined });
  }, [route.params?.action, route.params?.mealType, navigation]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (
        route.params?.mealType ||
        route.params?.action === 'camera' ||
        textModalOpen
      )
        return;
      if (!isSameDay(selectedDate, new Date())) return;
      setSelectedMeal(mealForCurrentTime());
    });
    return unsub;
  }, [
    navigation,
    route.params?.action,
    route.params?.mealType,
    selectedDate,
    textModalOpen,
  ]);

  const confirmDelete = (entry: DietDiaryEntry) => {
    const isTextEntry = entry.kind === 'text' || !entry.uri;
    Alert.alert(
      isTextEntry ? 'Delete meal note?' : 'Delete food photo?',
      `This removes the ${
        isTextEntry ? 'note' : 'photo'
      } from your diet diary on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingEntryId(entry.id);
            try {
              if (entry.remoteId) {
                await deleteRemoteDietDiaryEntry(entry.remoteId);
              }
              await deleteDietDiaryEntry(entry.id);
              setPreview(null);
              await load({ force: true });
            } catch (error) {
              Alert.alert(
                'Could not delete entry',
                error instanceof Error
                  ? error.message
                  : 'Check your connection and try again.',
              );
            } finally {
              setDeletingEntryId('');
            }
          },
        },
      ],
    );
  };

  const renderEntryRow = (entry: DietDiaryEntry) => {
    const isTextEntry = entry.kind === 'text' || !entry.uri;
    return (
      <TouchableOpacity
        key={entry.id}
        activeOpacity={0.82}
        style={styles.entryRow}
        onPress={() => setPreview(entry)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${mealLabel(entry.mealType)} entry`}
      >
        <View style={[styles.entryThumb, isTextEntry && styles.entryThumbNote]}>
          {isTextEntry ? (
            <MaterialCommunityIcon
              name="silverware-fork-knife"
              size={19}
              color={colors.inkMuted}
            />
          ) : (
            <Image
              source={imageSource(entry)}
              style={styles.entryThumbImage}
              resizeMode="cover"
            />
          )}
        </View>
        <View style={styles.entryBody}>
          <Text style={styles.entryName} numberOfLines={1}>
            {isTextEntry ? entry.note : 'Food photo'}
          </Text>
          <Text style={styles.entryMeta} numberOfLines={1}>
            {mealLabel(entry.mealType)} · {formatFoodTime(entry.createdAt)}
          </Text>
        </View>
        {entry.syncError ? (
          <Feather name="cloud-off" size={15} color={colors.warn} />
        ) : null}
        <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
      </TouchableOpacity>
    );
  };

  const renderReportCard = () => (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.reportCard, reportReady && styles.reportCardReady]}
      onPress={() => setActiveTab('report')}
      accessibilityRole="button"
      accessibilityLabel={`Open diet report. ${reportCountdown}`}
    >
      <ReportRing days={reportDays} progress={reportProgress} />
      <View style={styles.reportCardCopy}>
        <View style={styles.reportCardEyebrowRow}>
          {reportReady ? <View style={styles.reportReadyDot} /> : null}
          <Text
            style={[
              styles.reportCardEyebrow,
              reportReady && styles.reportCardEyebrowReady,
            ]}
          >
            {reportReady ? 'REPORT READY' : 'DIET REPORT'}
          </Text>
        </View>
        <Text style={styles.reportCardTitle} numberOfLines={2}>
          {reportReady
            ? dietFeedback?.title || 'Your diet review is ready'
            : reportCountdown}
        </Text>
        <Text style={styles.reportCardMeta} numberOfLines={1}>
          {reportReady
            ? reportCountdown
            : `${reportStats?.daysLogged ?? 0} of ${REPORT_CYCLE_DAYS} days logged this week`}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
    </TouchableOpacity>
  );

  const renderLog = () => {
    const dateLabel = formatDiaryDate(selectedDate);
    // "Today"/"Yesterday" read as mid-sentence words; an explicit date does not.
    const dayPhrase = /^(Today|Yesterday)$/.test(dateLabel)
      ? dateLabel.toLowerCase()
      : dateLabel;
    const ctaTitle = selectedMealEntryCount
      ? `Add to ${mealLabel(selectedMeal)}`
      : `Log ${mealLabel(selectedMeal)}`;
    const ctaMeta = selectedMealEntryCount
      ? `${selectedMealEntryCount} item${
          selectedMealEntryCount === 1 ? '' : 's'
        } saved · ${dateLabel}`
      : `${dateLabel} · recall it in under a minute`;

    return (
      <>
        {renderReportCard()}

        {unsyncedCount ? (
          <TouchableOpacity
            style={styles.syncNotice}
            onPress={onRefresh}
            disabled={refreshing}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Retry syncing ${unsyncedCount} food log items`}
          >
            <Feather name="cloud-off" size={15} color={colors.gold} />
            <Text style={styles.syncNoticeText} numberOfLines={1}>
              {unsyncedCount} saved offline · tap to retry
            </Text>
            <Feather name="refresh-cw" size={15} color={colors.inkMuted} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.logCard}>
          <View style={styles.dayRow}>
            <TouchableOpacity
              onPress={() => changeSelectedDate(-1)}
              style={styles.dayArrow}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Feather name="chevron-left" size={20} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.dayCenter}>
              <Text style={styles.dayValue}>{dateLabel}</Text>
              <Text style={styles.dayMeta}>
                {selectedLoggedMealTypes.size} of {meals.length} meals logged
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => changeSelectedDate(1)}
              disabled={!canGoForward}
              style={[styles.dayArrow, !canGoForward && styles.dayArrowDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: !canGoForward }}
            >
              <Feather
                name="chevron-right"
                size={20}
                color={canGoForward ? colors.ink : colors.inkSubtle}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.mealRow}>
            {meals.map(meal => {
              const selected = selectedMeal === meal.type;
              const disabled = isMealSlotInFuture(selectedDate, meal.type);
              const loggedCount = selectedDateEntries.filter(
                entry => entry.mealType === meal.type,
              ).length;
              const skipped = selectedSkippedMealTypes.has(meal.type);
              return (
                <TouchableOpacity
                  key={meal.type}
                  activeOpacity={0.85}
                  onPress={() => selectMeal(meal.type)}
                  disabled={disabled}
                  style={[
                    styles.mealCell,
                    selected && styles.mealCellSelected,
                    disabled && styles.mealCellDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={`${meal.label}, ${meal.hint}${
                    loggedCount
                      ? `, ${loggedCount} logged`
                      : skipped
                      ? ', skipped'
                      : ', not logged'
                  }`}
                >
                  <Feather
                    name={meal.icon}
                    size={17}
                    color={
                      selected
                        ? colors.accentDarker
                        : disabled
                        ? colors.inkSubtle
                        : colors.inkMuted
                    }
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.mealCellLabel,
                      selected && styles.mealCellLabelSelected,
                      disabled && styles.mealCellLabelDisabled,
                    ]}
                  >
                    {meal.label}
                  </Text>
                  <View style={styles.mealCellStatus}>
                    {loggedCount ? (
                      <>
                        <Feather
                          name="check"
                          size={11}
                          color={
                            selected ? colors.accentDarker : colors.success
                          }
                        />
                        {loggedCount > 1 ? (
                          <Text
                            style={[
                              styles.mealCellCount,
                              selected && styles.mealCellCountSelected,
                            ]}
                          >
                            {loggedCount}
                          </Text>
                        ) : null}
                      </>
                    ) : skipped ? (
                      <Feather
                        name="minus"
                        size={11}
                        color={selected ? colors.accentDarker : colors.inkSubtle}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedMealSkip ? (
            <View style={styles.skippedPanel}>
              <Feather name="minus-circle" size={18} color={colors.gold} />
              <View style={styles.skippedCopy}>
                <Text style={styles.skippedTitle}>
                  {mealLabel(selectedMeal)} marked as skipped
                </Text>
                <Text style={styles.skippedMeta}>
                  Left out of your points and diet report.
                </Text>
              </View>
              <TouchableOpacity
                onPress={undoMealSkipped}
                disabled={saving}
                style={styles.undoSkipButton}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Undo skipped ${selectedMeal}`}
              >
                <Text style={styles.undoSkipText}>
                  {saving ? 'Saving…' : 'Undo'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.primaryCta}
                onPress={openMemoryGame}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`${ctaTitle}. ${ctaMeta}`}
              >
                <View style={styles.primaryCtaCopy}>
                  <Text style={styles.primaryCtaTitle} numberOfLines={1}>
                    {ctaTitle}
                  </Text>
                  <Text style={styles.primaryCtaMeta} numberOfLines={1}>
                    {ctaMeta}
                  </Text>
                </View>
                <View style={styles.primaryCtaIcon}>
                  <Feather
                    name="arrow-right"
                    size={19}
                    color={colors.primaryAction}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.quickActions}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  style={styles.quickAction}
                  onPress={() => addFromCamera()}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Take a photo for ${selectedMeal}`}
                >
                  <Feather name="camera" size={16} color={colors.inkMuted} />
                  <Text style={styles.quickActionText}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.82}
                  style={styles.quickAction}
                  onPress={addFromLibrary}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose a photo for ${selectedMeal}`}
                >
                  <Feather name="image" size={16} color={colors.inkMuted} />
                  <Text style={styles.quickActionText}>Gallery</Text>
                </TouchableOpacity>
                {!selectedMealEntryCount ? (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    style={styles.quickAction}
                    onPress={markMealSkipped}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${selectedMeal} as skipped`}
                  >
                    <Feather
                      name="minus-circle"
                      size={16}
                      color={colors.inkMuted}
                    />
                    <Text style={styles.quickActionText}>Skip</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meals logged</Text>
            {entries.length ? (
              <TouchableOpacity
                onPress={() => setActiveTab('diary')}
                accessibilityRole="button"
                accessibilityLabel="Open full food diary"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sectionLink}>Full diary</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {selectedDateEntries.length ? (
            <View style={styles.entryList}>
              {selectedDateEntries.slice(0, 4).map(renderEntryRow)}
              {selectedDateEntries.length > 4 ? (
                <TouchableOpacity
                  style={styles.entryMoreRow}
                  onPress={() => setActiveTab('diary')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="See all entries in the food diary"
                >
                  <Text style={styles.entryMoreText}>
                    +{selectedDateEntries.length - 4} more in the diary
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyDayRow}>
              <MaterialCommunityIcon
                name="silverware-fork-knife"
                size={17}
                color={colors.inkSubtle}
              />
              <Text style={styles.emptyDayText}>
                No meals logged for {dayPhrase} yet.
              </Text>
            </View>
          )}
        </View>
      </>
    );
  };

  const renderDiaryFeed = () => (
    <View style={styles.subpage}>
      {entries.length === 0 ? (
        <EmptyState
          icon="edit-3"
          title="No food logged yet"
          message="Add a meal note or photo. It is saved on this device first, then synced when a connection is available."
          actionLabel="Log your first meal"
          onAction={() => {
            setActiveTab('log');
            openMemoryGame();
          }}
        />
      ) : (
        diarySections.map(section => (
          <View key={section.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionMeta}>
                {section.entries.length} logged
              </Text>
            </View>
            <View style={styles.entryList}>
              {section.entries.map(renderEntryRow)}
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderReport = () => (
    <View style={styles.subpage}>
      <View style={styles.reportHero}>
        <ReportRing days={reportDays} progress={reportProgress} size={84} />
        <View style={styles.reportHeroCopy}>
          <Text style={styles.reportHeroEyebrow}>
            {reportReady ? 'LATEST REVIEW' : 'BUILDING YOUR FIRST REPORT'}
          </Text>
          <Text style={styles.reportHeroTitle}>
            {reportReady
              ? dietFeedback?.title || "Ava's diet review"
              : 'Ava is still reading your diary'}
          </Text>
          <Text style={styles.reportHeroMeta}>{reportCountdown}</Text>
        </View>
      </View>

      <View style={styles.reportStatsRow}>
        <View style={styles.reportStat}>
          <Text style={styles.reportStatValue}>
            {reportStats?.loggedItems ?? 0}
          </Text>
          <Text style={styles.reportStatLabel}>items</Text>
        </View>
        <View style={styles.reportStat}>
          <Text style={styles.reportStatValue}>
            {reportStats?.daysLogged ?? 0}
          </Text>
          <Text style={styles.reportStatLabel}>days</Text>
        </View>
        <View style={styles.reportStat}>
          <Text style={styles.reportStatValue}>
            {reportStats?.photoEntries ?? 0}
          </Text>
          <Text style={styles.reportStatLabel}>photos</Text>
        </View>
      </View>

      {!dietFeedback || dietFeedback.status === 'pending' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How your report is built</Text>
          <View style={styles.reportSteps}>
            {[
              'You log what you eat — a memory note takes seconds.',
              `Ava reviews the full ${REPORT_CYCLE_DAYS} days together, not one meal at a time.`,
              'You get a summary, what to change, and what to keep.',
            ].map((step, index) => (
              <View key={step} style={styles.reportStep}>
                <View style={styles.reportStepIndex}>
                  <Text style={styles.reportStepIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.reportStepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What you are eating</Text>
            <Text style={styles.reportBody}>
              {dietFeedback.summary ||
                'Log a few meals so Ava can review your eating pattern.'}
            </Text>
            {dietFeedback.stats?.recentFoods?.length ? (
              <View style={styles.foodPillRow}>
                {dietFeedback.stats.recentFoods.slice(0, 6).map(food => (
                  <View key={food} style={styles.foodPill}>
                    <Text style={styles.foodPillText}>{food}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What to eat next</Text>
            <Text style={styles.reportFocus}>
              {dietFeedback.nextFocus ||
                'Keep meals balanced and protein-forward.'}
            </Text>
            {dietFeedback.highlights?.length ? (
              <View style={styles.reportList}>
                {dietFeedback.highlights.slice(0, 4).map(highlight => (
                  <View key={highlight} style={styles.reportListItem}>
                    <Feather name="check" size={15} color={colors.gold} />
                    <Text style={styles.reportListText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </>
      )}

      <PrimaryButton
        title="Log a meal"
        icon="plus"
        onPress={() => setActiveTab('log')}
      />
    </View>
  );

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabBarHeight + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {activeTab === 'log' ? (
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle}>Diet</Text>
            <FoodPointsBadge points={weeklyMemoryPoints} />
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.headerIconButton}
              onPress={() => setActiveTab('diary')}
              accessibilityRole="button"
              accessibilityLabel="Open food diary"
            >
              <Feather name="book-open" size={17} color={colors.ink} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.screenHeader}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('log')}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Back to diet"
            >
              <Feather name="arrow-left" size={19} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.subpageTitle} numberOfLines={1}>
              {activeTab === 'diary' ? 'Food diary' : 'Diet report'}
            </Text>
            {activeTab === 'diary' ? (
              <View style={styles.diaryCountChip}>
                <Text style={styles.diaryCountText}>{entries.length}</Text>
              </View>
            ) : null}
          </View>
        )}

        {initialLoading ? (
          <View style={styles.initialLoading}>
            <View style={styles.loadingCard} />
            <View style={styles.loadingCardTall} />
            <Text style={styles.loadingText}>Loading your food log…</Text>
          </View>
        ) : activeTab === 'diary' ? (
          renderDiaryFeed()
        ) : activeTab === 'report' ? (
          renderReport()
        ) : (
          renderLog()
        )}
      </ScrollView>

      <Modal
        visible={!!preview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPreview(null)}
      >
        <ScreenContainer withBottomInset style={styles.detailScreen}>
          <View style={styles.modalScreenHeader}>
            <TouchableOpacity
              onPress={() => setPreview(null)}
              style={styles.modalCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close diary entry"
            >
              <Feather name="x" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.modalScreenTitle}>Diary entry</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>
          <ScrollView
            style={styles.modalScreenScroll}
            contentContainerStyle={styles.previewContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {preview?.uri ? (
              <Image
                source={imageSource(preview)}
                style={styles.previewImage}
                resizeMode="cover"
              />
            ) : preview ? (
              <View style={styles.previewNote}>
                <View style={styles.previewFoodIcon}>
                  <MaterialCommunityIcon
                    name="silverware-fork-knife"
                    size={28}
                    color={colors.accent}
                  />
                </View>
                <Text style={styles.previewNoteLabel}>Food item logged</Text>
                <Text style={styles.previewNoteText}>{preview.note}</Text>
              </View>
            ) : null}
            {preview ? (
              <View style={styles.previewBody}>
                <View style={styles.previewBodyCopy}>
                  <Text style={styles.previewTitle}>
                    {mealLabel(preview.mealType)}
                  </Text>
                  <Text style={styles.previewTime}>
                    {formatEntryTime(preview.createdAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => confirmDelete(preview)}
                  disabled={deletingEntryId === preview.id}
                  style={styles.deleteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Delete diary entry"
                  accessibilityState={{ busy: deletingEntryId === preview.id }}
                >
                  {deletingEntryId === preview.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Feather name="trash-2" size={20} color={colors.error} />
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </ScreenContainer>
      </Modal>

      <Modal
        visible={textModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeTextEditor}
      >
        <ScreenContainer withBottomInset style={styles.editorScreen}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editorKeyboardView}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorHeaderCopy}>
                <Text style={styles.editorEyebrow}>FOOD MEMORY</Text>
                <Text style={styles.editorTitle} numberOfLines={2}>
                  {memorySessionPoints
                    ? 'What else did you have?'
                    : 'What did you eat?'}
                </Text>
              </View>
              {memorySessionPoints ? (
                <View
                  style={styles.editorScore}
                  accessibilityLabel={`${memorySessionPoints} items added this session`}
                >
                  <Feather name="star" size={13} color={colors.gold} />
                  <Text style={styles.editorScoreText}>
                    {memorySessionPoints}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                onPress={closeTextEditor}
                style={styles.editorClose}
                accessibilityRole="button"
                accessibilityLabel="Close meal text entry"
              >
                <Feather name="x" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalScreenScroll}
              contentContainerStyle={styles.editorContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.slotRow}>
                <TouchableOpacity
                  onPress={() => moveMemorySlot(-1)}
                  style={styles.slotArrow}
                  accessibilityRole="button"
                  accessibilityLabel="Previous food memory slot"
                >
                  <Feather name="chevron-left" size={20} color={colors.ink} />
                </TouchableOpacity>
                <View style={styles.slotCenter}>
                  <Text style={styles.slotValue}>{mealLabel(selectedMeal)}</Text>
                  <Text style={styles.slotMeta}>
                    {formatDiaryDate(selectedDate)} ·{' '}
                    {formatFoodTime(
                      timestampForFoodSlot(selectedDate, selectedMeal),
                    )}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => moveMemorySlot(1)}
                  disabled={!canMoveMemoryForward}
                  style={[
                    styles.slotArrow,
                    !canMoveMemoryForward && styles.slotArrowDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Next food memory slot"
                  accessibilityState={{ disabled: !canMoveMemoryForward }}
                >
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={canMoveMemoryForward ? colors.ink : colors.inkSubtle}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                value={textEntry}
                onChangeText={setTextEntry}
                placeholder="One item, e.g. a banana"
                placeholderTextColor={colors.inkSubtle}
                multiline
                textAlignVertical="top"
                style={styles.textInput}
                maxLength={280}
                autoFocus
              />
              <Text style={styles.characterCount}>
                {textEntry.trim().length}/280
              </Text>
              <View style={styles.textModalActions}>
                <PrimaryButton
                  title={textEntry.trim() ? 'Save & finish' : 'Finish'}
                  variant="secondary"
                  onPress={finishMemoryGame}
                  disabled={saving}
                  style={styles.modalActionButton}
                />
                <PrimaryButton
                  title="Save & next"
                  icon="arrow-right"
                  onPress={() => saveTextEntry({ moveToPreviousMissed: true })}
                  loading={saving}
                  disabled={!textEntry.trim()}
                  style={styles.modalActionButton}
                />
              </View>
              <Text style={styles.editorFootnote}>
                Save &amp; next stores this item, then jumps to the nearest
                earlier meal you have not logged.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </ScreenContainer>
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
            <Feather name="check" size={18} color={colors.onPrimary} />
          </View>
          <View style={styles.saveToastCopy}>
            <Text style={styles.saveToastTitle}>Meal saved</Text>
            <Text style={styles.saveToastNote} numberOfLines={1}>
              {mealLabel(savedMeal.mealType)} · {savedMeal.note}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {},

  // Header
  screenHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  screenTitle: { ...typography.hero, color: colors.ink, flex: 1, minWidth: 0 },
  subpageTitle: { ...typography.title, color: colors.ink, flex: 1, minWidth: 0 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diaryCountChip: {
    minWidth: 36,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diaryCountText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '800',
  },
  pointsBadge: {
    minWidth: 56,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: 8,
  },
  pointsStarWrap: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsStarGlow: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
  },
  pointsValue: {
    minWidth: 14,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: colors.ink,
  },

  // Loading
  initialLoading: { gap: spacing.md },
  loadingCard: {
    height: 90,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
  },
  loadingCardTall: {
    height: 236,
    borderRadius: radius.lg,
    backgroundColor: colors.panelMuted,
  },
  loadingText: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },

  // Diet report countdown
  reportRing: { alignItems: 'center', justifyContent: 'center' },
  reportRingCenter: { position: 'absolute', alignItems: 'center' },
  reportRingValue: {
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
    color: colors.ink,
  },
  reportRingValueLarge: { fontSize: 30, lineHeight: 34 },
  reportRingUnit: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.9,
    fontWeight: '800',
    color: colors.inkSubtle,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reportCardReady: {
    borderColor: colors.accentSurface,
    backgroundColor: colors.panelWarm,
  },
  reportCardCopy: { flex: 1, minWidth: 0 },
  reportCardEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reportReadyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  reportCardEyebrow: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.inkSubtle,
  },
  reportCardEyebrowReady: { color: colors.accent },
  reportCardTitle: {
    ...typography.bodyBold,
    color: colors.ink,
    marginTop: 3,
  },
  reportCardMeta: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 3,
  },

  // Offline strip
  syncNotice: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.warnLight,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  syncNoticeText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },

  // Log card
  logCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayArrowDisabled: { opacity: 0.38 },
  dayCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  dayValue: { ...typography.subtitle, color: colors.ink },
  dayMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },

  // Meal selector
  mealRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.md,
  },
  mealCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 3,
  },
  mealCellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  mealCellDisabled: { opacity: 0.38 },
  mealCellLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  mealCellLabelSelected: { color: colors.accentDarker },
  mealCellLabelDisabled: { color: colors.inkSubtle },
  mealCellStatus: {
    height: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  mealCellCount: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: colors.success,
  },
  mealCellCountSelected: { color: colors.accentDarker },

  // Primary action
  primaryCta: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    paddingLeft: spacing.md,
    paddingRight: 10,
    marginTop: spacing.md,
  },
  primaryCtaCopy: { flex: 1, minWidth: 0 },
  primaryCtaTitle: { ...typography.button, color: colors.onPrimary },
  primaryCtaMeta: {
    ...typography.caption,
    color: colors.onPrimary,
    opacity: 0.62,
    marginTop: 1,
  },
  primaryCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  quickAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
  },
  quickActionText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
  },

  // Skipped meal
  skippedPanel: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.warnLight,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  skippedCopy: { flex: 1, minWidth: 0 },
  skippedTitle: { ...typography.bodyBold, color: colors.ink },
  skippedMeta: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 1,
  },
  undoSkipButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  undoSkipText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '900',
  },

  // Sections and entry rows
  subpage: {},
  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, flexShrink: 1 },
  sectionMeta: { ...typography.caption, color: colors.inkMuted },
  sectionLink: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '900',
  },
  entryList: { gap: 6 },
  entryRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.sm,
  },
  entryThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryThumbNote: {
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryThumbImage: { width: '100%', height: '100%' },
  entryBody: { flex: 1, minWidth: 0 },
  entryName: { ...typography.bodyBold, color: colors.ink },
  entryMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  entryMoreRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  entryMoreText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  emptyDayRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  emptyDayText: { ...typography.caption, color: colors.inkSubtle },

  // Report subpage
  reportHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reportHeroCopy: { flex: 1, minWidth: 0 },
  reportHeroEyebrow: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  reportHeroTitle: { ...typography.subtitle, color: colors.ink, marginTop: 3 },
  reportHeroMeta: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 3,
  },
  reportStatsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.lg,
  },
  reportStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  reportStatValue: { ...typography.title, color: colors.ink },
  reportStatLabel: { ...typography.caption, color: colors.inkMuted },
  reportSteps: { gap: spacing.sm },
  reportStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reportStepIndex: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    marginTop: 1,
  },
  reportStepIndexText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: colors.accent,
  },
  reportStepText: { ...typography.body, color: colors.inkMuted, flex: 1 },
  reportBody: { ...typography.body, color: colors.inkMuted },
  reportFocus: { ...typography.bodyBold, color: colors.ink },
  foodPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  foodPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  foodPillText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  reportList: { marginTop: spacing.sm, gap: spacing.sm },
  reportListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reportListText: { ...typography.body, color: colors.ink, flex: 1 },

  // Entry detail modal
  detailScreen: { paddingHorizontal: 0 },
  modalScreenHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCloseButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScreenTitle: { ...typography.bodyBold, color: colors.ink },
  modalHeaderSpacer: { width: 42 },
  modalScreenScroll: { flex: 1 },
  previewContent: { paddingBottom: spacing.xl },
  previewImage: { width: '100%', aspectRatio: 1 },
  previewNote: {
    minHeight: 240,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.panelWarm,
  },
  previewFoodIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  previewNoteLabel: {
    ...typography.overline,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  previewNoteText: { ...typography.title, color: colors.ink },
  previewBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  previewBodyCopy: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  previewTitle: { ...typography.title, color: colors.ink },
  previewTime: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Food memory editor
  editorScreen: { paddingHorizontal: spacing.lg },
  editorKeyboardView: { flex: 1 },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editorHeaderCopy: { flex: 1, minWidth: 0 },
  editorEyebrow: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  editorTitle: { ...typography.title, color: colors.ink, marginTop: 2 },
  editorScore: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    paddingHorizontal: 10,
  },
  editorScoreText: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: '900',
  },
  editorClose: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
  },
  slotArrow: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotArrowDisabled: { opacity: 0.38 },
  slotCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  slotValue: { ...typography.subtitle, color: colors.ink },
  slotMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
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
  characterCount: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'right',
    marginTop: -spacing.sm,
  },
  textModalActions: { flexDirection: 'row', gap: spacing.sm },
  modalActionButton: { flex: 1 },
  editorFootnote: {
    ...typography.caption,
    color: colors.inkSubtle,
    textAlign: 'center',
  },

  // Save toast
  saveToast: {
    position: 'absolute',
    top: 72,
    left: spacing.lg,
    right: spacing.lg,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  saveToastIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveToastCopy: { flex: 1, minWidth: 0 },
  saveToastTitle: { ...typography.bodyBold, color: colors.ink },
  saveToastNote: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 1,
  },
});
