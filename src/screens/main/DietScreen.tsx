import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  type Asset,
} from 'react-native-image-picker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, ScreenTitle } from '../../components/Card';
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
  updateRemoteDietDiaryEntry,
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

const mealAppearance: Record<
  MealType,
  { icon: string; color: string; backgroundColor: string }
> = {
  Breakfast: {
    icon: 'sunrise',
    color: colors.info,
    backgroundColor: colors.infoLight,
  },
  Lunch: {
    icon: 'sun',
    color: colors.gold,
    backgroundColor: colors.warnLight,
  },
  Evening: {
    icon: 'sunset',
    color: '#ef9b88',
    backgroundColor: 'rgba(239,155,136,0.12)',
  },
  Dinner: {
    icon: 'moon',
    color: '#b8a7ef',
    backgroundColor: 'rgba(184,167,239,0.12)',
  },
};

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

function formatReportPeriod(start?: string, end?: string) {
  const startDate = start ? new Date(`${start}T00:00:00`) : null;
  const endDate = end ? new Date(`${end}T00:00:00`) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return 'Last 7 days';
  const startLabel = startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (!endDate || Number.isNaN(endDate.getTime())) return `Week of ${startLabel}`;
  const endLabel = endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
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
          <Feather name="star" size={30} color={colors.gold} />
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
  const [editingEntry, setEditingEntry] = useState<DietDiaryEntry | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editMeal, setEditMeal] = useState<MealType>('Lunch');
  const [savingEdit, setSavingEdit] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [savedMeal, setSavedMeal] = useState<{
    mealType: MealType;
    note: string;
  } | null>(null);
  const [memorySessionPoints, setMemorySessionPoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'log' | 'diary' | 'report'>('log');
  const [reportReturnTab, setReportReturnTab] = useState<'log' | 'diary'>('log');
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const handledCameraRequestRef = useRef<number | null>(null);

  const load = useCallback(
    async (options?: { force?: boolean; retryPending?: boolean }) => {
      const local = await loadDietDiaryEntries();
      setEntries(local);
      // Local diary entries are enough to render the tab. Remote merging and
      // pending uploads can continue without holding the whole screen skeleton.
      setInitialLoading(false);
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
      mealCount: number;
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
        mealCount: new Set(dateEntries.map(entry => entry.mealType)).size,
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
  const weeklyPattern = useMemo(() => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const weekStart = shiftDate(today, -mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(weekStart, index);
      const dayEntries = entries.filter(
        entry => !isSkippedEntry(entry) && isSameDay(entry.createdAt, date),
      );
      return {
        key: date.toDateString(),
        label: date.toLocaleDateString('en-IN', { weekday: 'narrow' }),
        points: uniqueMemoryEntries(dayEntries).length,
        mealMoments: new Set(dayEntries.map(entry => entry.mealType)).size,
        isToday: isSameDay(date, today),
        isFuture: date.getTime() > today.getTime(),
      };
    });
  }, [entries]);
  const weeklyMealMoments = weeklyPattern.reduce(
    (total, day) => total + day.mealMoments,
    0,
  );
  const weeklyDaysSeen = weeklyPattern.filter(day => day.mealMoments > 0).length;
  const weeklyDiaryItems = useMemo(
    () =>
      entries.filter(
        entry =>
          !isSkippedEntry(entry) && isDateInCurrentWeek(entry.createdAt),
      ).length,
    [entries],
  );
  const weeklyPeak = Math.max(4, ...weeklyPattern.map(day => day.points));
  const reportEnrichmentScore = useMemo(() => {
    const reportGeneratedAt = timestampValue(dietFeedback?.generatedAt);
    const generatedAt = dietFeedback?.status === 'ready' && reportGeneratedAt > 0
      ? reportGeneratedAt
      : Date.now() - REPORT_CYCLE_DAYS * 24 * 60 * 60 * 1000;
    const cycleEntries = entries.filter(
      entry =>
        !isSkippedEntry(entry) &&
        // Use the time the memory was logged to make backfilled meals count
        // toward the new report cycle without changing their diary date.
        timestampValue(entry.loggedAt || entry.createdAt) > generatedAt,
    );
    const cycleDays = new Set(
      cycleEntries.map(entry => new Date(entry.createdAt).toDateString()),
    ).size;
    const cycleMealMoments = new Set(
      cycleEntries.map(
        entry => `${new Date(entry.createdAt).toDateString()}:${entry.mealType}`,
      ),
    ).size;
    const cycleItems = uniqueMemoryEntries(cycleEntries).length;
    return Math.min(
      100,
      Math.round(
        5 +
          (Math.min(cycleDays, 7) / 7) * 30 +
          (Math.min(cycleMealMoments, 14) / 14) * 40 +
          (Math.min(cycleItems, 21) / 21) * 25,
      ),
    );
  }, [dietFeedback?.generatedAt, dietFeedback?.status, entries]);
  const diaryEntryCount = useMemo(
    () => entries.filter(entry => !isSkippedEntry(entry)).length,
    [entries],
  );
  const todayMealMoments = useMemo(
    () =>
      new Set(
        entries
          .filter(
            entry =>
              !isSkippedEntry(entry) &&
              isSameDay(entry.createdAt, new Date()),
          )
          .map(entry => entry.mealType),
      ).size,
    [entries],
  );
  const usefulDayProgress = Math.min(todayMealMoments / 2, 1);
  const suggestedMemorySlot = useMemo(() => {
    const now = new Date();
    const currentMeal = mealForCurrentTime(now);
    const slotIsCovered = (slot: { date: Date; mealType: MealType }) =>
      entries.some(
        entry =>
          entry.mealType === slot.mealType &&
          isSameDay(entry.createdAt, slot.date),
      );
    return slotIsCovered({ date: now, mealType: currentMeal })
      ? previousUnloggedMealSlot(now, currentMeal, slotIsCovered)
      : { date: now, mealType: currentMeal };
  }, [entries]);
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
  const supportsDetailedReport =
    dietFeedback?.template?.id === 'weekly-diet-report' ||
    (dietFeedback?.schemaVersion ?? 0) >= 2;
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
    setSelectedDate(suggestedMemorySlot.date);
    setSelectedMeal(suggestedMemorySlot.mealType);
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

  const openEntryEditor = (entry: DietDiaryEntry) => {
    setPreview(null);
    setEditingEntry(entry);
    setEditNote(entry.note || '');
    setEditMeal(entry.mealType);
  };

  const saveEntryEdit = async () => {
    if (!editingEntry || savingEdit) return;
    const note = editNote.trim();
    const isTextEntry = editingEntry.kind === 'text' || !editingEntry.uri;
    if (isTextEntry && !note) {
      Alert.alert('Add food', 'The food description cannot be empty.');
      return;
    }
    setSavingEdit(true);
    try {
      if (editingEntry.remoteId) {
        await updateRemoteDietDiaryEntry(editingEntry.remoteId, {
          mealType: editMeal,
          note,
        });
      }
      await updateDietDiaryEntry(editingEntry.id, {
        mealType: editMeal,
        note: note || undefined,
        syncError: undefined,
      });
      setEntries(current =>
        current.map(entry =>
          entry.id === editingEntry.id
            ? { ...entry, mealType: editMeal, note: note || undefined }
            : entry,
        ),
      );
      setEditingEntry(null);
      if (editingEntry.remoteId) await load({ force: true });
    } catch (error) {
      Alert.alert(
        'Could not update meal',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const renderEntryRow = (entry: DietDiaryEntry) => {
    const isTextEntry = entry.kind === 'text' || !entry.uri;
    const appearance = mealAppearance[entry.mealType];
    return (
      <View
        key={entry.id}
        style={styles.entryRow}
      >
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.entryOpenAction}
          onPress={() => setPreview(entry)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${mealLabel(entry.mealType)} entry`}
        >
          <View
            style={[
              styles.entryMealIcon,
              { backgroundColor: appearance.backgroundColor },
            ]}
          >
            <Feather name={appearance.icon} size={19} color={appearance.color} />
          </View>
          <View style={styles.entryBody}>
            <Text style={[styles.entryMealLabel, { color: appearance.color }]}>
              {mealLabel(entry.mealType)} · {formatFoodTime(entry.createdAt)}
            </Text>
            <Text style={styles.entryName} numberOfLines={2}>
              {isTextEntry ? entry.note : entry.note || 'Food photo'}
            </Text>
          </View>
          {!isTextEntry ? (
            <Image
              source={imageSource(entry)}
              style={styles.entryPhoto}
              resizeMode="cover"
            />
          ) : null}
        </TouchableOpacity>
        {entry.syncError ? (
          <Feather name="cloud-off" size={15} color={colors.warn} />
        ) : null}
        <TouchableOpacity
          onPress={() => openEntryEditor(entry)}
          style={styles.entryEditButton}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${mealLabel(entry.mealType)} entry`}
        >
          <Feather name="edit-2" size={16} color={colors.inkMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderReportCard = () => (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.reportCard}
      onPress={() => {
        setReportReturnTab('log');
        setActiveTab('report');
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open diet report. ${reportCountdown}`}
    >
      <View style={styles.secondaryCardIcon}>
        <Feather name="file-text" size={20} color={colors.gold} />
      </View>
      <View style={styles.secondaryCardCopy}>
        <Text style={styles.secondaryCardTitle}>Weekly Diet Report</Text>
        <Text style={styles.secondaryCardMeta} numberOfLines={1}>
          Next report in {reportDays} day{reportDays === 1 ? '' : 's'}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={18}
        color={colors.inkSubtle}
        style={styles.secondaryCardChevron}
      />
    </TouchableOpacity>
  );

  const renderLog = () => {
    return (
      <>
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

        <View style={styles.memoryHero}>
          <View style={styles.memoryHeroTop}>
            <View style={styles.memoryHeroIcon}>
              <MaterialCommunityIcon
                name="silverware-fork-knife"
                size={24}
                color={colors.onPrimary}
              />
            </View>
            <View style={styles.memoryHeroBadge}>
              <Text style={styles.memoryHeroBadgeText}>Food memory</Text>
            </View>
          </View>
          <Text style={styles.memoryHeroTitle}>
            {todayMealMoments >= 2
              ? 'Your food memory is taking shape.'
              : `Remember your ${mealLabel(suggestedMemorySlot.mealType).toLowerCase()}?`}
          </Text>
          <Text style={styles.memoryHeroText}>
            {todayMealMoments >= 2
              ? 'Add another meal whenever it comes back to you.'
              : 'Recall it one item at a time. It usually takes less than a minute.'}
          </Text>
          <View style={styles.todayCoverage}>
            <View style={styles.todayCoverageCopy}>
              <Text style={styles.todayCoverageLabel}>Today</Text>
              <Text style={styles.todayCoverageValue}>
                {todayMealMoments >= 2
                  ? `${todayMealMoments} meal moments recalled`
                  : `${todayMealMoments} of 2 meal moments`}
              </Text>
            </View>
            <Feather
              name={todayMealMoments >= 2 ? 'check-circle' : 'circle'}
              size={18}
              color={todayMealMoments >= 2 ? colors.success : colors.inkSubtle}
            />
          </View>
          <View style={styles.todayCoverageTrack}>
            <View
              style={[
                styles.todayCoverageFill,
                { width: `${usefulDayProgress * 100}%` },
              ]}
            />
          </View>
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.primaryCta}
            onPress={openMemoryGame}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Play food memory game"
          >
            <View style={styles.primaryCtaCopy}>
              <Text style={styles.primaryCtaTitle}>Play memory game</Text>
              <Text style={styles.primaryCtaMeta}>
                {mealLabel(suggestedMemorySlot.mealType)} ·{' '}
                {formatDiaryDate(suggestedMemorySlot.date)}
              </Text>
            </View>
            <View style={styles.primaryCtaIcon}>
              <Feather name="arrow-right" size={19} color={colors.primaryAction} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.secondaryGrid}>
          {renderReportCard()}
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.secondaryCard}
            onPress={() => setActiveTab('diary')}
            accessibilityRole="button"
            accessibilityLabel={`Open food diary. ${weeklyDiaryItems} entries this week`}
          >
            <View style={styles.secondaryCardIcon}>
              <Feather name="book-open" size={20} color={colors.gold} />
            </View>
            <View style={styles.secondaryCardCopy}>
              <Text style={styles.secondaryCardTitle}>Food diary</Text>
              <Text style={styles.secondaryCardMeta} numberOfLines={1}>
                {weeklyDiaryItems} entr{weeklyDiaryItems === 1 ? 'y' : 'ies'} this week
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={18}
              color={colors.inkSubtle}
              style={styles.secondaryCardChevron}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.weeklyPatternCard}>
          <View style={styles.weeklyPatternHeader}>
            <View style={styles.weeklyPatternCopy}>
              <Text style={styles.weeklyPatternEyebrow}>THIS WEEK</Text>
              <Text style={styles.weeklyPatternTitle}>Your food pattern</Text>
            </View>
          </View>
          <View style={styles.weeklyPatternBars}>
            {weeklyPattern.map(day => {
              const fill = day.points
                ? `${Math.max(16, Math.round((day.points / weeklyPeak) * 100))}%`
                : '0%';
              return (
                <View key={day.key} style={styles.weeklyPatternDay}>
                  <View
                    style={[
                      styles.weeklyPatternTrack,
                      day.isToday && styles.weeklyPatternTrackToday,
                      day.isFuture && styles.weeklyPatternTrackFuture,
                    ]}
                  >
                    <View
                      style={[
                        styles.weeklyPatternFill,
                        { height: fill as `${number}%` },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.weeklyPatternDayLabel,
                      day.isToday && styles.weeklyPatternDayLabelToday,
                    ]}
                  >
                    {day.label}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.weeklyPatternFoot}>
            <Text style={styles.weeklyPatternFootText}>{weeklyDaysSeen} of 7 days</Text>
            <View style={styles.weeklyPatternFootDot} />
            <Text style={styles.weeklyPatternFootText}>{weeklyMealMoments} meal moments</Text>
          </View>
          <View style={styles.reportEnrichment}>
            <View style={styles.reportEnrichmentHead}>
              <Text style={styles.reportEnrichmentLabel}>Report enrichment</Text>
              <Text style={styles.reportEnrichmentValue}>{reportEnrichmentScore}%</Text>
            </View>
            <View style={styles.reportEnrichmentTrack}>
              <View
                style={[
                  styles.reportEnrichmentFill,
                  { width: `${reportEnrichmentScore}%` },
                ]}
              />
            </View>
            <Text style={styles.reportEnrichmentHint}>
              Log more meals to enrich your next report.
            </Text>
          </View>
        </View>
      </>
    );
  };

  const renderDiaryFeed = () => (
    <View style={styles.subpage}>
      {diaryEntryCount ? (
        <View style={styles.diarySummary}>
          <View style={styles.diarySummaryHeader}>
            <View>
              <Text style={styles.diarySummaryEyebrow}>THIS WEEK</Text>
              <Text style={styles.diarySummaryTitle}>At a glance</Text>
            </View>
            <View style={styles.diarySummaryHeaderIcon}>
              <Feather name="bar-chart-2" size={18} color={colors.gold} />
            </View>
          </View>
          <View style={styles.diarySummaryStats}>
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyDiaryItems} food items logged this week`}
            >
              <View style={styles.diarySummaryStatIcon}>
                <Feather name="layers" size={16} color={colors.gold} />
              </View>
              <Text style={styles.diarySummaryValue}>{weeklyDiaryItems}</Text>
              <Text style={styles.diarySummaryLabel}>Food items</Text>
            </View>
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyMealMoments} meals logged this week`}
            >
              <View style={styles.diarySummaryStatIcon}>
                <MaterialCommunityIcon name="silverware-fork-knife" size={17} color={colors.gold} />
              </View>
              <Text style={styles.diarySummaryValue}>{weeklyMealMoments}</Text>
              <Text style={styles.diarySummaryLabel}>Meals</Text>
            </View>
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyDaysSeen} of 7 active days this week`}
            >
              <View style={styles.diarySummaryStatIcon}>
                <Feather name="calendar" size={16} color={colors.gold} />
              </View>
              <View style={styles.diarySummaryValueRow}>
                <Text style={styles.diarySummaryValue}>{weeklyDaysSeen}</Text>
                <Text style={styles.diarySummaryValueSuffix}>/7</Text>
              </View>
              <Text style={styles.diarySummaryLabel}>Active days</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.diaryReportRow}
            onPress={() => {
              setReportReturnTab('diary');
              setActiveTab('report');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open diet report. ${reportCountdown}`}
          >
            <View style={styles.diaryReportIcon}>
              <Feather name={reportReady ? 'check' : 'clock'} size={16} color={colors.gold} />
            </View>
            <View style={styles.diaryReportCopy}>
              <Text style={styles.diaryReportTitle}>
                {reportReady ? 'Weekly report ready' : 'Weekly report in progress'}
              </Text>
              <Text style={styles.diaryReportMeta}>
                {reportReady
                  ? 'See patterns and coaching insights'
                  : `Ready in ${reportDays} day${reportDays === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.diaryReportAction}>
              <Text style={styles.diaryReportActionText}>{reportReady ? 'View' : 'Preview'}</Text>
              <Feather name="chevron-right" size={15} color={colors.gold} />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
      {diaryEntryCount ? (
        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.diaryMemoryCta}
          onPress={openMemoryGame}
          accessibilityRole="button"
          accessibilityLabel="Log more meals with Food Memory"
        >
          <View style={styles.diaryMemoryIcon}>
            <Feather name="plus" size={18} color={colors.gold} />
          </View>
          <View style={styles.diaryMemoryCopy}>
            <Text style={styles.diaryMemoryTitle}>Log more meals</Text>
            <Text style={styles.diaryMemoryMeta}>Add it to your food memory · about 1 min</Text>
          </View>
          <View style={styles.diaryMemoryArrow}>
            <Feather name="arrow-right" size={18} color={colors.primaryAction} />
          </View>
        </TouchableOpacity>
      ) : null}
      {diaryEntryCount === 0 ? (
        <EmptyState
          icon="edit-3"
          title="No food logged yet"
          message="Recall one food item at a time. It is saved on this device first, then synced when a connection is available."
          actionLabel="Play memory game"
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
              <View style={styles.sectionMetaPill}>
                <Text style={styles.sectionMeta}>
                  {section.mealCount} meal{section.mealCount === 1 ? '' : 's'} ·{' '}
                  {section.entries.length} item{section.entries.length === 1 ? '' : 's'}
                </Text>
              </View>
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
      {!dietFeedback || dietFeedback.status === 'pending' ? (
        <>
          <View style={styles.reportPendingHero}>
            <View style={styles.reportPendingIcon}>
              <Feather name="pie-chart" size={22} color={colors.gold} />
            </View>
            <Text style={styles.reportPendingEyebrow}>WEEKLY REPORT</Text>
            <Text style={styles.reportPendingTitle}>Your report is building</Text>
            <Text style={styles.reportPendingBody}>Log meals across the week. We’ll turn them into a score and a short action plan.</Text>
            <View style={styles.reportCountdownRow}>
              <Text style={styles.reportCountdownLabel}>Ready in</Text>
              <Text style={styles.reportCountdownDays}>{reportDays} day{reportDays === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.reportTrack}>
              <View style={[styles.reportTrackFill, { width: `${reportProgress * 100}%` }]} />
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.reportChapter}>
            <View style={styles.reportChapterNumber}><Text style={styles.reportChapterNumberText}>01</Text></View>
            <View style={styles.reportChapterCopy}>
              <Text style={styles.reportChapterEyebrow}>YOUR WEEK</Text>
              <Text style={styles.reportChapterTitle}>The big picture</Text>
            </View>
            <View style={styles.reportChapterLine} />
          </View>

          <View style={styles.reportScoreHero}>
            <View style={styles.reportScoreTopline}>
              <View>
                <Text style={styles.reportSectionEyebrow}>WEEKLY SNAPSHOT</Text>
                <Text style={styles.reportPeriod}>{formatReportPeriod(dietFeedback.weekStartDate, dietFeedback.weekEndDate)}</Text>
              </View>
              <View style={styles.reportLatestPill}>
                <View style={styles.reportReadyDot} />
                <Text style={styles.reportLatestPillText}>Latest</Text>
              </View>
            </View>

            <View style={styles.reportScoreMain}>
              {dietFeedback.score ? (
                <View style={styles.reportScoreRing}>
                  <Text style={styles.reportScoreValue}>{dietFeedback.score.overall}</Text>
                  <Text style={styles.reportScoreOutOf}>/100</Text>
                </View>
              ) : (
                <View style={styles.reportLegacyIcon}>
                  <Feather name="pie-chart" size={24} color={colors.gold} />
                </View>
              )}
              <View style={styles.reportScoreCopy}>
                <Text style={styles.reportScoreLabel}>{dietFeedback.score?.label || 'Your food pattern'}</Text>
                {typeof dietFeedback.score?.trend === 'number' ? (
                  <Text style={[styles.reportScoreTrend, dietFeedback.score.trend < 0 && styles.reportScoreTrendDown]}>
                    {dietFeedback.score.trend >= 0 ? '+' : ''}{dietFeedback.score.trend} this week
                  </Text>
                ) : dietFeedback.score ? (
                  <Text style={styles.reportScoreTrend}>First weekly baseline</Text>
                ) : null}
              </View>
            </View>

            <Text style={styles.reportHeadline}>{dietFeedback.headline || 'This week at a glance'}</Text>
            <Text style={styles.reportSummary} numberOfLines={3}>{dietFeedback.summary}</Text>
            <View style={styles.reportConfidencePill}>
              <Feather name="info" size={13} color={colors.gold} />
              <Text style={styles.reportConfidenceText}>
                {dietFeedback.score?.confidence || 'Limited'} confidence
              </Text>
            </View>
          </View>

          <View style={styles.reportStatsRow}>
            {[
              { value: reportStats?.mealMoments ?? reportStats?.loggedItems ?? 0, label: 'Meals', icon: 'coffee' },
              { value: reportStats?.daysLogged ?? 0, label: 'Days', icon: 'calendar' },
              { value: reportStats?.workoutsCompleted ?? 0, label: 'Training', icon: 'activity' },
            ].map(stat => (
              <View key={stat.label} style={styles.reportStat}>
                <Feather name={stat.icon} size={15} color={colors.gold} />
                <Text style={styles.reportStatValue}>{stat.value}</Text>
                <Text style={styles.reportStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.reportChapter}>
            <View style={styles.reportChapterNumber}><Text style={styles.reportChapterNumberText}>02</Text></View>
            <View style={styles.reportChapterCopy}>
              <Text style={styles.reportChapterEyebrow}>ACTION PLAN</Text>
              <Text style={styles.reportChapterTitle}>Your next 7 days</Text>
            </View>
            <View style={styles.reportChapterLine} />
          </View>

          <View style={styles.reportActionPlan}>
            <View style={styles.reportActionHeader}>
              <View style={styles.reportActionHeaderIcon}><Feather name="arrow-up-right" size={18} color={colors.onPrimary} /></View>
              <Text style={styles.reportActionEyebrow}>FOCUS FOR THE NEXT 7 DAYS</Text>
            </View>
            <Text style={styles.reportActionTitle}>{dietFeedback.nextWeek?.primaryFocus || dietFeedback.nextFocus || 'Make one meal more balanced each day.'}</Text>
            {dietFeedback.nextWeek?.whyItMatters ? <Text style={styles.reportActionWhy}>{dietFeedback.nextWeek.whyItMatters}</Text> : null}
            {(dietFeedback.nextWeek?.actions?.length ? dietFeedback.nextWeek.actions : dietFeedback.highlights || []).map((action, index) => (
              <View key={`${action}-${index}`} style={styles.reportActionItem}>
                <View style={styles.reportActionNumber}><Text style={styles.reportActionNumberText}>{index + 1}</Text></View>
                <Text style={styles.reportActionItemText}>{action}</Text>
              </View>
            ))}
          </View>

          {dietFeedback.mealGuidance?.length ? (
            <>
              <View style={styles.reportChapter}>
                <View style={styles.reportChapterNumber}><Text style={styles.reportChapterNumberText}>03</Text></View>
                <View style={styles.reportChapterCopy}>
                  <Text style={styles.reportChapterEyebrow}>MEAL GUIDE</Text>
                  <Text style={styles.reportChapterTitle}>Breakfast to dinner</Text>
                </View>
                <View style={styles.reportChapterLine} />
              </View>

              <View style={styles.reportMealAdviceSection}>
                <View style={styles.reportMealAdviceHeader}>
                  <View>
                    <Text style={styles.reportSectionEyebrow}>MEAL-BY-MEAL</Text>
                    <Text style={styles.reportSectionTitle}>A plan for each meal</Text>
                  </View>
                  <Feather name="arrow-right" size={17} color={colors.inkSubtle} />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reportMealAdviceList}
                >
                  {dietFeedback.mealGuidance.map(guidance => {
                    const appearance = mealAppearance[guidance.mealType];
                    return (
                      <View key={guidance.mealType} style={styles.reportMealAdviceCard}>
                        <View style={[styles.reportMealAdviceIcon, { backgroundColor: appearance.backgroundColor }]}>
                          <Feather name={appearance.icon} size={17} color={appearance.color} />
                        </View>
                        <View style={styles.reportMealAdviceTitleRow}>
                          <Text style={styles.reportMealAdviceTitle}>{guidance.mealType}</Text>
                          <Text style={styles.reportMealAdviceCount}>{guidance.observedCount || '—'}</Text>
                        </View>
                        <Text style={styles.reportMealAdvicePattern}>{guidance.pattern}</Text>
                        <Text style={styles.reportMealAdviceText}>{guidance.advice}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          ) : null}

          {supportsDetailedReport ? (
            <View style={styles.reportChapter}>
              <View style={styles.reportChapterNumber}><Text style={styles.reportChapterNumberText}>04</Text></View>
              <View style={styles.reportChapterCopy}>
                <Text style={styles.reportChapterEyebrow}>DEEP DIVE</Text>
                <Text style={styles.reportChapterTitle}>Patterns behind the score</Text>
              </View>
              <View style={styles.reportChapterLine} />
            </View>
          ) : null}

          {supportsDetailedReport ? (
            <>
              {dietFeedback.scoreHistory && dietFeedback.scoreHistory.length > 1 ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>WEEKLY TREND</Text>
                  <Text style={styles.reportSectionTitle}>Score history</Text>
                  <View style={styles.reportHistoryList}>
                    {dietFeedback.scoreHistory.slice(0, 6).map((week, index) => (
                      <View key={`${week.generatedAt}-${index}`} style={styles.reportHistoryRow}>
                        <View style={styles.reportHistoryCopy}>
                          <Text style={styles.reportHistoryPeriod}>{formatReportPeriod(week.weekStartDate, week.weekEndDate)}</Text>
                          <Text style={styles.reportHistoryLabel}>{index === 0 ? 'Latest · ' : ''}{week.label}</Text>
                        </View>
                        <View style={styles.reportHistoryTrack}><View style={[styles.reportHistoryFill, { width: `${week.overall}%` }]} /></View>
                        <Text style={styles.reportHistoryScore}>{week.overall}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.score?.components?.length ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>SCORE BREAKDOWN</Text>
                  <Text style={styles.reportSectionTitle}>What shaped the score</Text>
                  <View style={styles.reportComponentList}>
                    {dietFeedback.score.components.map(component => (
                      <View key={component.key} style={styles.reportComponent}>
                        <View style={styles.reportComponentHead}>
                          <Text style={styles.reportComponentLabel}>{component.label}</Text>
                          <Text style={styles.reportComponentValue}>{component.score}<Text style={styles.reportComponentMax}>/{component.maxScore}</Text></Text>
                        </View>
                        <View style={styles.reportComponentTrack}><View style={[styles.reportComponentFill, { width: `${component.maxScore ? (component.score / component.maxScore) * 100 : 0}%` }]} /></View>
                        <Text style={styles.reportComponentInsight}>{component.insight}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.wins?.length ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>WORKING WELL</Text>
                  <Text style={styles.reportSectionTitle}>Keep these</Text>
                  <View style={styles.reportWinList}>
                    {dietFeedback.wins.map((win, index) => (
                      <View key={`${win.title}-${index}`} style={styles.reportWin}>
                        <View style={styles.reportWinIcon}><Feather name="check" size={16} color={colors.success} /></View>
                        <View style={styles.reportWinCopy}>
                          <Text style={styles.reportWinTitle}>{win.title}</Text>
                          <Text style={styles.reportWinDetail}>{win.detail}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.patterns?.length ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>PATTERNS</Text>
                  <Text style={styles.reportSectionTitle}>Worth noticing</Text>
                  <View style={styles.reportPatternList}>
                    {dietFeedback.patterns.map(pattern => (
                      <View key={pattern.key || pattern.title} style={styles.reportPattern}>
                        <View style={[styles.reportPatternDot, pattern.status === 'strong' && styles.reportPatternDotStrong, pattern.status === 'attention' && styles.reportPatternDotAttention]} />
                        <View style={styles.reportPatternCopy}>
                          <Text style={styles.reportPatternTitle}>{pattern.title}</Text>
                          <Text style={styles.reportPatternBody}>{pattern.summary}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.foodGroups?.length ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>FOOD GROUPS</Text>
                  <Text style={styles.reportSectionTitle}>Coverage this week</Text>
                  <View style={styles.reportFoodGroupList}>
                    {dietFeedback.foodGroups.map(group => (
                      <View key={group.key || group.label} style={styles.reportFoodGroup}>
                        <View style={styles.reportFoodGroupHead}>
                          <Text style={styles.reportFoodGroupLabel}>{group.label}</Text>
                          <Text style={[styles.reportFoodGroupStatus, group.status === 'strong' && styles.reportFoodGroupStatusStrong]}>{group.status === 'notSeen' ? 'Not seen' : group.status}</Text>
                        </View>
                        {group.observedFoods?.length ? <Text style={styles.reportObservedFoods}>{group.observedFoods.join(' · ')}</Text> : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.mealRhythm?.summary || dietFeedback.goalAlignment?.summary ? (
                <View style={styles.reportInsightGrid}>
                  {dietFeedback.mealRhythm?.summary ? (
                    <View style={styles.reportInsightCard}>
                      <View style={styles.reportInsightIcon}><Feather name="clock" size={17} color={colors.gold} /></View>
                      <Text style={styles.reportInsightTitle}>Meal rhythm</Text>
                      <Text style={styles.reportInsightBody}>{dietFeedback.mealRhythm.summary}</Text>
                    </View>
                  ) : null}
                  {dietFeedback.goalAlignment?.summary ? (
                    <View style={styles.reportInsightCard}>
                      <View style={styles.reportInsightIcon}><Feather name="target" size={17} color={colors.gold} /></View>
                      <Text style={styles.reportInsightTitle}>Goal fit</Text>
                      <Text style={styles.reportInsightBody}>{dietFeedback.goalAlignment.summary}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {dietFeedback.nextWeek?.mealBuilder && Object.entries(dietFeedback.nextWeek.mealBuilder).some(([key, value]) => key !== 'title' && Boolean(value)) ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>MEAL BUILDER</Text>
                  <Text style={styles.reportSectionTitle}>{dietFeedback.nextWeek.mealBuilder.title}</Text>
                  <View style={styles.reportMealBuilder}>
                    {(['plants', 'protein', 'carbs', 'extras'] as const).map(key => dietFeedback.nextWeek?.mealBuilder[key] ? (
                      <View key={key} style={styles.reportMealBuilderRow}>
                        <Text style={styles.reportMealBuilderLabel}>{key}</Text>
                        <Text style={styles.reportMealBuilderValue}>{dietFeedback.nextWeek.mealBuilder[key]}</Text>
                      </View>
                    ) : null)}
                  </View>
                  {dietFeedback.nextWeek.smartSwaps?.length ? (
                    <View style={styles.reportSwapList}>
                      <Text style={styles.reportSwapHeading}>Easy upgrades</Text>
                      {dietFeedback.nextWeek.smartSwaps.map((swap, index) => (
                        <View key={`${swap.to}-${index}`} style={styles.reportSwap}>
                          <Text style={styles.reportSwapFrom}>{swap.from}</Text>
                          <Feather name="arrow-right" size={15} color={colors.gold} />
                          <View style={styles.reportSwapCopy}><Text style={styles.reportSwapTo}>{swap.to}</Text><Text style={styles.reportSwapWhy}>{swap.why}</Text></View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.reportChapter}>
                <View style={styles.reportChapterNumber}><Text style={styles.reportChapterNumberText}>05</Text></View>
                <View style={styles.reportChapterCopy}>
                  <Text style={styles.reportChapterEyebrow}>CONTEXT</Text>
                  <Text style={styles.reportChapterTitle}>Evidence and coach notes</Text>
                </View>
                <View style={styles.reportChapterLine} />
              </View>

              {dietFeedback.facts?.length ? (
                <View style={styles.reportSectionCard}>
                  <Text style={styles.reportSectionEyebrow}>EVIDENCE</Text>
                  <Text style={styles.reportSectionTitle}>Useful context</Text>
                  <View style={styles.reportFactList}>
                    {dietFeedback.facts.map(fact => (
                      <TouchableOpacity key={fact.id} style={styles.reportFact} activeOpacity={0.8} onPress={() => Linking.openURL(fact.sourceUrl).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={`Read source: ${fact.sourceLabel}`}>
                        <View style={styles.reportFactIcon}><Feather name="book-open" size={16} color={colors.gold} /></View>
                        <View style={styles.reportFactCopy}><Text style={styles.reportFactTitle}>{fact.title}</Text><Text style={styles.reportFactBody}>{fact.body}</Text><Text style={styles.reportFactSource}>{fact.sourceLabel}</Text></View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {dietFeedback.coachNote ? (
                <View style={styles.reportCoachNote}>
                  <View style={styles.reportCoachAvatar}><Feather name="message-circle" size={18} color={colors.gold} /></View>
                  <View style={styles.reportCoachCopy}><Text style={styles.reportCoachLabel}>COACH NOTE</Text><Text style={styles.reportCoachText}>{dietFeedback.coachNote}</Text></View>
                </View>
              ) : null}

              <View style={styles.reportMethodNote}>
                <Feather name="shield" size={16} color={colors.inkSubtle} />
                <Text style={styles.reportMethodText}>Based on described meals. It is not a calorie, nutrient or medical assessment.</Text>
              </View>
            </>
          ) : null}
        </>
      )}

      <PrimaryButton
        title="Log more meals"
        icon="plus"
        onPress={() => {
          setActiveTab('log');
          openMemoryGame();
        }}
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
            <View style={styles.screenTitleWrap}>
              <ScreenTitle>Diet</ScreenTitle>
            </View>
            <FoodPointsBadge points={weeklyMemoryPoints} />
          </View>
        ) : (
          <View style={[styles.screenHeader, styles.subpageHeader]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                setActiveTab(
                  activeTab === 'report' ? reportReturnTab : 'log',
                )
              }
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
                <Text style={styles.diaryCountText}>
                  {diaryEntryCount}
                </Text>
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
            {preview ? (
              <TouchableOpacity
                onPress={() => openEntryEditor(preview)}
                style={styles.modalEditButton}
                accessibilityRole="button"
                accessibilityLabel="Edit diary entry"
              >
                <Feather name="edit-2" size={17} color={colors.ink} />
                <Text style={styles.modalEditButtonText}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.modalHeaderSpacer} />
            )}
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
        visible={!!editingEntry}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => !savingEdit && setEditingEntry(null)}
      >
        <ScreenContainer withBottomInset style={styles.editorScreen}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editorKeyboardView}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorHeaderCopy}>
                <Text style={styles.editorEyebrow}>FOOD DIARY</Text>
                <Text style={styles.editorTitle}>Edit meal</Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingEntry(null)}
                disabled={savingEdit}
                style={styles.editorClose}
                accessibilityRole="button"
                accessibilityLabel="Close meal editor"
              >
                <Feather name="x" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalScreenScroll}
              contentContainerStyle={styles.editContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.editFieldLabel}>Meal</Text>
              <View style={styles.editMealGrid}>
                {meals.map(meal => {
                  const selected = meal.type === editMeal;
                  const appearance = mealAppearance[meal.type];
                  return (
                    <TouchableOpacity
                      key={meal.type}
                      activeOpacity={0.8}
                      onPress={() => setEditMeal(meal.type)}
                      style={[
                        styles.editMealOption,
                        selected && styles.editMealOptionSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <View
                        style={[
                          styles.editMealOptionIcon,
                          { backgroundColor: appearance.backgroundColor },
                        ]}
                      >
                        <Feather name={appearance.icon} size={17} color={appearance.color} />
                      </View>
                      <Text style={[styles.editMealOptionText, selected && styles.editMealOptionTextSelected]}>
                        {meal.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.editFieldLabel}>What you had</Text>
              <TextInput
                value={editNote}
                onChangeText={setEditNote}
                placeholder={editingEntry?.uri ? 'Add a note about this meal' : 'What did you eat?'}
                placeholderTextColor={colors.inkSubtle}
                multiline
                textAlignVertical="top"
                maxLength={500}
                style={styles.editNoteInput}
              />
              {editingEntry ? (
                <Text style={styles.editEntryTime}>
                  Logged {formatEntryTime(editingEntry.createdAt)}
                </Text>
              ) : null}
              <PrimaryButton
                title="Save changes"
                icon="check"
                onPress={saveEntryEdit}
                loading={savingEdit}
                style={styles.editSaveButton}
              />
            </ScrollView>
          </KeyboardAvoidingView>
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
                  <Text style={styles.editorScoreText}>
                    {memorySessionPoints} added
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
              {memorySessionPoints ? (
                <View style={styles.forgottenFoodPrompt}>
                  <Feather name="coffee" size={16} color={colors.gold} />
                  <Text style={styles.forgottenFoodPromptText}>
                    Anything easy to miss? Drinks, sides, fruit and snacks count too.
                  </Text>
                </View>
              ) : null}
              {selectedMealSkip ? (
                <>
                  <View style={styles.skippedPanel}>
                    <Feather name="minus-circle" size={18} color={colors.gold} />
                    <View style={styles.skippedCopy}>
                      <Text style={styles.skippedTitle}>
                        {mealLabel(selectedMeal)} marked as skipped
                      </Text>
                      <Text style={styles.skippedMeta}>
                        Nothing else is needed for this meal.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={undoMealSkipped}
                      disabled={saving}
                      style={styles.undoSkipButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Undo skipped ${selectedMeal}`}
                    >
                      <Text style={styles.undoSkipText}>
                        {saving ? 'Saving…' : 'Undo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => moveMemorySlot(-1)}
                    style={styles.skipContinueAction}
                    accessibilityRole="button"
                    accessibilityLabel="Recall an earlier meal"
                  >
                    <Text style={styles.skipContinueText}>Recall an earlier meal</Text>
                    <Feather name="arrow-right" size={17} color={colors.gold} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput
                    value={textEntry}
                    onChangeText={setTextEntry}
                    placeholder={
                      memorySessionPoints
                        ? 'Anything else? e.g. tea or a side'
                        : 'One item, e.g. a banana'
                    }
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
                  {!selectedMealEntryCount && !textEntry.trim() ? (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      style={styles.skipMealAction}
                      onPress={markMealSkipped}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${selectedMeal} as skipped`}
                    >
                      <Feather name="minus-circle" size={17} color={colors.inkSubtle} />
                      <View style={styles.skipMealCopy}>
                        <Text style={styles.skipMealTitle}>I skipped this meal</Text>
                        <Text style={styles.skipMealMeta}>Nothing to recall for this time slot</Text>
                      </View>
                      <Feather name="chevron-right" size={17} color={colors.inkSubtle} />
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
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
                  disabled={!textEntry.trim() || Boolean(selectedMealSkip)}
                  style={styles.modalActionButton}
                />
              </View>
              <Text style={styles.editorFootnote}>
                {selectedMealSkip
                  ? 'Skipped meals stay visible to your coach but do not earn a memory point.'
                  : 'Save & next stores this item, then opens the nearest earlier meal you have not recalled.'}
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
            <Text style={styles.saveToastTitle}>+1 memory point</Text>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  subpageHeader: {
    minHeight: 48,
    alignItems: 'center',
  },
  screenTitleWrap: { flex: 1, minWidth: 0 },
  subpageTitle: {
    ...typography.title,
    color: colors.ink,
    flex: 1,
    minWidth: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  headerIconButton: {
    width: 48,
    height: 48,
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
    includeFontPadding: false,
  },
  pointsBadge: {
    minWidth: 72,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  pointsStarWrap: {
    width: 34,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsStarGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold,
  },
  pointsValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 31,
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
  reportCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    padding: spacing.md,
  },
  reportReadyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  reportTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  reportTrackFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
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
  memoryHero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  memoryHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  memoryHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  memoryHeroBadgeText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '800',
  },
  memoryHeroTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.45,
    color: colors.ink,
    marginTop: spacing.md,
  },
  memoryHeroText: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  todayCoverage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  todayCoverageCopy: { flex: 1, minWidth: 0 },
  todayCoverageLabel: {
    ...typography.overline,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
  },
  todayCoverageValue: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  todayCoverageTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  todayCoverageFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
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
  weeklyPatternCard: {
    minHeight: 156,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  weeklyPatternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  weeklyPatternCopy: { flex: 1, minWidth: 0 },
  weeklyPatternEyebrow: {
    ...typography.overline,
    color: colors.inkSubtle,
  },
  weeklyPatternTitle: {
    ...typography.subtitle,
    color: colors.ink,
    marginTop: 2,
  },
  weeklyPatternBars: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  weeklyPatternDay: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weeklyPatternTrack: {
    width: 18,
    height: 42,
    justifyContent: 'flex-end',
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
  },
  weeklyPatternTrackToday: {
    borderWidth: 1,
    borderColor: colors.goldMuted,
  },
  weeklyPatternTrackFuture: { opacity: 0.42 },
  weeklyPatternFill: {
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  weeklyPatternDayLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: colors.inkSubtle,
    fontWeight: '700',
  },
  weeklyPatternDayLabelToday: { color: colors.gold },
  weeklyPatternFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  weeklyPatternFootText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '600',
  },
  weeklyPatternFootDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkSubtle,
  },
  reportEnrichment: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  reportEnrichmentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportEnrichmentLabel: {
    ...typography.label,
    color: colors.ink,
    fontWeight: '700',
  },
  reportEnrichmentValue: {
    ...typography.label,
    color: colors.gold,
    fontWeight: '900',
  },
  reportEnrichmentTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  reportEnrichmentFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  reportEnrichmentHint: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  secondaryGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  secondaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    padding: spacing.md,
  },
  secondaryCardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCardCopy: { flex: 1, minWidth: 0, justifyContent: 'flex-end', gap: 2 },
  secondaryCardTitle: { ...typography.bodyBold, color: colors.ink },
  secondaryCardMeta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  secondaryCardChevron: { position: 'absolute', top: spacing.md, right: spacing.md },

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
  diarySummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  diarySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  diarySummaryHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diarySummaryEyebrow: {
    ...typography.overline,
    color: colors.inkSubtle,
  },
  diarySummaryTitle: {
    ...typography.subtitle,
    color: colors.ink,
    marginTop: 2,
  },
  diarySummaryStats: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  diarySummaryStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.panelRaised,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    padding: spacing.sm,
  },
  diarySummaryStatIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diarySummaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  diarySummaryValue: {
    fontSize: 24,
    lineHeight: 29,
    color: colors.ink,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  diarySummaryValueSuffix: {
    ...typography.caption,
    color: colors.inkSubtle,
    fontWeight: '800',
    marginLeft: 2,
  },
  diarySummaryLabel: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  diaryReportRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  diaryReportIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaryReportCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
  diaryReportTitle: {
    ...typography.label,
    color: colors.ink,
    fontWeight: '800',
  },
  diaryReportMeta: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  diaryReportAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  diaryReportActionText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '900',
  },
  diaryMemoryCta: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryAction,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  diaryMemoryIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaryMemoryCopy: { flex: 1, minWidth: 0 },
  diaryMemoryTitle: { ...typography.bodyBold, color: colors.onPrimary },
  diaryMemoryMeta: {
    ...typography.caption,
    color: colors.onPrimary,
    opacity: 0.58,
    marginTop: 2,
  },
  diaryMemoryArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, flexShrink: 1 },
  sectionMetaPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sectionMeta: { ...typography.caption, color: colors.inkMuted },
  entryList: { borderTopWidth: 1, borderTopColor: colors.border },
  entryRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  entryOpenAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryMealIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryPhoto: { width: 44, height: 44, borderRadius: radius.sm },
  entryBody: { flex: 1, minWidth: 0 },
  entryMealLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
    marginBottom: 2,
  },
  entryName: { ...typography.bodyBold, color: colors.ink, lineHeight: 21 },
  entryEditButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelRaised,
  },
  // Report subpage
  reportHero: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  reportHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportHeroEyebrow: {
    ...typography.overline,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  reportHeroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  reportHeroStatusText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  reportHeroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.55,
    color: colors.ink,
    marginTop: spacing.lg,
  },
  reportHeroMeta: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    marginBottom: spacing.md,
  },
  reportStat: {
    flex: 1,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: spacing.xs,
  },
  reportStatValue: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: colors.ink },
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

  // Weekly report v2
  reportPendingHero: {
    alignItems: 'flex-start',
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.panelWarm,
  },
  reportPendingIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.accentLight,
  },
  reportPendingEyebrow: {
    ...typography.overline,
    color: colors.gold,
  },
  reportPendingTitle: {
    ...typography.hero,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  reportPendingBody: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportCountdownRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  reportCountdownLabel: { ...typography.label, color: colors.inkMuted },
  reportCountdownDays: { ...typography.label, color: colors.gold, fontWeight: '800' },
  reportChapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  reportChapterNumber: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.accentLight,
  },
  reportChapterNumberText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  reportChapterCopy: { minWidth: 0 },
  reportChapterEyebrow: {
    ...typography.overline,
    color: colors.inkSubtle,
  },
  reportChapterTitle: {
    ...typography.bodyBold,
    color: colors.ink,
    marginTop: 1,
  },
  reportChapterLine: {
    flex: 1,
    height: 1,
    marginLeft: spacing.xs,
    backgroundColor: colors.border,
  },
  reportSectionCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportSectionEyebrow: {
    ...typography.overline,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  reportSectionTitle: {
    ...typography.title,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  reportSectionIntro: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  reportScoreHero: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelWarm,
    ...shadows.sm,
  },
  reportScoreTopline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportPeriod: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 3,
  },
  reportLatestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
  },
  reportLatestPillText: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  reportScoreMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reportScoreRing: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.bgTint,
  },
  reportScoreValue: {
    fontSize: 27,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: colors.ink,
  },
  reportScoreOutOf: { ...typography.caption, color: colors.inkMuted, marginTop: -2 },
  reportLegacyIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.bgTint,
  },
  reportScoreCopy: { flex: 1, minWidth: 0 },
  reportScoreLabel: { ...typography.title, color: colors.ink },
  reportScoreTrend: { ...typography.label, color: colors.success, marginTop: 4 },
  reportScoreTrendDown: { color: colors.error },
  reportHeadline: {
    ...typography.subtitle,
    color: colors.ink,
    marginTop: spacing.md,
  },
  reportSummary: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs, lineHeight: 21 },
  reportConfidencePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
  },
  reportConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.accentSurface,
  },
  reportConfidenceText: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  reportConfidenceStrong: { color: colors.ink, fontWeight: '800' },
  reportComponentList: { marginTop: spacing.md },
  reportHistoryList: { marginTop: spacing.md },
  reportHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportHistoryCopy: { width: 108 },
  reportHistoryPeriod: { ...typography.label, color: colors.ink },
  reportHistoryLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  reportHistoryTrack: {
    flex: 1,
    height: 5,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportHistoryFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  reportHistoryScore: { ...typography.bodyBold, width: 30, color: colors.gold, textAlign: 'right' },
  reportComponent: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportComponentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportComponentLabel: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reportComponentValue: { ...typography.bodyBold, color: colors.gold },
  reportComponentMax: { ...typography.caption, color: colors.inkSubtle },
  reportComponentTrack: {
    height: 5,
    overflow: 'hidden',
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportComponentFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  reportComponentInsight: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },
  reportWinList: { marginTop: spacing.md, gap: spacing.md },
  reportWin: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reportWinIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.successLight,
  },
  reportWinCopy: { flex: 1, minWidth: 0 },
  reportWinTitle: { ...typography.bodyBold, color: colors.ink },
  reportWinDetail: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  reportEvidence: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
  reportPatternList: { marginTop: spacing.md },
  reportPattern: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportPatternDot: {
    width: 9,
    height: 9,
    marginTop: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
  },
  reportPatternDotStrong: { backgroundColor: colors.success },
  reportPatternDotAttention: { backgroundColor: colors.warn },
  reportPatternCopy: { flex: 1, minWidth: 0 },
  reportPatternTitle: { ...typography.bodyBold, color: colors.ink },
  reportPatternBody: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  reportFoodGroupList: { marginTop: spacing.md },
  reportFoodGroup: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportFoodGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportFoodGroupLabel: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reportFoodGroupStatus: {
    ...typography.caption,
    color: colors.gold,
    textTransform: 'capitalize',
    fontWeight: '800',
  },
  reportFoodGroupStatusStrong: { color: colors.success },
  reportObservedFoods: { ...typography.label, color: colors.ink, marginTop: spacing.sm },
  reportFoodGroupInsight: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  reportInsightGrid: { gap: spacing.sm, marginBottom: spacing.md },
  reportInsightCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportInsightIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
  },
  reportInsightTitle: { ...typography.title, color: colors.ink },
  reportInsightBody: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  reportInsightSignal: { ...typography.caption, color: colors.gold, marginTop: spacing.sm },
  reportActionPlan: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelWarm,
  },
  reportActionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportActionHeaderIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  reportActionEyebrow: { ...typography.overline, color: colors.gold },
  reportActionTitle: { ...typography.title, color: colors.ink, marginTop: spacing.sm },
  reportActionWhy: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  reportActionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reportActionNumber: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  reportActionNumberText: { ...typography.caption, color: colors.onPrimary, fontWeight: '900' },
  reportActionItemText: { ...typography.body, color: colors.ink, flex: 1 },
  reportMealAdviceSection: { marginBottom: spacing.md },
  reportMealAdviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  reportMealAdviceList: { gap: spacing.sm, paddingRight: spacing.md },
  reportMealAdviceCard: {
    width: 190,
    minHeight: 170,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportMealAdviceIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  reportMealAdviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportMealAdviceTitle: { ...typography.bodyBold, color: colors.ink },
  reportMealAdviceCount: {
    ...typography.caption,
    color: colors.gold,
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
  },
  reportMealAdvicePattern: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
  reportMealAdviceText: { ...typography.label, color: colors.ink, marginTop: spacing.sm },
  reportMealBuilder: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.bgTint,
  },
  reportMealBuilderTitle: { ...typography.bodyBold, color: colors.gold, marginBottom: spacing.sm },
  reportMealBuilderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 5 },
  reportMealBuilderLabel: {
    ...typography.caption,
    width: 54,
    color: colors.inkSubtle,
    textTransform: 'capitalize',
  },
  reportMealBuilderValue: { ...typography.label, color: colors.ink, flex: 1 },
  reportSwapList: { marginTop: spacing.lg },
  reportSwapHeading: { ...typography.bodyBold, color: colors.ink, marginBottom: spacing.xs },
  reportSwap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  reportSwapFrom: { ...typography.caption, color: colors.inkSubtle, width: 78 },
  reportSwapCopy: { flex: 1, minWidth: 0 },
  reportSwapTo: { ...typography.label, color: colors.ink },
  reportSwapWhy: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  reportFactList: { marginTop: spacing.sm },
  reportFact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportFactIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
  },
  reportFactCopy: { flex: 1, minWidth: 0 },
  reportFactTitle: { ...typography.bodyBold, color: colors.ink },
  reportFactBody: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
  reportFactSource: { ...typography.caption, color: colors.gold, marginTop: spacing.sm },
  reportCoachNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.panelRaised,
  },
  reportCoachAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelWarm,
  },
  reportCoachAvatarText: { ...typography.title, color: colors.gold },
  reportCoachCopy: { flex: 1, minWidth: 0 },
  reportCoachLabel: { ...typography.overline, color: colors.gold },
  reportCoachText: { ...typography.body, color: colors.ink, marginTop: spacing.xs },
  reportMethodNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  reportMethodText: { ...typography.caption, color: colors.inkSubtle, flex: 1 },

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
  modalEditButton: {
    minWidth: 56,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
    paddingHorizontal: spacing.sm,
  },
  modalEditButtonText: {
    ...typography.caption,
    color: colors.ink,
    fontWeight: '800',
  },
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
  editContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  editFieldLabel: {
    ...typography.overline,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  editMealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  editMealOption: {
    width: '48%',
    minHeight: 58,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.sm,
  },
  editMealOptionSelected: {
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelWarm,
  },
  editMealOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editMealOptionText: {
    ...typography.label,
    color: colors.inkMuted,
  },
  editMealOptionTextSelected: { color: colors.ink, fontWeight: '800' },
  editNoteInput: {
    minHeight: 150,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    color: colors.ink,
    ...typography.body,
    padding: spacing.md,
  },
  editEntryTime: {
    ...typography.caption,
    color: colors.inkSubtle,
    marginTop: spacing.sm,
  },
  editSaveButton: { marginTop: spacing.xl },

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
  forgottenFoodPrompt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panelWarm,
    padding: spacing.sm,
  },
  forgottenFoodPromptText: {
    ...typography.caption,
    color: colors.inkMuted,
    flex: 1,
    lineHeight: 18,
  },
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
  skipMealAction: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  skipMealCopy: { flex: 1, minWidth: 0 },
  skipMealTitle: { ...typography.bodyBold, color: colors.inkMuted },
  skipMealMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
  skipContinueAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  skipContinueText: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '800',
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
