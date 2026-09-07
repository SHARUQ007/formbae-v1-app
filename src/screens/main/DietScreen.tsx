import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
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
  useWindowDimensions,
  View,
} from 'react-native';
import {
  launchCamera,
  type Asset,
} from 'react-native-image-picker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import LinearGradient from 'react-native-linear-gradient';
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
  loadRememberedMealTimes,
  mergeRemoteDietDiaryEntries,
  peekDietDiaryEntries,
  rememberMealTime,
  updateDietDiaryEntry,
  type DietDiaryEntry,
  type MealType,
  type RememberedMealTimes,
} from '../../store/dietDiaryStore';
import {
  deleteRemoteDietDiaryEntry,
  resolveDietDiaryImageUrl,
  shouldAuthenticateDietDiaryImage,
  submitDietReportResponses,
  updateRemoteDietDiaryEntry,
  uploadDietDiaryEntry,
  uploadSkippedDietMeal,
  uploadTextDietDiaryEntry,
  type DietCoachFeedback,
} from '../../services/dietDiaryService';
import { getAuthToken } from '../../services/apiClient';
import { loadDietDiaryCached, peekDietDiaryCached } from '../../services/preloadService';
import { useProfileBodyGender } from '../../hooks/useProfileBodyGender';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { reportTypography } from '../../theme/reportTypography';
import { getDietReportEmptyArtwork } from '../../utils/reportArtwork';
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

const mealRecallPlaceholders: Record<MealType, string> = {
  Breakfast: 'Breakfast, coffee, fruit…',
  Lunch: 'Lunch, sides or a drink…',
  Evening: 'Tea, coffee, fruit or snacks…',
  Dinner: 'Dinner, sides or a drink…',
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

function formatEditableTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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

function memorySlotDraftKey(date: Date, mealType: MealType) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}:${mealType}`;
}

/** Ava regenerates the diet report on a fixed weekly cadence (backend: FEEDBACK_INTERVAL_DAYS). */
const REPORT_CYCLE_DAYS = 7;
const DEFAULT_REPORT_ENRICHMENT_REQUIREMENT = 50;
const SUPPORTED_DIET_REPORT_SCHEMA_VERSION = 10;
const REPORT_SAGE = '#A8BFB2';
const REPORT_SAGE_SURFACE = 'rgba(168,191,178,0.12)';
const REPORT_BLUE_SURFACE = 'rgba(145,189,248,0.10)';
const REPORT_PAGE = '#050609';
const REPORT_SURFACE = '#111217';
const REPORT_INK = '#FFFFFF';
const REPORT_MUTED = '#C2C3CA';
const REPORT_SUBTLE = '#8C8D96';
const REPORT_BORDER = '#292A31';
const REPORT_BORDER_STRONG = '#43444D';
const REPORT_ACCENT = '#F0CE78';
const REPORT_ACCENT_SURFACE = '#242016';
const REPORT_INFO = '#F0CE78';
const REPORT_INFO_SURFACE = '#242016';
const REPORT_WARNING = '#F0CE78';
const REPORT_DANGER = '#FF818C';

function reportDaysLeft(feedback?: DietCoachFeedback | null) {
  const days = feedback?.nextInDays ?? REPORT_CYCLE_DAYS;
  return Math.max(1, Math.round(days));
}

export function formatDaysToNextDietReport(days: number) {
  return `${days} day${days === 1 ? '' : 's'} to next report`;
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

function formatReportGeneratedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Generated ${date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function reportSourceDomain(value?: string) {
  const match = /^https?:\/\/([^/?#]+)/i.exec(value || '');
  return match?.[1]?.replace(/^www\./i, '') || '';
}

async function openReportLink(url: string, failureMessage: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('Unsupported link');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', failureMessage);
  }
}

function reportStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
}

function reportText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function reportFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dietReportHasDescribedEvidence(feedback?: DietCoachFeedback | null) {
  const stats = feedback?.stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return true;
  const describedEntries = reportFiniteNumber(stats.describedEntries ?? stats.memoryEntries);
  return describedEntries === null || describedEntries > 0;
}

function dietReportIsPresentable(feedback?: DietCoachFeedback | null) {
  if (!feedback || !dietReportHasDescribedEvidence(feedback)) return false;
  const score = feedback.score;
  if (!score) return true;
  if (score.availability === 'insufficientEvidence') return false;
  if ((score.availability === undefined || score.availability === 'available') && Object.prototype.hasOwnProperty.call(score, 'overall')) {
    const overall = reportFiniteNumber(score.overall);
    return overall !== null && overall > 0;
  }
  return true;
}

export function getDietReportEnrichmentState(feedback?: Pick<DietCoachFeedback, 'enrichmentScore' | 'requirements'> | null) {
  const rawScore = reportFiniteNumber(feedback?.enrichmentScore);
  const rawRequired = reportFiniteNumber(feedback?.requirements?.enrichment) ?? DEFAULT_REPORT_ENRICHMENT_REQUIREMENT;
  const score = Math.max(0, Math.min(100, Math.round(rawScore ?? 0)));
  const required = Math.max(1, Math.min(100, Math.round(rawRequired)));
  return {
    available: rawScore !== null,
    score,
    required,
    remaining: Math.max(0, required - score),
    requirementMet: score >= required,
    progress: score / 100,
  };
}

function reportObjectArray<T extends object>(value: T[] | null | undefined): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function humanizeReportStatus(value?: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Not rated';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, letter => letter.toUpperCase());
}

type ReportStatusKind = 'evidence' | 'pattern' | 'presence' | 'logging';

function reportStatusLabel(value: string | undefined, kind: ReportStatusKind) {
  if (kind === 'evidence') {
    if (value === 'high') return 'Broader diary evidence';
    if (value === 'medium') return 'Some diary evidence';
    return 'Limited diary evidence';
  }
  if (kind === 'presence') {
    if (value === 'strong') return 'Seen often';
    if (value === 'present') return 'Seen in diary';
    if (value === 'notSeen') return 'Not seen in diary';
    return 'Seen less often';
  }
  if (kind === 'logging') {
    if (value === 'observed') return 'Logged with detail';
    if (value === 'loggedWithoutDescription') return 'Logged without detail';
    if (value === 'notLogged') return 'Not logged';
    return 'Limited diary data';
  }
  if (value === 'strong') return 'Consistent pattern';
  if (value === 'building') return 'Developing pattern';
  if (value === 'attention') return 'Opportunity';
  if (value === 'limited') return 'Limited evidence';
  return humanizeReportStatus(value);
}

function ReportStatusText({ value, kind }: { value?: string; kind: ReportStatusKind }) {
  const safeValue = typeof value === 'string' ? value : undefined;
  const observed = safeValue === 'strong' || safeValue === 'present' || safeValue === 'high' || safeValue === 'observed';
  const attention = safeValue === 'attention';
  const label = reportStatusLabel(safeValue, kind);
  return (
    <View style={styles.paperStatusRow} accessible accessibilityLabel={label}>
      <View style={[styles.paperStatusDot, observed && styles.paperStatusDotPositive, attention && styles.paperStatusDotAttention]} />
      <Text style={styles.paperStatusText}>{label}</Text>
    </View>
  );
}

function ReportPaperSection({
  title,
  meta,
  children,
  icon,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <View style={styles.paperSection}>
      <View style={styles.paperSectionHeader}>
        {icon ? (
          <View style={styles.paperSectionIcon} accessible={false}>
            <Feather name={icon} size={17} color={REPORT_ACCENT} />
          </View>
        ) : null}
        <View style={styles.paperSectionHeading}>
          <Text style={styles.paperSectionTitle} accessibilityRole="header">{title}</Text>
          {meta ? <Text style={styles.paperSectionMeta}>{meta}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function ReportEvidenceLine({ items }: { items?: string[] }) {
  const evidence = reportStringArray(items);
  if (!evidence.length) return null;
  return (
    <View style={styles.paperEvidenceLine}>
      <Feather name="database" size={13} color={REPORT_SUBTLE} />
      <Text style={styles.paperEvidenceText}>{evidence.join(' · ')}</Text>
    </View>
  );
}

function ReportSafetyNotices({ notices }: { notices: NonNullable<DietCoachFeedback['safetyNotices']> }) {
  if (!notices.length) return null;
  return (
    <View style={styles.paperSafetyList}>
      {notices.map((notice, index) => {
        const severity = notice.severity || 'info';
        return (
          <View
            key={notice.id || `${notice.title || 'notice'}-${index}`}
            style={[
              styles.paperSafetyNotice,
              severity === 'warning' && styles.paperSafetyNoticeWarning,
              severity === 'urgent' && styles.paperSafetyNoticeUrgent,
            ]}
            accessibilityLiveRegion={severity === 'urgent' ? 'assertive' : 'none'}
          >
            <View style={styles.paperSafetyTitleRow}>
              <Feather
                name={severity === 'urgent' ? 'alert-circle' : 'info'}
                size={19}
                color={severity === 'urgent' ? REPORT_DANGER : severity === 'warning' ? REPORT_WARNING : REPORT_INFO}
              />
              <Text style={styles.paperSafetyTitle}>{reportText(notice.title) || (severity === 'urgent' ? 'Important health note' : 'Important context')}</Text>
            </View>
            <Text style={styles.paperSafetyBody}>{reportText(notice.body)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReportQuestionsForm({
  questions,
  initialResponses,
  reportGeneratedAt,
}: {
  questions: string[];
  initialResponses: Array<{ questionIndex?: number; question: string; answer: string }>;
  reportGeneratedAt: string;
}) {
  const initialByQuestion = new Map(initialResponses.map(item => [item.question, item.answer]));
  const initialAnswers = questions.map((question, index) => {
    const indexedAnswer = initialResponses.find(item => item.questionIndex === index)?.answer;
    return indexedAnswer || initialByQuestion.get(question) || '';
  });
  const [answers, setAnswers] = useState(initialAnswers);
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const answeredCount = answers.filter(answer => answer.trim()).length;
  const hasSavedAnswers = savedAnswers.some(answer => answer.trim());
  const hasUnsavedChanges = answers.some((answer, index) => answer.trim() !== (savedAnswers[index] || '').trim());

  const saveAnswers = async () => {
    if (savingAnswers || !hasUnsavedChanges) return;
    const completedAnswers = questions.flatMap((_question, index) => {
      const answer = answers[index]?.trim();
      return answer ? [{ questionIndex: index, answer }] : [];
    });
    setSavingAnswers(true);
    try {
      await submitDietReportResponses({ reportGeneratedAt, answers: completedAnswers });
      Keyboard.dismiss();
      setSavedAnswers([...answers]);
    } catch (error) {
      Alert.alert(
        'Could not save your answers',
        error instanceof Error ? error.message : 'Please try again in a moment.',
      );
    } finally {
      setSavingAnswers(false);
    }
  };

  return (
    <View style={styles.paperQuestionPanel}>
      <View style={styles.paperQuestionHeader}>
        <View style={styles.paperQuestionIcon} accessible={false}>
          <Feather name="message-square" size={17} color={REPORT_INFO} />
        </View>
        <View style={styles.paperQuestionHeading}>
          <Text style={styles.paperQuestionTitle} accessibilityRole="header">Personalize the next report</Text>
          <Text style={styles.paperQuestionIntro}>Optional context helps Ava interpret next week without guessing.</Text>
        </View>
      </View>

      <View style={styles.paperQuestionList}>
        {questions.map((question, index) => (
          <View key={`${question}-${index}`} style={styles.paperQuestionItem}>
            <Text style={styles.paperQuestionLabel}><Text style={styles.paperQuestionNumber}>{index + 1}. </Text>{question}</Text>
            <TextInput
              value={answers[index] || ''}
              onChangeText={value => setAnswers(current => current.map((answer, answerIndex) => answerIndex === index ? value : answer))}
              placeholder="Short answer (optional)"
              placeholderTextColor={REPORT_SUBTLE}
              multiline
              maxLength={600}
              textAlignVertical="top"
              style={styles.paperQuestionInput}
              accessibilityLabel={`Answer to: ${question}`}
            />
          </View>
        ))}
      </View>

      <View style={styles.paperQuestionFooter}>
        <Text style={styles.paperQuestionStatus} accessibilityLiveRegion="polite">
          {hasUnsavedChanges
            ? `${answeredCount} of ${questions.length} answered · not saved`
            : hasSavedAnswers
              ? `${answeredCount} of ${questions.length} saved`
              : 'Answer only what feels useful.'}
        </Text>
        <TouchableOpacity
          style={[styles.paperQuestionSaveButton, (!hasUnsavedChanges || savingAnswers) && styles.paperQuestionSaveButtonDisabled]}
          onPress={() => saveAnswers().catch(() => undefined)}
          disabled={!hasUnsavedChanges || savingAnswers}
          accessibilityRole="button"
          accessibilityLabel="Save answers for the next diet report"
          accessibilityState={{ disabled: !hasUnsavedChanges || savingAnswers, busy: savingAnswers }}
        >
          {savingAnswers ? <ActivityIndicator size="small" color={REPORT_PAGE} /> : <Feather name="check" size={17} color={REPORT_PAGE} />}
          <Text style={styles.paperQuestionSaveText}>{savingAnswers ? 'Saving' : 'Save context'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function DietReportPendingState({
  feedback,
  foodDetails,
  daysWithDetail,
}: {
  feedback?: DietCoachFeedback | null;
  foodDetails: number;
  daysWithDetail: number;
}) {
  const enrichment = getDietReportEnrichmentState(feedback);
  const reportDays = reportDaysLeft(feedback);
  const waitingForEvidence = !enrichment.available || !enrichment.requirementMet;
  const detailSummary = [
    foodDetails ? `${foodDetails} food detail${foodDetails === 1 ? '' : 's'}` : '',
    daysWithDetail ? `${daysWithDetail} day${daysWithDetail === 1 ? '' : 's'} with detail` : '',
  ].filter(Boolean).join(' · ');
  const progressStatus = !enrichment.available
    ? 'Updates after meal details sync'
    : waitingForEvidence
      ? `${enrichment.remaining} point${enrichment.remaining === 1 ? '' : 's'} to go`
      : 'Minimum reached';
  const progressAccessibilityText = !enrichment.available
    ? undefined
    : waitingForEvidence
      ? `${enrichment.score} percent. Minimum ${enrichment.required} percent. ${enrichment.remaining} percentage point${enrichment.remaining === 1 ? '' : 's'} remaining.`
      : `${enrichment.score} percent. Minimum ${enrichment.required} percent reached. Next review in ${reportDays} day${reportDays === 1 ? '' : 's'}.`;

  return (
    <View style={styles.reportPendingHero}>
      <View style={styles.reportPendingMetaRow}>
        <Text style={styles.reportPendingEyebrow}>WEEKLY DIET REPORT</Text>
        <Text style={styles.reportPendingCadence}>Next review in {reportDays} day{reportDays === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.reportPendingTitle} accessibilityRole="header">
        {!enrichment.available
          ? 'Your report is getting ready'
          : waitingForEvidence
            ? 'Build a clearer food picture'
            : 'Your report is queued'}
      </Text>
      <Text style={styles.reportPendingBody}>
        {!enrichment.available
          ? 'Meal details are syncing. Your evidence score will appear shortly.'
          : waitingForEvidence
            ? 'Add short meal notes across a few days so the report can identify useful patterns.'
            : 'You have enough diary evidence. Your report will generate on its weekly schedule.'}
      </Text>

      <View style={styles.reportPendingProgressCard}>
        <View style={styles.reportPendingProgressHead}>
          <Text style={styles.reportCountdownLabel}>REPORT EVIDENCE</Text>
          <View style={styles.reportPendingScoreRow}>
            <Text style={styles.reportPendingProgressValue}>{enrichment.available ? `${enrichment.score}%` : '—'}</Text>
            <Text style={styles.reportPendingProgressRequirement}>Minimum {enrichment.required}%</Text>
          </View>
        </View>
        {enrichment.available ? (
          <View
            style={[styles.reportTrack, styles.reportTrackTheme]}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Evidence for next diet report"
            accessibilityValue={{ min: 0, max: 100, now: enrichment.score, text: progressAccessibilityText }}
          >
            <View style={[styles.reportTrackFill, styles.reportTrackFillTheme, { width: `${enrichment.progress * 100}%` }]} />
            <View style={[styles.reportEnrichmentThresholdMarker, { left: `${enrichment.required}%` }]} />
          </View>
        ) : <View style={[styles.reportTrack, styles.reportTrackTheme]} />}
        <Text style={styles.reportEnrichmentResultText} accessibilityLiveRegion="polite">{progressStatus}</Text>
        {detailSummary ? <Text style={styles.reportPendingEvidenceFacts}>{detailSummary}</Text> : null}
        <View style={styles.reportPendingTip}>
          <Feather name="edit-3" size={15} color={REPORT_ACCENT} />
          <Text style={styles.reportPendingTipText}>
            {waitingForEvidence
              ? 'Main foods and sides are enough—calorie counting is optional.'
              : 'Keep logging naturally while your next review approaches.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DietReportLogMealButton({
  onPress,
  pending = false,
  embedded = false,
}: {
  onPress: () => void;
  pending?: boolean;
  embedded?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.reportLogMealButton,
        pending && styles.reportLogMealButtonPending,
        embedded && styles.reportLogMealButtonEmbedded,
      ]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pending ? 'Log a meal and add food details' : 'Log a meal'}
    >
      <View style={styles.reportLogMealButtonIcon} accessible={false}>
        <Feather name={pending ? 'edit-3' : 'plus'} size={17} color={pending ? REPORT_ACCENT : REPORT_INK} />
      </View>
      <View style={styles.reportLogMealButtonCopy}>
        <Text style={styles.reportLogMealButtonText}>Log a meal</Text>
        {pending ? <Text style={styles.reportLogMealButtonHint}>Food names are enough</Text> : null}
      </View>
      <Feather name="arrow-right" size={19} color={REPORT_PAGE} />
    </TouchableOpacity>
  );
}

function DietReportNoEvidenceState({
  feedback,
  interactive,
  artworkGender,
  onLogMeal,
}: {
  feedback: DietCoachFeedback;
  interactive: boolean;
  artworkGender?: string;
  onLogMeal?: () => void;
}) {
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const photoEntries = Math.max(0, Math.round(reportFiniteNumber(feedback.stats?.photoEntries) ?? 0));
  const hasDescribedEvidence = dietReportHasDescribedEvidence(feedback);
  const expandedCopy = viewportWidth < 380 || fontScale >= 1.2;

  if (interactive) {
    const guidance = hasDescribedEvidence
      ? 'Add a few more meal notes to make next week\u2019s review useful.'
      : photoEntries
        ? `${photoEntries} food photo${photoEntries === 1 ? '' : 's'} saved. Add food names and sides so ${photoEntries === 1 ? 'it counts' : 'they count'}.`
        : 'Log a few meals with short notes to build next week\u2019s review.';

    return (
      <View style={[styles.paperDocument, styles.reportNoDataDocument]} testID="diet-report-no-evidence">
        <View style={styles.reportNoDataHero}>
          <Image
            source={getDietReportEmptyArtwork(artworkGender)}
            style={styles.reportNoDataArtwork}
            resizeMode="cover"
            accessible={false}
            testID="diet-report-empty-art"
          />
          <View style={styles.reportNoDataArtworkWash} />
          <LinearGradient
            colors={expandedCopy
              ? ['rgba(5, 6, 9, 0.94)', 'rgba(5, 6, 9, 0.84)', 'rgba(5, 6, 9, 0.5)']
              : ['rgba(5, 6, 9, 0.96)', 'rgba(5, 6, 9, 0.82)', 'rgba(5, 6, 9, 0.08)']}
            locations={expandedCopy ? [0, 0.68, 1] : [0, 0.48, 0.82]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.reportNoDataArtworkShade}
            pointerEvents="none"
          />

          <View style={styles.reportNoDataHeroContent}>
            <View style={styles.paperMetaRow}>
              <Text style={styles.paperEyebrow}>WEEKLY DIET REPORT</Text>
              <View style={styles.reportNoDataPeriodChip}>
                <Text style={styles.reportNoDataPeriod}>{formatReportPeriod(feedback.weekStartDate, feedback.weekEndDate)}</Text>
              </View>
            </View>

            <View style={styles.reportNoDataHeroBottom}>
              <View style={[styles.reportNoDataHeroCopy, expandedCopy && styles.reportNoDataHeroCopyExpanded]}>
                <View style={styles.reportNoDataStatusRow}>
                  <View style={styles.reportNoDataStatusDot} accessible={false} />
                  <Text style={styles.reportNoDataStatus}>MORE DETAIL NEEDED</Text>
                </View>
                <Text
                  style={styles.reportNoDataHeroTitle}
                  accessibilityRole="header"
                  accessibilityLabel="Diet report needs more meal detail"
                >
                  Build a clearer food picture
                </Text>
                <Text style={styles.reportNoDataHeroBody}>{guidance}</Text>
              </View>
              {onLogMeal ? <DietReportLogMealButton onPress={onLogMeal} pending embedded /> : null}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.paperDocument} testID="diet-report-no-evidence">
      <View style={styles.reportNoDataHeader}>
        <View style={styles.paperMetaRow}>
          <Text style={styles.paperEyebrow}>WEEKLY DIET REPORT</Text>
          <Text style={styles.paperPeriod}>{formatReportPeriod(feedback.weekStartDate, feedback.weekEndDate)}</Text>
        </View>

        <View style={styles.reportNoDataIcon} accessible={false}>
          <Feather name="edit-3" size={22} color={REPORT_ACCENT} />
        </View>
        <Text
          style={styles.reportNoDataTitle}
          accessibilityRole="header"
          accessibilityLabel="No diet report generated"
        >
          No report generated
        </Text>
        <Text style={styles.reportNoDataBody}>
          {hasDescribedEvidence
            ? 'This review did not produce a reliable score, so it was not published.'
            : photoEntries
              ? `${photoEntries} food photo${photoEntries === 1 ? ' was' : 's were'} saved, but no meal descriptions were available for a useful review.`
              : interactive
                ? 'No described meals were available. Add meal details to build the next weekly report.'
                : 'No described meals were available for this period.'}
        </Text>
        {interactive && hasDescribedEvidence ? (
          <Text style={styles.reportNoDataProgressHint}>Add new meal details to build the next weekly report.</Text>
        ) : null}
      </View>
    </View>
  );
}

export function DietReportStory({
  feedback,
  interactive = true,
  artworkGender,
  onLogMeal,
}: {
  feedback: DietCoachFeedback;
  interactive?: boolean;
  artworkGender?: string;
  onLogMeal?: () => void;
}) {
  // The concise presentation intentionally keeps richer legacy fields readable
  // by the service layer without turning every field into another UI section.
  const showExtendedReportDetails = false;
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const stackReportGrid = viewportWidth < 380 || fontScale >= 1.2;
  const hasReportStats = Boolean(feedback.stats && typeof feedback.stats === 'object' && !Array.isArray(feedback.stats));
  const stats = hasReportStats ? feedback.stats : {
    loggedItems: 0,
    daysLogged: 0,
    memoryEntries: 0,
    photoEntries: 0,
    mealCounts: {},
    recentFoods: [],
  };
  const actions = reportStringArray(feedback.nextWeek?.actions);
  const priorities = reportObjectArray(feedback.priorityInsights)
    .filter(item => reportText(item.title) && reportText(item.observation));
  const reportMeals = reportObjectArray(feedback.mealGuidance)
    .filter(item => reportText(item.mealType) && (
      reportText(item.pattern) ||
      reportText(item.advice) ||
      reportFiniteNumber(item.observedCount) !== null
    ));
  const questions = reportStringArray(feedback.questionsForNextWeek);
  const questionResponses = reportObjectArray(feedback.questionResponses)
    .filter(item => typeof item.question === 'string' && typeof item.answer === 'string');
  const safetyNotices = reportObjectArray(feedback.safetyNotices)
    .filter(notice => typeof notice.body === 'string' && notice.body.trim());
  const genericSections = reportObjectArray(feedback.sections)
    .filter(section => reportText(section.title) && (
      reportText(section.summary) ||
      reportStringArray(section.paragraphs).length ||
      reportStringArray(section.items).length
    ));
  const implementation = feedback.nextWeek?.implementationPlan && typeof feedback.nextWeek.implementationPlan === 'object'
    ? feedback.nextWeek.implementationPlan
    : undefined;
  const reportWins = reportObjectArray(feedback.wins).filter(item => reportText(item.title));
  const wins = reportWins.length
    ? reportWins
    : reportStringArray(feedback.highlights).map(title => ({ title, detail: '', evidence: '' }));
  const focus = reportText(feedback.nextWeek?.primaryFocus) || reportText(feedback.nextFocus);
  const mealBuilder = feedback.nextWeek?.mealBuilder && typeof feedback.nextWeek.mealBuilder === 'object' && !Array.isArray(feedback.nextWeek.mealBuilder)
    ? feedback.nextWeek.mealBuilder
    : undefined;
  const patterns = reportObjectArray(feedback.patterns)
    .filter(item => reportText(item.title) && reportText(item.summary));
  const foodGroups = reportObjectArray(feedback.foodGroups)
    .filter(item => reportText(item.label));
  const smartSwaps = reportObjectArray(feedback.nextWeek?.smartSwaps)
    .filter(item => reportText(item.from) && reportText(item.to));
  const scoreIsAvailable = !feedback.score?.availability || feedback.score.availability === 'available';
  const scoreComponents = (scoreIsAvailable ? reportObjectArray(feedback.score?.components) : [])
    .filter(item => reportText(item.label) && reportFiniteNumber(item.score) !== null && (reportFiniteNumber(item.maxScore) || 0) > 0);
  const facts = reportObjectArray(feedback.facts)
    .filter(item => reportText(item.title) && (reportText(item.body) || reportText(item.sourceLabel)))
    .filter((item, index, list) => {
      const identity = reportText(item.sourceUrl) || reportText(item.id) || reportText(item.title).toLocaleLowerCase();
      return list.findIndex(candidate => (
        reportText(candidate.sourceUrl) || reportText(candidate.id) || reportText(candidate.title).toLocaleLowerCase()
      ) === identity) === index;
    });
  const limitations = reportStringArray(feedback.limitations);
  const goalSupports = reportStringArray(feedback.goalAlignment?.supports);
  const goalGaps = reportStringArray(feedback.goalAlignment?.gaps);
  const describedEntriesValue = reportFiniteNumber(stats.describedEntries ?? stats.memoryEntries);
  const scoreHasDiaryEvidence = describedEntriesValue === null || describedEntriesValue > 0;
  const score = scoreIsAvailable && scoreHasDiaryEvidence && reportFiniteNumber(feedback.score?.overall) !== null
    ? Math.max(0, Math.min(100, Math.round(feedback.score!.overall)))
    : null;
  const scoreChangeValue = reportFiniteNumber(feedback.score?.trend);
  const scoreChange = scoreChangeValue !== null ? Math.round(scoreChangeValue) : null;
  const describedEntries = hasReportStats ? describedEntriesValue : null;
  const daysLogged = hasReportStats
    ? reportFiniteNumber(stats.describedDaysLogged ?? stats.daysLogged)
    : null;
  const mealMoments = hasReportStats
    ? reportFiniteNumber(stats.mealMoments ?? stats.loggedItems)
    : null;
  const workoutsCompleted = hasReportStats ? reportFiniteNumber(stats.workoutsCompleted) : null;
  const generatedAt = formatReportGeneratedAt(feedback.generatedAt);
  const newerSchema = typeof feedback.schemaVersion === 'number' && feedback.schemaVersion > SUPPORTED_DIET_REPORT_SCHEMA_VERSION;
  const reportHeadline = reportText(feedback.headline) || reportText(feedback.title) || 'Your week at a glance';
  const reportSummary = reportText(feedback.summary) || 'Your diary has a useful next step for the coming week.';
  const headlineMetrics = [
    daysLogged !== null ? { value: daysLogged, label: daysLogged === 1 ? 'day with detail' : 'days with detail', icon: 'calendar' } : null,
    describedEntries !== null ? { value: describedEntries, label: describedEntries === 1 ? 'described meal' : 'described meals', icon: 'edit-3' } : null,
    mealMoments !== null ? { value: mealMoments, label: mealMoments === 1 ? 'meal moment' : 'meal moments', icon: 'clock' } : null,
  ].filter((item): item is { value: number; label: string; icon: string } => Boolean(item));
  const implementationRows = [
    { label: 'When', value: reportText(implementation?.cue) },
    { label: 'Do', value: reportText(implementation?.action), strong: true },
    { label: 'Backup', value: reportText(implementation?.fallback) },
    { label: 'Target', value: reportText(implementation?.successMeasure) },
  ].filter(item => item.value);
  const mealBuilderRows = [
    { label: 'Plants', value: reportText(mealBuilder?.plants), icon: 'sun' },
    { label: 'Protein', value: reportText(mealBuilder?.protein), icon: 'hexagon' },
    { label: 'Carbs', value: reportText(mealBuilder?.carbs), icon: 'circle' },
    { label: 'Extras', value: reportText(mealBuilder?.extras), icon: 'plus' },
  ].filter(item => item.value);
  const hasPlan = Boolean(focus || actions.length || implementationRows.length || reportText(feedback.nextWeek?.trackingFocus));
  const hasFindings = Boolean(wins.length || priorities.length || patterns.length);
  const hasMealData = Boolean(
    reportMeals.length ||
    foodGroups.length ||
    reportText(feedback.mealRhythm?.summary) ||
    reportText(feedback.mealRhythm?.strongestWindow) ||
    reportText(feedback.mealRhythm?.opportunityWindow)
  );
  const hasGoalContext = Boolean(reportText(feedback.goalAlignment?.summary) || goalSupports.length || goalGaps.length);
  const hasTrainingContext = Boolean(
    reportText(feedback.trainingNutrition?.summary) ||
    reportText(feedback.trainingNutrition?.trainingDayAction) ||
    reportText(feedback.trainingNutrition?.restDayAction)
  );
  const hasPracticalContext = Boolean(mealBuilderRows.length || smartSwaps.length || hasGoalContext || hasTrainingContext);

  const scoreUnavailableText = feedback.score?.availability === 'temporarilyUnavailable'
    ? 'Score unavailable'
    : 'Not scored';
  const scoreUnavailableNote = feedback.score?.availability === 'temporarilyUnavailable'
    ? 'Insights are still available.'
    : 'More meal detail is needed.';

  if (!dietReportIsPresentable(feedback)) {
    return (
      <DietReportNoEvidenceState
        feedback={feedback}
        interactive={interactive}
        artworkGender={artworkGender}
        onLogMeal={onLogMeal}
      />
    );
  }

  return (
    <View style={styles.paperDocument}>
      <View style={styles.paperHeader}>
        <View style={styles.paperMetaRow}>
          <Text style={styles.paperEyebrow}>WEEKLY DIET REPORT</Text>
          <Text style={styles.paperPeriod}>{formatReportPeriod(feedback.weekStartDate, feedback.weekEndDate)}</Text>
        </View>

        <Text style={styles.paperHeadline} accessibilityRole="header">{reportHeadline}</Text>
        <Text style={styles.paperSummary}>{reportSummary}</Text>

        <View
          style={[styles.reportOverviewBand, stackReportGrid && styles.reportOverviewBandStack]}
          accessibilityLabel="Weekly report summary"
        >
          <View style={styles.reportOverviewScore}>
            <Text style={styles.reportOverviewLabel}>PATTERN SCORE</Text>
            {score !== null ? (
              <>
                <View style={styles.reportOverviewScoreRow}>
                  <Text style={styles.reportOverviewScoreValue}>{score}</Text>
                  <Text style={styles.reportOverviewScoreMax}>/100</Text>
                </View>
                <View style={styles.reportOverviewScoreMeta}>
                  {reportText(feedback.score?.label) ? <Text style={styles.reportOverviewScoreName}>{reportText(feedback.score?.label)}</Text> : null}
                  <Text style={styles.reportOverviewTrend}>
                    {scoreChange === null ? 'Baseline' : scoreChange === 0 ? 'No change' : `${scoreChange > 0 ? '+' : ''}${scoreChange} vs last report`}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.reportOverviewUnavailable}>{scoreUnavailableText}</Text>
                <Text style={styles.reportOverviewUnavailableNote}>{scoreUnavailableNote}</Text>
              </>
            )}
          </View>

          {headlineMetrics.length ? (
            <View style={styles.reportOverviewStats}>
              {headlineMetrics.slice(0, 2).map(metric => (
                <View key={metric.label} style={styles.reportOverviewStat} accessible accessibilityLabel={`${metric.value} ${metric.label}`}>
                  <Text style={styles.reportOverviewStatValue}>{metric.value}</Text>
                  <Text style={styles.reportOverviewStatLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {newerSchema ? <Text style={styles.paperSchemaNotice}>Some newer report fields are shown as additional notes below.</Text> : null}
      </View>

      <ReportSafetyNotices notices={safetyNotices} />

      {hasPlan ? (
        <ReportPaperSection
          title={interactive ? 'Next 7 days' : 'Suggested protocol'}
          meta="One practical protocol based on this diary"
        >
          <View style={styles.paperFocusPanel}>
            {focus ? (
              <View style={styles.paperFocusHeader}>
                <Text style={styles.paperFocusMarker}>01</Text>
                <View style={styles.paperFocusCopy}>
                  <Text style={styles.paperFocusLabel}>{interactive ? 'PRIMARY FOCUS' : 'SUGGESTED FOCUS'}</Text>
                  <Text style={styles.paperFocusTitle}>{focus}</Text>
                </View>
              </View>
            ) : null}
            {reportText(feedback.nextWeek?.whyItMatters) ? <Text style={styles.paperFocusWhy}>{reportText(feedback.nextWeek?.whyItMatters)}</Text> : null}

            {actions.length ? (
              <View style={styles.paperActionList}>
                {actions.map((action, index) => (
                  <View key={`${action}-${index}`} style={styles.paperActionRow}>
                    <Text style={styles.paperActionNumber}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.paperActionText}>{action}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {showExtendedReportDetails && implementationRows.length ? (
              <View style={styles.paperDefinitionGrid}>
                {implementationRows.map(item => (
                  <View key={item.label} style={[styles.paperDefinitionCell, stackReportGrid && styles.paperGridItemFull]}>
                    <Text style={styles.paperDefinitionLabel}>{item.label}</Text>
                    <Text style={[styles.paperDefinitionValue, item.strong && styles.paperDefinitionValueStrong]}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {showExtendedReportDetails && reportText(feedback.nextWeek?.trackingFocus) ? (
              <View style={styles.paperTrackingRow}>
                <Feather name="eye" size={15} color={REPORT_ACCENT} />
                <Text style={styles.paperTrackingText}><Text style={styles.paperTrackingLabel}>Notice: </Text>{reportText(feedback.nextWeek?.trackingFocus)}</Text>
              </View>
            ) : null}
          </View>
        </ReportPaperSection>
      ) : null}

      {hasFindings ? (
        <ReportPaperSection title="What the diary supports" meta="Observed entries only; intake is not estimated">
          {wins.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Working well</Text>
              <View style={styles.paperRows}>
                {wins.map((win, index) => (
                  <View key={`${win.title}-${index}`} style={styles.paperWinRow}>
                    <Text style={styles.paperCheckIcon}>✓</Text>
                    <View style={styles.paperRowCopy}>
                      <Text style={styles.paperRowTitle}>{reportText(win.title)}</Text>
                      {reportText(win.detail) ? <Text style={styles.paperRowBody}>{reportText(win.detail)}</Text> : null}
                      {reportText(win.evidence) ? <Text style={styles.paperRowEvidence}>{reportText(win.evidence)}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {priorities.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Top opportunities</Text>
              <View style={styles.paperRows}>
                {priorities.map((insight, index) => (
                  <View key={`${insight.title}-${index}`} style={styles.paperInsightRow}>
                    <Text style={styles.paperInsightNumber}>{String(insight.rank || index + 1).padStart(2, '0')}</Text>
                    <View style={styles.paperRowCopy}>
                      <Text style={styles.paperRowTitle}>{reportText(insight.title)}</Text>
                      <Text style={styles.paperRowBody}>{reportText(insight.observation)}</Text>
                      {reportText(insight.whyItMatters) ? <Text style={styles.paperInsightWhy}>{reportText(insight.whyItMatters)}</Text> : null}
                      <ReportEvidenceLine items={reportStringArray(insight.evidence)} />
                      {reportText(insight.nextStep) ? (
                        <View style={styles.paperNextStep}>
                          <Text style={styles.paperNextStepLabel}>NEXT</Text>
                          <Text style={styles.paperNextStepText}>{reportText(insight.nextStep)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {patterns.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Weekly patterns</Text>
              <View style={styles.paperRows}>
                {patterns.map((pattern, index) => (
                  <View key={`${pattern.key || pattern.title}-${index}`} style={styles.paperPatternRow}>
                    <View style={styles.paperPatternTop}>
                      <Text style={styles.paperRowTitle}>{reportText(pattern.title)}</Text>
                      <ReportStatusText value={pattern.status} kind="pattern" />
                    </View>
                    <Text style={styles.paperRowBody}>{reportText(pattern.summary)}</Text>
                    <ReportEvidenceLine items={reportStringArray(pattern.evidence)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ReportPaperSection>
      ) : null}

      {showExtendedReportDetails && hasMealData ? (
        <ReportPaperSection title="Meals & food coverage" meta="What was observed, without calorie estimates" icon="pie-chart">
          {reportText(feedback.mealRhythm?.summary) || reportText(feedback.mealRhythm?.strongestWindow) || reportText(feedback.mealRhythm?.opportunityWindow) ? (
            <View style={styles.paperRhythmBlock}>
              <Text style={styles.paperRhythmTitle}>Meal rhythm</Text>
              {reportText(feedback.mealRhythm?.summary) ? <Text style={styles.paperRowBody}>{reportText(feedback.mealRhythm?.summary)}</Text> : null}
              <View style={styles.paperRhythmFacts}>
                {reportText(feedback.mealRhythm?.strongestWindow) ? (
                  <Text style={styles.paperRhythmFact}><Text style={styles.paperInlineLabel}>Most consistent: </Text>{reportText(feedback.mealRhythm?.strongestWindow)}</Text>
                ) : null}
                {reportText(feedback.mealRhythm?.opportunityWindow) ? (
                  <Text style={styles.paperRhythmFact}><Text style={styles.paperInlineLabel}>Opportunity: </Text>{reportText(feedback.mealRhythm?.opportunityWindow)}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {reportMeals.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Meal-by-meal</Text>
              <View style={styles.paperMealList}>
                {reportMeals.map((guidance, index) => {
                  const observedCount = reportFiniteNumber(guidance.observedCount);
                  const mealType = reportText(guidance.mealType);
                  const mealIcon = mealType === 'Breakfast' ? 'sunrise' : mealType === 'Lunch' ? 'sun' : mealType === 'Evening' ? 'sunset' : 'moon';
                  return (
                    <View key={`${mealType}-${index}`} style={styles.paperMealRow}>
                      <View style={styles.paperMealIcon}><Feather name={mealIcon} size={17} color={REPORT_ACCENT} /></View>
                      <View style={styles.paperRowCopy}>
                        <View style={styles.paperMealTop}>
                          <Text style={styles.paperRowTitle}>{mealType}</Text>
                          <Text style={styles.paperMealCount}>{observedCount === null ? 'Count unavailable' : `${observedCount} logged`}</Text>
                        </View>
                        <ReportStatusText value={guidance.status || (observedCount && observedCount > 0 ? 'observed' : 'limited')} kind="logging" />
                        {reportText(guidance.pattern) ? <Text style={styles.paperRowBody}>{reportText(guidance.pattern)}</Text> : null}
                        {reportText(guidance.advice) ? (
                          <Text style={styles.paperMealAdvice}><Text style={styles.paperInlineLabel}>Try: </Text>{reportText(guidance.advice)}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {foodGroups.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Food-group coverage</Text>
              <View style={styles.paperCoverageGrid}>
                {foodGroups.map((group, index) => {
                  const status = typeof group.status === 'string' ? group.status : 'limited';
                  const observedFoods = reportStringArray(group.observedFoods);
                  const positive = status === 'strong' || status === 'present';
                  return (
                    <View
                      key={`${group.key || group.label}-${index}`}
                      style={[styles.paperCoverageCell, stackReportGrid && styles.paperGridItemFull]}
                      accessible
                      accessibilityLabel={`${reportText(group.label)}: ${reportStatusLabel(status, 'presence')}${observedFoods.length ? `. ${observedFoods.join(', ')}` : ''}`}
                    >
                      <View style={styles.paperCoverageTop}>
                        <Text style={styles.paperCoverageLabel}>{reportText(group.label)}</Text>
                        <Text style={[styles.paperCoverageStatus, positive && styles.paperCoverageStatusPositive]}>{reportStatusLabel(status, 'presence')}</Text>
                      </View>
                      {observedFoods.length ? <Text style={styles.paperCoverageFoods}>{observedFoods.join(' · ')}</Text> : null}
                      {reportText(group.insight) ? <Text style={styles.paperCoverageInsight}>{reportText(group.insight)}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ReportPaperSection>
      ) : null}

      {showExtendedReportDetails && hasPracticalContext ? (
        <ReportPaperSection title="Make it practical" meta="A reusable meal formula and context for your goals" icon="compass">
          {mealBuilderRows.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>{reportText(mealBuilder?.title) || 'Balanced meal formula'}</Text>
              <View style={styles.paperBuilderGrid}>
                {mealBuilderRows.map(item => (
                  <View key={item.label} style={[styles.paperBuilderCell, stackReportGrid && styles.paperGridItemFull]}>
                    <View style={styles.paperBuilderIcon}><Feather name={item.icon} size={15} color={REPORT_ACCENT} /></View>
                    <View style={styles.paperRowCopy}>
                      <Text style={styles.paperDefinitionLabel}>{item.label}</Text>
                      <Text style={styles.paperBuilderValue}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {smartSwaps.length ? (
            <View style={styles.paperSubsection}>
              <Text style={styles.paperSubsectionTitle}>Easy swaps</Text>
              <View style={styles.paperRows}>
                {smartSwaps.map((swap, index) => (
                  <View key={`${swap.from}-${swap.to}-${index}`} style={styles.paperSwapRow}>
                    <View style={styles.paperSwapMain}>
                      <Text style={styles.paperSwapFrom}>{reportText(swap.from)}</Text>
                      <Feather name="arrow-right" size={15} color={REPORT_ACCENT} />
                      <Text style={styles.paperSwapTo}>{reportText(swap.to)}</Text>
                    </View>
                    {reportText(swap.why) ? <Text style={styles.paperRowBody}>{reportText(swap.why)}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {hasGoalContext ? (
            <View style={styles.paperContextBlock}>
              <View style={styles.paperContextTitleRow}>
                <Text style={styles.paperContextTitle}>Goal alignment</Text>
              </View>
              {reportText(feedback.goalAlignment?.summary) ? <Text style={styles.paperRowBody}>{reportText(feedback.goalAlignment?.summary)}</Text> : null}
              {goalSupports.length ? <Text style={styles.paperContextLine}><Text style={styles.paperInlineLabel}>Supports: </Text>{goalSupports.join(' · ')}</Text> : null}
              {goalGaps.length ? <Text style={styles.paperContextLine}><Text style={styles.paperInlineLabel}>Work on: </Text>{goalGaps.join(' · ')}</Text> : null}
            </View>
          ) : null}

          {hasTrainingContext ? (
            <View style={styles.paperContextBlock}>
              <View style={styles.paperContextTitleRow}>
                <Feather name="activity" size={16} color={REPORT_INFO} />
                <Text style={styles.paperContextTitle}>Training nutrition</Text>
                {workoutsCompleted !== null ? <Text style={styles.paperContextBadge}>{workoutsCompleted} workout{workoutsCompleted === 1 ? '' : 's'}</Text> : null}
              </View>
              {reportText(feedback.trainingNutrition?.summary) ? <Text style={styles.paperRowBody}>{reportText(feedback.trainingNutrition?.summary)}</Text> : null}
              {reportText(feedback.trainingNutrition?.trainingDayAction) ? <Text style={styles.paperContextLine}><Text style={styles.paperInlineLabel}>Training day: </Text>{reportText(feedback.trainingNutrition?.trainingDayAction)}</Text> : null}
              {reportText(feedback.trainingNutrition?.restDayAction) ? <Text style={styles.paperContextLine}><Text style={styles.paperInlineLabel}>Rest day: </Text>{reportText(feedback.trainingNutrition?.restDayAction)}</Text> : null}
            </View>
          ) : null}
        </ReportPaperSection>
      ) : null}

      {showExtendedReportDetails && score !== null && scoreComponents.length ? (
        <ReportPaperSection title="Score breakdown" meta="How the diary-based score was composed" icon="bar-chart-2">
          <View style={styles.paperComponentList}>
            {scoreComponents.map((component, index) => {
              const componentScore = reportFiniteNumber(component.score) || 0;
              const componentMaximum = reportFiniteNumber(component.maxScore) || 1;
              const percentage = Math.max(0, Math.min(100, (componentScore / componentMaximum) * 100));
              return (
                <View key={`${component.key}-${index}`} style={styles.paperComponentRow}>
                  <View style={styles.paperComponentTop}>
                    <Text style={styles.paperComponentLabel}>{reportText(component.label)}</Text>
                    <Text style={styles.paperComponentValue}>{componentScore}<Text style={styles.paperComponentMax}>/{componentMaximum}</Text></Text>
                  </View>
                  <View
                    style={styles.paperComponentTrack}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${reportText(component.label)}: ${componentScore} out of ${componentMaximum}`}
                    accessibilityValue={{ min: 0, max: componentMaximum, now: componentScore }}
                  >
                    <View style={[styles.paperComponentFill, { width: `${percentage}%` }]} />
                  </View>
                  {reportText(component.insight) ? <Text style={styles.paperComponentInsight}>{reportText(component.insight)}</Text> : null}
                </View>
              );
            })}
          </View>
        </ReportPaperSection>
      ) : null}

      {reportText(feedback.coachNote) ? (
        <ReportPaperSection title="Coach note" icon="message-circle">
          <View style={styles.paperCoachNote}>
            <View style={styles.paperCoachRule} />
            <Text style={styles.paperCoachText}>{reportText(feedback.coachNote)}</Text>
          </View>
        </ReportPaperSection>
      ) : null}

      {showExtendedReportDetails && genericSections.length ? (
        <ReportPaperSection title="Additional notes" meta="Useful details included by this report format" icon="file-text">
          <View style={styles.paperRows}>
            {genericSections.map((section, sectionIndex) => {
              const paragraphs = reportStringArray(section.paragraphs);
              const items = reportStringArray(section.items);
              return (
                <View key={section.id || `${section.title}-${sectionIndex}`} style={styles.paperGenericSection}>
                  <Text style={styles.paperRowTitle}>{reportText(section.title)}</Text>
                  {reportText(section.summary) ? <Text style={styles.paperRowBody}>{reportText(section.summary)}</Text> : null}
                  {paragraphs.map((paragraph, index) => <Text key={`${paragraph}-${index}`} style={styles.paperGenericParagraph}>{paragraph}</Text>)}
                  {items.map((item, index) => (
                    <View key={`${item}-${index}`} style={styles.paperGenericItem}>
                      <View style={styles.paperGenericDot} />
                      <Text style={styles.paperGenericItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </ReportPaperSection>
      ) : null}

      <ReportPaperSection
        title="Method & limits"
      >
        <View style={styles.paperAboutBox}>
          <Text style={styles.paperAboutText}>Patterns use only foods named in your diary. Portions, calories and nutrients are not inferred. General wellness guidance only.</Text>
          {limitations.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.paperLimitationRow}>
              <View style={styles.paperGenericDot} />
              <Text style={styles.paperLimitationText}>{item}</Text>
            </View>
          ))}
        </View>
      </ReportPaperSection>

      {facts.length ? (
        <ReportPaperSection title="Sources" meta="Articles and guidance used in this report">
          <View style={styles.paperSourceList}>
            {facts.map((fact, index) => {
              const sourceUrl = reportText(fact.sourceUrl);
              const canOpen = /^https:\/\//i.test(sourceUrl);
              const sourceName = reportText(fact.sourceLabel) || reportSourceDomain(sourceUrl) || 'Original source';
              const factTitle = reportText(fact.title);
              return (
                <TouchableOpacity
                  key={`${fact.id}-${index}`}
                  style={styles.paperSourceRow}
                  activeOpacity={canOpen ? 0.72 : 1}
                  disabled={!canOpen}
                  onPress={canOpen ? () => openReportLink(sourceUrl, 'Please try again, or search for the publisher shown in the report.').catch(() => undefined) : undefined}
                  accessibilityRole={canOpen ? 'link' : undefined}
                  accessibilityLabel={canOpen ? `Open ${factTitle} from ${sourceName}` : `${factTitle}, attributed to ${sourceName}`}
                >
                  <Text style={styles.paperSourceNumber}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.paperSourceCopy}>
                    <Text style={styles.paperSourceTitle}>{factTitle}</Text>
                    {reportText(fact.body) ? <Text style={styles.paperSourceBody}>{reportText(fact.body)}</Text> : null}
                    <Text style={styles.paperSourceMeta}>{sourceName}</Text>
                  </View>
                  {canOpen ? <Feather name="external-link" size={15} color={REPORT_INFO} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </ReportPaperSection>
      ) : null}

      {showExtendedReportDetails && interactive && questions.length ? (
        <View style={styles.paperSection}>
          <ReportQuestionsForm
            key={`${feedback.generatedAt}-${questions.join('|')}`}
            questions={questions}
            initialResponses={questionResponses}
            reportGeneratedAt={feedback.generatedAt}
          />
        </View>
      ) : null}

      <View style={styles.paperFooter}>
        <View style={styles.paperFooterCopy}>
          {generatedAt ? <Text style={styles.paperGenerated}>{generatedAt}</Text> : null}
          <Text style={styles.paperFooterNote}>See something inaccurate, missing, or unsafe?</Text>
        </View>
        <TouchableOpacity
          style={styles.paperIssueButton}
          activeOpacity={0.72}
          onPress={() => {
            const subject = encodeURIComponent('Diet report feedback');
            const body = encodeURIComponent(`Report generated: ${feedback.generatedAt}\n\nWhat seems inaccurate, missing, or unsafe?\n`);
            openReportLink(`mailto:team@formbae.in?subject=${subject}&body=${body}`, 'Email team@formbae.in to report an issue.').catch(() => undefined);
          }}
          accessibilityRole="button"
          accessibilityLabel="Report an issue with this diet report"
        >
          <Feather name="flag" size={16} color={REPORT_MUTED} />
          <Text style={styles.paperIssueButtonText}>Report issue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function isMemoryEntry(entry: DietDiaryEntry) {
  return entry.kind === 'text' || (!entry.uri && Boolean(entry.note?.trim()));
}

function isSkippedEntry(entry: DietDiaryEntry) {
  return entry.status === 'skipped' || entry.kind === 'skip';
}

function uniqueRewardEntries(entries: DietDiaryEntry[]) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    if (!isMemoryEntry(entry) && !isSkippedEntry(entry)) return false;
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
      accessibilityLabel={`${points} food logging stars`}
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
  if (shouldAuthenticateDietDiaryImage(uri) && token) {
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
  const profileGender = useProfileBodyGender();
  const [warmEntries] = useState(() => peekDietDiaryEntries());
  const [warmDiary] = useState(() => peekDietDiaryCached());
  const [entries, setEntries] = useState<DietDiaryEntry[]>(warmEntries ?? []);
  const [initialLoading, setInitialLoading] = useState(warmEntries === null);
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
  const [dietFeedback, setDietFeedback] = useState<DietCoachFeedback | null>(warmDiary?.feedback ?? null);
  const [preview, setPreview] = useState<DietDiaryEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<DietDiaryEntry | null>(null);
  const [editDeleteConfirmOpen, setEditDeleteConfirmOpen] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editMeal, setEditMeal] = useState<MealType>('Lunch');
  const [savingEdit, setSavingEdit] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textEntry, setTextEntry] = useState('');
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [timeEntry, setTimeEntry] = useState(() => new Date());
  const [rememberedMealTimes, setRememberedMealTimes] = useState<RememberedMealTimes>({});
  const [savedMeal, setSavedMeal] = useState<{
    mealType: MealType;
    note: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'log' | 'diary' | 'report' | 'reportHistory' | 'previousReport'>('log');
  const [reportReturnTab, setReportReturnTab] = useState<'log' | 'diary'>('log');
  const [selectedPreviousReport, setSelectedPreviousReport] = useState<DietCoachFeedback | null>(null);
  const saveToastOpacity = useRef(new Animated.Value(0)).current;
  const saveToastScale = useRef(new Animated.Value(0.86)).current;
  const handledCameraRequestRef = useRef<number | null>(null);
  const memoryDraftsRef = useRef(new Map<string, string>());
  const memoryTimesRef = useRef(new Map<string, Date>());

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
    loadRememberedMealTimes().then(setRememberedMealTimes).catch(() => undefined);
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
      uniqueRewardEntries(
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
      const dayEntries = entries.filter(entry => isSameDay(entry.createdAt, date));
      return {
        key: date.toDateString(),
        label: date.toLocaleDateString('en-IN', { weekday: 'narrow' }),
        points: uniqueRewardEntries(dayEntries).length,
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
  const reportFoodDetails = Math.max(0, Math.round(reportFiniteNumber(dietFeedback?.stats?.describedEntries) ?? 0));
  const reportDaysWithDetail = Math.max(0, Math.round(reportFiniteNumber(dietFeedback?.stats?.describedDaysLogged) ?? 0));
  const reportPayloadRejected = dietFeedback?.status === 'ready' && !dietReportIsPresentable(dietFeedback);
  const reportReady = dietFeedback?.status === 'ready' && dietReportIsPresentable(dietFeedback);
  const reportDays = reportDaysLeft(dietFeedback);
  const reportEnrichment = getDietReportEnrichmentState(dietFeedback);
  const reportEnrichmentHint = !reportEnrichment.available
    ? 'Evidence updates after your synced meal details are reviewed.'
    : reportEnrichment.score < reportEnrichment.required / 2
      ? 'Early — describe a few meals to help useful patterns emerge.'
      : reportEnrichment.score < reportEnrichment.required
        ? `Building — ${reportEnrichment.remaining}% more is needed before report generation.`
        : reportEnrichment.score < 75
          ? 'Minimum reached — keep logging naturally until the weekly review.'
          : 'Strong evidence coverage for a more detailed weekly review.';
  const reportCardMeta = reportReady
    ? reportEnrichment.available
      ? `Ready · ${reportEnrichment.score}% evidence`
      : 'Ready to view'
    : formatDaysToNextDietReport(reportDays);
  const previousReports = reportObjectArray(dietFeedback?.previousReports)
    .filter(dietReportIsPresentable);
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

  const memoryEntryForSlot = useCallback(
    (date: Date, mealType: MealType) =>
      entries.find(
        entry =>
          !isSkippedEntry(entry) &&
          isMemoryEntry(entry) &&
          entry.mealType === mealType &&
          isSameDay(entry.createdAt, date),
      ),
    [entries],
  );

  const memoryTextForSlot = useCallback(
    (date: Date, mealType: MealType) => {
      const key = memorySlotDraftKey(date, mealType);
      if (memoryDraftsRef.current.has(key)) {
        return memoryDraftsRef.current.get(key) || '';
      }
      return memoryEntryForSlot(date, mealType)?.note?.trim() || '';
    },
    [memoryEntryForSlot],
  );

  const memoryTimeForSlot = useCallback(
    (date: Date, mealType: MealType) => {
      const key = memorySlotDraftKey(date, mealType);
      const overridden = memoryTimesRef.current.get(key);
      if (overridden) return overridden;
      const existing = memoryEntryForSlot(date, mealType)
        || entries.find(
          entry =>
            isSkippedEntry(entry) &&
            entry.mealType === mealType &&
            isSameDay(entry.createdAt, date),
        );
      if (existing) return new Date(existing.createdAt);
      const remembered = rememberedMealTimes[mealType];
      if (remembered) {
        const occurrence = new Date(date);
        occurrence.setHours(remembered.hour, remembered.minute, 0, 0);
        // Today's remembered time may still be ahead; in that case retain the
        // current-slot fallback until that time actually arrives.
        if (occurrence.getTime() <= Date.now()) return occurrence;
      }
      return new Date(timestampForFoodSlot(date, mealType));
    },
    [entries, memoryEntryForSlot, rememberedMealTimes],
  );

  const openMemoryTimeEditor = () => {
    if (timeEditorOpen) {
      setTimeEditorOpen(false);
      return;
    }
    setTimeEntry(memoryTimeForSlot(selectedDate, selectedMeal));
    setTimeEditorOpen(true);
  };

  const updateMemoryTime = (transform: (value: Date) => void) => {
    const next = new Date(timeEntry);
    transform(next);
    if (!isSameDay(next, selectedDate) || next.getTime() > Date.now()) return;
    memoryTimesRef.current.set(memorySlotDraftKey(selectedDate, selectedMeal), next);
    setTimeEntry(next);
  };

  const setMemoryMeridiem = (period: 'AM' | 'PM') => {
    updateMemoryTime(next => {
      const hour = next.getHours() % 12;
      next.setHours(hour + (period === 'PM' ? 12 : 0));
    });
  };

  const moveMemorySlot = useCallback(
    (direction: -1 | 1) => {
      const next =
        direction < 0
          ? previousMemorySlot(selectedDate, selectedMeal)
          : nextMemorySlot(selectedDate, selectedMeal);
      if (!next) return;
      setTimeEditorOpen(false);
      const currentKey = memorySlotDraftKey(selectedDate, selectedMeal);
      memoryDraftsRef.current.set(currentKey, textEntry);
      setSelectedDate(next.date);
      setSelectedMeal(next.mealType);
      setTextEntry(memoryTextForSlot(next.date, next.mealType));
    },
    [memoryTextForSlot, selectedDate, selectedMeal, textEntry],
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
    const entryTime = memoryTimeForSlot(entryDate, entryMeal);
    try {
      const existingEntry = memoryEntryForSlot(entryDate, entryMeal);
      const isNewEntry = !existingEntry;
      const noteChanged = existingEntry?.note?.trim() !== note;
      const timeChanged = existingEntry
        ? Math.abs(new Date(existingEntry.createdAt).getTime() - entryTime.getTime()) >= 60_000
        : false;
      const localEntry = existingEntry
        ? {
            ...existingEntry,
            note,
            createdAt: entryTime.toISOString(),
            syncError: noteChanged || timeChanged ? undefined : existingEntry.syncError,
          }
        : await addTextDietDiaryEntry(
            entryMeal,
            note,
            entryTime.toISOString(),
          );
      if (existingEntry && (noteChanged || timeChanged)) {
        await updateDietDiaryEntry(existingEntry.id, {
          note,
          createdAt: entryTime.toISOString(),
          syncError: undefined,
        });
      }
      const learnedTime = {
        hour: entryTime.getHours(),
        minute: entryTime.getMinutes(),
      };
      setRememberedMealTimes(current => ({
        ...current,
        [entryMeal]: learnedTime,
      }));
      rememberMealTime(entryMeal, entryTime).catch(() => undefined);
      const entriesAfterSave = [
        localEntry,
        ...entries.filter(entry => entry.id !== localEntry.id),
      ];
      setEntries(entriesAfterSave);
      memoryDraftsRef.current.delete(memorySlotDraftKey(entryDate, entryMeal));
      memoryTimesRef.current.delete(memorySlotDraftKey(entryDate, entryMeal));
      setTextEntry('');
      if (isNewEntry) showSavedMealAnimation(entryMeal, note);
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
        const previousKey = memorySlotDraftKey(previousMissed.date, previousMissed.mealType);
        setTextEntry(
          memoryDraftsRef.current.has(previousKey)
            ? memoryDraftsRef.current.get(previousKey) || ''
            : entriesAfterSave.find(
                entry =>
                  !isSkippedEntry(entry) &&
                  isMemoryEntry(entry) &&
                  entry.mealType === previousMissed.mealType &&
                  isSameDay(entry.createdAt, previousMissed.date),
              )?.note?.trim() || '',
        );
      }
      if (existingEntry && !noteChanged && !timeChanged) return true;
      await load();
      try {
        const uploaded = existingEntry?.remoteId
          ? await updateRemoteDietDiaryEntry(existingEntry.remoteId, {
              mealType: localEntry.mealType,
              note,
              createdAt: entryTime.toISOString(),
            })
          : await uploadTextDietDiaryEntry({
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
    const savedText = memoryEntryForSlot(selectedDate, selectedMeal)?.note?.trim() || '';
    if (!textEntry.trim() || textEntry.trim() === savedText) {
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
    memoryDraftsRef.current.clear();
    memoryTimesRef.current.clear();
    setTextEntry(memoryEntryForSlot(suggestedMemorySlot.date, suggestedMemorySlot.mealType)?.note?.trim() || '');
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
      memoryDraftsRef.current.delete(memorySlotDraftKey(selectedDate, selectedMeal));
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

  const deleteEntry = async (entry: DietDiaryEntry) => {
    setDeletingEntryId(entry.id);
    try {
      if (entry.remoteId) await deleteRemoteDietDiaryEntry(entry.remoteId);
      await deleteDietDiaryEntry(entry.id);
      setPreview(null);
      setEditingEntry(null);
      setEditDeleteConfirmOpen(false);
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
  };

  const confirmDelete = (entry: DietDiaryEntry) => {
    const isTextEntry = entry.kind === 'text' || !entry.uri;
    Alert.alert(
      isTextEntry ? 'Delete meal note?' : 'Delete food photo?',
      `This removes the ${isTextEntry ? 'note' : 'photo'} from your diet diary.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(entry) },
      ],
    );
  };

  const openEntryEditor = (entry: DietDiaryEntry) => {
    setPreview(null);
    setEditDeleteConfirmOpen(false);
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
          <View style={styles.entryBody}>
            <View style={styles.entryMetaRow}>
              <View style={[styles.entryMealDot, { backgroundColor: appearance.color }]} />
              <Text style={[styles.entryMealLabel, { color: appearance.color }]}>
                {mealLabel(entry.mealType)} · {formatFoodTime(entry.createdAt)}
              </Text>
            </View>
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
          <Feather name="edit-2" size={15} color={colors.inkSubtle} />
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
      accessibilityLabel={`Open diet report. ${reportCardMeta}`}
    >
      <View style={styles.secondaryCardIcon}>
        <Feather name="file-text" size={20} color={colors.gold} />
      </View>
      <View style={styles.secondaryCardCopy}>
        <Text style={styles.secondaryCardTitle}>View Diet Report</Text>
        <Text style={styles.secondaryCardMeta} numberOfLines={1}>
          {reportCardMeta}
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
              <Text style={styles.reportEnrichmentLabel}>Diet report enrichment</Text>
              <Text style={styles.reportEnrichmentValue}>
                {reportEnrichment.available ? `${reportEnrichment.score}%` : '—'}
                <Text style={styles.reportEnrichmentRequirementInline}> / {reportEnrichment.required}% required</Text>
              </Text>
            </View>
            {reportEnrichment.available ? (
              <View
                style={styles.reportEnrichmentTrack}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Evidence for next diet report"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: reportEnrichment.score,
                  text: `${reportEnrichment.score} percent; ${reportEnrichment.required} percent required`,
                }}
              >
                <View style={[styles.reportEnrichmentFill, { width: `${reportEnrichment.progress * 100}%` }]} />
                <View style={[styles.reportEnrichmentThresholdMarker, { left: `${reportEnrichment.required}%` }]} />
              </View>
            ) : <View style={styles.reportEnrichmentTrack} />}
            <Text style={styles.reportEnrichmentHint}>
              {reportEnrichmentHint}{unsyncedCount ? ' Updates after meals sync.' : ''}
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
          </View>
          <View style={styles.diarySummaryStats}>
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyDiaryItems} food items logged this week`}
            >
              <Text style={styles.diarySummaryValue}>{weeklyDiaryItems}</Text>
              <Text style={styles.diarySummaryLabel}>Food items</Text>
            </View>
            <View style={styles.diarySummaryStatDivider} />
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyMealMoments} meals logged this week`}
            >
              <Text style={styles.diarySummaryValue}>{weeklyMealMoments}</Text>
              <Text style={styles.diarySummaryLabel}>Meals</Text>
            </View>
            <View style={styles.diarySummaryStatDivider} />
            <View
              style={styles.diarySummaryStat}
              accessible
              accessibilityLabel={`${weeklyDaysSeen} of 7 active days this week`}
            >
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
            accessibilityLabel={`Open diet report. ${reportCardMeta}`}
          >
            <View style={styles.diaryReportIcon}>
              <Feather name={reportReady ? 'check' : reportPayloadRejected ? 'edit-3' : 'clock'} size={16} color={colors.gold} />
            </View>
            <View style={styles.diaryReportCopy}>
              <Text style={styles.diaryReportTitle}>View Diet Report</Text>
              <Text style={styles.diaryReportMeta}>
                {reportCardMeta}
              </Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.gold} />
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
            <Text style={styles.diaryMemoryMeta}>Add to your food memory</Text>
          </View>
          <Feather name="arrow-right" size={18} color={colors.gold} />
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
              <Text style={styles.sectionMeta}>
                {section.mealCount === section.entries.length
                  ? `${section.mealCount} meal${section.mealCount === 1 ? '' : 's'}`
                  : `${section.mealCount} meal${section.mealCount === 1 ? '' : 's'} · ${section.entries.length} item${section.entries.length === 1 ? '' : 's'}`}
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

  const openReportMealLogger = () => {
    setActiveTab('log');
    openMemoryGame();
  };

  const renderReport = () => (
    <View style={[styles.subpage, !reportReady && styles.reportPendingViewport]}>
      {reportPayloadRejected && dietFeedback ? (
        <DietReportStory
          feedback={dietFeedback}
          artworkGender={profileGender}
          onLogMeal={openReportMealLogger}
        />
      ) : !reportReady ? (
        <DietReportPendingState
          feedback={dietFeedback}
          foodDetails={reportFoodDetails}
          daysWithDetail={reportDaysWithDetail}
        />
      ) : (
        <DietReportStory feedback={dietFeedback} artworkGender={profileGender} />
      )}

      {!reportPayloadRejected ? (
        <View style={[styles.reportFooterAction, !reportReady && styles.reportFooterActionPending]}>
          {reportReady ? (
            <View style={styles.reportFooterCopy}>
              <Text style={styles.reportFooterTitle}>Add context for next week</Text>
              <Text style={styles.reportFooterText}>A short description is enough; calorie counting is not required.</Text>
            </View>
          ) : null}
          <DietReportLogMealButton
            onPress={openReportMealLogger}
            pending={!reportReady}
          />
        </View>
      ) : null}
    </View>
  );

  const renderReportHistory = () => (
    <View style={[styles.subpage, styles.reportArchive]}>
      <View style={styles.reportArchiveIntro}>
        <Text style={styles.reportArchiveEyebrow}>WEEKLY NUTRITION REVIEWS</Text>
        <Text style={styles.reportArchiveTitle}>Previous diet reports</Text>
        <Text style={styles.reportArchiveText}>
          Revisit the patterns, coaching notes and next steps saved from earlier weeks.
        </Text>
      </View>
      {previousReports.length ? (
        <View style={styles.reportArchiveList}>
          {previousReports.map((report, index) => {
            const score = (!report.score?.availability || report.score.availability === 'available') && reportFiniteNumber(report.score?.overall) !== null
              ? Math.round(report.score!.overall)
              : null;
            return (
              <TouchableOpacity
                key={report.generatedAt || `${report.weekStartDate}-${index}`}
                activeOpacity={0.82}
                style={styles.reportArchiveCard}
                onPress={() => {
                  setSelectedPreviousReport(report);
                  setActiveTab('previousReport');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open diet report for ${formatReportPeriod(report.weekStartDate, report.weekEndDate)}`}
              >
                <View style={styles.reportArchiveCardTop}>
                  <View style={styles.reportArchiveCardCopy}>
                    <Text style={styles.reportArchivePeriod}>{formatReportPeriod(report.weekStartDate, report.weekEndDate)}</Text>
                    <Text style={styles.reportArchiveGenerated}>{formatReportGeneratedAt(report.generatedAt)}</Text>
                  </View>
                  {score !== null ? (
                    <View style={styles.reportArchiveScore}>
                      <Text style={styles.reportArchiveScoreValue}>{score}</Text>
                      <Text style={styles.reportArchiveScoreMax}>/100</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.reportArchiveHeadline} numberOfLines={2}>
                  {report.headline || report.title || 'Weekly diet report'}
                </Text>
                {report.summary ? <Text style={styles.reportArchiveSummary} numberOfLines={2}>{report.summary}</Text> : null}
                <View style={styles.reportArchiveOpenRow}>
                  <Text style={styles.reportArchiveOpenText}>View full report</Text>
                  <Feather name="arrow-right" size={16} color={REPORT_ACCENT} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.reportArchiveEmpty}>
          <View style={styles.reportArchiveEmptyIcon}><Feather name="archive" size={22} color={REPORT_ACCENT} /></View>
          <Text style={styles.reportArchiveEmptyTitle}>No previous reports yet</Text>
          <Text style={styles.reportArchiveEmptyText}>After your next weekly report is generated, the current one will be saved here.</Text>
        </View>
      )}
    </View>
  );

  const renderPreviousReport = () => selectedPreviousReport ? (
    <View style={styles.subpage}>
      <DietReportStory feedback={selectedPreviousReport} interactive={false} />
    </View>
  ) : renderReportHistory();

  const reportSurfaceActive = ['report', 'reportHistory', 'previousReport'].includes(activeTab);
  const unpublishedReportViewportActive = activeTab === 'report' && !reportReady && !initialLoading;

  return (
    <ScreenContainer style={reportSurfaceActive ? styles.reportScreenTheme : undefined}>
      <ScrollView
        style={reportSurfaceActive ? styles.reportScrollTheme : undefined}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[
          styles.scroll,
          unpublishedReportViewportActive && styles.reportViewportContent,
          { paddingBottom: tabBarHeight + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={reportSurfaceActive ? REPORT_ACCENT : colors.accent}
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
          <View style={[styles.screenHeader, styles.subpageHeader, reportSurfaceActive && styles.reportSubpageHeader, reportSurfaceActive && styles.reportHeaderTheme]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (activeTab === 'previousReport') {
                  setSelectedPreviousReport(null);
                  setActiveTab('reportHistory');
                } else if (activeTab === 'reportHistory') {
                  setActiveTab('report');
                } else {
                  setActiveTab(activeTab === 'report' ? reportReturnTab : 'log');
                }
              }}
              style={[styles.headerIconButton, reportSurfaceActive && styles.reportHeaderIconButton]}
              accessibilityRole="button"
              accessibilityLabel="Back to diet"
            >
              <Feather name="arrow-left" size={19} color={reportSurfaceActive ? REPORT_INK : colors.ink} />
            </TouchableOpacity>
            <Text style={[styles.subpageTitle, reportSurfaceActive && styles.reportSubpageTitle]}>
              {activeTab === 'diary'
                ? 'Food diary'
                : activeTab === 'reportHistory'
                  ? 'Report history'
                  : activeTab === 'previousReport'
                    ? 'Previous report'
                    : 'Diet report'}
            </Text>
            {activeTab === 'report' ? (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.reportHistoryAction, styles.reportHistoryActionTheme]}
                onPress={() => setActiveTab('reportHistory')}
                accessibilityRole="button"
                accessibilityLabel="See previous diet reports"
              >
                <Feather name="archive" size={16} color={REPORT_INK} />
                <Text style={[styles.reportHistoryActionText, styles.reportHistoryActionTextTheme]}>History</Text>
              </TouchableOpacity>
            ) : activeTab === 'reportHistory' && previousReports.length ? (
              <View style={[styles.diaryCountChip, styles.reportCountChipTheme]}>
                <Text style={[styles.diaryCountText, styles.reportCountTextTheme]}>{previousReports.length}</Text>
              </View>
            ) : null}
          </View>
        )}

        {initialLoading ? (
          <View style={styles.initialLoading}>
            <View style={[styles.loadingCard, reportSurfaceActive && styles.reportLoadingCardTheme]} />
            <View style={[styles.loadingCardTall, reportSurfaceActive && styles.reportLoadingCardTheme]} />
            <Text style={[styles.loadingText, reportSurfaceActive && styles.reportLoadingTextTheme]}>Loading your food log…</Text>
          </View>
        ) : activeTab === 'diary' ? (
          renderDiaryFeed()
        ) : activeTab === 'report' ? (
          renderReport()
        ) : activeTab === 'reportHistory' ? (
          renderReportHistory()
        ) : activeTab === 'previousReport' ? (
          renderPreviousReport()
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
        onRequestClose={() => {
          if (editDeleteConfirmOpen) setEditDeleteConfirmOpen(false);
          else if (!savingEdit) setEditingEntry(null);
        }}
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
                onPress={() => {
                  setEditDeleteConfirmOpen(false);
                  setEditingEntry(null);
                }}
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
              {editingEntry ? (
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setEditDeleteConfirmOpen(true);
                  }}
                  disabled={savingEdit || deletingEntryId === editingEntry.id}
                  style={styles.editDeleteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Delete diary entry"
                >
                  {deletingEntryId === editingEntry.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Feather name="trash-2" size={18} color={colors.error} />
                  )}
                  <Text style={styles.editDeleteButtonText}>Delete entry</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
          {editDeleteConfirmOpen && editingEntry ? (
            <View style={styles.timeModalBackdrop}>
              <View style={styles.timeModalCard}>
                <View style={styles.deleteConfirmIcon}>
                  <Feather name="trash-2" size={21} color={colors.error} />
                </View>
                <Text style={styles.timeModalTitle}>Delete entry?</Text>
                <Text style={styles.deleteConfirmText}>
                  This removes it from your food diary.
                </Text>
                <View style={styles.timeModalActions}>
                  <TouchableOpacity
                    onPress={() => setEditDeleteConfirmOpen(false)}
                    disabled={deletingEntryId === editingEntry.id}
                    style={styles.timeCancelButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.timeCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteEntry(editingEntry)}
                    disabled={deletingEntryId === editingEntry.id}
                    style={styles.editDeleteConfirmButton}
                    accessibilityRole="button"
                  >
                    {deletingEntryId === editingEntry.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.editDeleteConfirmText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </ScreenContainer>
      </Modal>

      <Modal
        visible={textModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={timeEditorOpen ? () => setTimeEditorOpen(false) : closeTextEditor}
      >
        <ScreenContainer withBottomInset style={styles.editorScreen}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editorKeyboardView}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorHeaderCopy}>
                <Text style={styles.editorTitle} numberOfLines={1}>Food memory</Text>
              </View>
              <View
                style={styles.editorScore}
                accessibilityLabel={`${weeklyMemoryPoints} food logging stars`}
              >
                <Feather name="star" size={14} color={colors.gold} />
                <Text style={styles.editorScoreText}>{weeklyMemoryPoints}</Text>
              </View>
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
                  {selectedMealSkip ? (
                    <Text style={styles.slotMeta}>
                      {formatDiaryDate(selectedDate)} · {formatFoodTime(memoryTimeForSlot(selectedDate, selectedMeal).toISOString())}
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={openMemoryTimeEditor}
                      style={styles.slotTimeButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit meal time, currently ${formatEditableTime(memoryTimeForSlot(selectedDate, selectedMeal))}`}
                    >
                      <Text style={styles.slotMeta}>
                        {formatDiaryDate(selectedDate)} · {formatFoodTime(memoryTimeForSlot(selectedDate, selectedMeal).toISOString())}
                      </Text>
                      <Feather name="edit-2" size={11} color={colors.inkSubtle} />
                    </TouchableOpacity>
                  )}
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
              {timeEditorOpen && !selectedMealSkip ? (
                <View style={styles.inlineTimeEditor}>
                  <View style={styles.inlineTimeHeader}>
                    <View>
                      <Text style={styles.inlineTimeLabel}>MEAL TIME</Text>
                      <Text style={styles.inlineTimeHint}>Saved with this meal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setTimeEditorOpen(false)}
                      style={styles.inlineTimeClose}
                      accessibilityRole="button"
                      accessibilityLabel="Close meal time controls"
                    >
                      <Feather name="check" size={16} color={colors.ink} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inlineTimeControls}>
                    <TouchableOpacity
                      onPress={() => updateMemoryTime(value => value.setHours(value.getHours() - 1))}
                      style={styles.inlineTimeStep}
                      accessibilityRole="button"
                      accessibilityLabel="One hour earlier"
                    >
                      <Feather name="minus" size={16} color={colors.ink} />
                    </TouchableOpacity>
                    <Text style={styles.inlineTimeValue}>{timeEntry.getHours() % 12 || 12}</Text>
                    <TouchableOpacity
                      onPress={() => updateMemoryTime(value => value.setHours(value.getHours() + 1))}
                      style={styles.inlineTimeStep}
                      accessibilityRole="button"
                      accessibilityLabel="One hour later"
                    >
                      <Feather name="plus" size={16} color={colors.ink} />
                    </TouchableOpacity>
                    <Text style={styles.inlineTimeColon}>:</Text>
                    <TouchableOpacity
                      onPress={() => updateMemoryTime(value => value.setMinutes(value.getMinutes() - 15))}
                      style={styles.inlineTimeStep}
                      accessibilityRole="button"
                      accessibilityLabel="Fifteen minutes earlier"
                    >
                      <Feather name="minus" size={16} color={colors.ink} />
                    </TouchableOpacity>
                    <Text style={styles.inlineTimeValue}>{String(timeEntry.getMinutes()).padStart(2, '0')}</Text>
                    <TouchableOpacity
                      onPress={() => updateMemoryTime(value => value.setMinutes(value.getMinutes() + 15))}
                      style={styles.inlineTimeStep}
                      accessibilityRole="button"
                      accessibilityLabel="Fifteen minutes later"
                    >
                      <Feather name="plus" size={16} color={colors.ink} />
                    </TouchableOpacity>
                    <View style={styles.inlineTimePeriod}>
                      {(['AM', 'PM'] as const).map(period => {
                        const selected = (timeEntry.getHours() >= 12 ? 'PM' : 'AM') === period;
                        return (
                          <TouchableOpacity
                            key={period}
                            onPress={() => setMemoryMeridiem(period)}
                            style={[styles.inlineTimePeriodButton, selected && styles.inlineTimePeriodButtonSelected]}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                          >
                            <Text style={[styles.inlineTimePeriodText, selected && styles.inlineTimePeriodTextSelected]}>{period}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
              <View style={[styles.memoryAnswerStage, selectedMealSkip && styles.memoryAnswerStageCompleted]}>
                {selectedMealSkip ? (
                  <View style={styles.skippedPanel}>
                    <View style={styles.skippedRewardIcon}>
                      <Feather name="minus-circle" size={20} color={colors.inkMuted} />
                    </View>
                    <View style={styles.skippedCopy}>
                      <Text style={styles.skippedTitle}>{mealLabel(selectedMeal)} skipped</Text>
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
                ) : (
                  <>
                  <TextInput
                    value={textEntry}
                    onChangeText={value => {
                      setTextEntry(value);
                      const key = memorySlotDraftKey(selectedDate, selectedMeal);
                      memoryDraftsRef.current.set(key, value);
                    }}
                    placeholder={mealRecallPlaceholders[selectedMeal]}
                    placeholderTextColor={colors.inkSubtle}
                    multiline
                    textAlignVertical="top"
                    style={styles.textInput}
                    maxLength={280}
                    autoFocus
                    accessibilityLabel={`What you remember for ${mealLabel(selectedMeal)}`}
                  />
                  {!selectedMealEntryCount ? (
                    <TouchableOpacity
                      activeOpacity={0.82}
                      style={[
                        styles.skipMealAction,
                        Boolean(textEntry.trim()) && styles.skipMealActionDisabled,
                      ]}
                      onPress={markMealSkipped}
                      disabled={saving || Boolean(textEntry.trim())}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${selectedMeal} as skipped`}
                      accessibilityState={{ disabled: saving || Boolean(textEntry.trim()) }}
                    >
                      <Feather name="minus-circle" size={17} color={colors.inkSubtle} />
                      <Text style={styles.skipMealTitle}>I skipped this meal</Text>
                    </TouchableOpacity>
                  ) : null}
                  </>
                )}
              </View>
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
                  onPress={() => {
                    if (!selectedMealSkip) {
                      saveTextEntry({ moveToPreviousMissed: true });
                      return;
                    }
                    const previousMissed = previousUnloggedMealSlot(
                      selectedDate,
                      selectedMeal,
                      slot => entries.some(
                        entry => entry.mealType === slot.mealType && isSameDay(entry.createdAt, slot.date),
                      ),
                    );
                    setSelectedDate(previousMissed.date);
                    setSelectedMeal(previousMissed.mealType);
                    setTextEntry(memoryTextForSlot(previousMissed.date, previousMissed.mealType));
                  }}
                  loading={saving}
                  disabled={!textEntry.trim() && !selectedMealSkip}
                  style={styles.modalActionButton}
                />
              </View>
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
            <Feather name="star" size={18} color={colors.onPrimary} />
          </View>
          <View style={styles.saveToastCopy}>
            <Text style={styles.saveToastTitle}>+1 star</Text>
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
  reportScreenTheme: { paddingBottom: 0, backgroundColor: REPORT_PAGE },
  reportScrollTheme: { flex: 1, backgroundColor: REPORT_PAGE },
  reportViewportContent: { flexGrow: 1 },

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
  reportSubpageHeader: { width: '100%', maxWidth: 640, minHeight: 56, alignSelf: 'center' },
  reportHeaderTheme: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: REPORT_BORDER },
  screenTitleWrap: { flex: 1, minWidth: 0 },
  subpageTitle: {
    ...typography.title,
    color: colors.ink,
    flex: 1,
    minWidth: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  reportSubpageTitle: { ...reportTypography.heading, color: REPORT_INK },
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
  reportHeaderIconButton: { width: 38, height: 38, backgroundColor: REPORT_SURFACE, borderWidth: 0 },
  reportHistoryAction: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportHistoryActionText: { ...reportTypography.bodyStrong, fontSize: 12, lineHeight: 16, color: colors.ink },
  reportHistoryActionTheme: { backgroundColor: REPORT_SURFACE, borderWidth: 0 },
  reportHistoryActionTextTheme: { color: REPORT_INK },
  reportCountChipTheme: { backgroundColor: REPORT_SURFACE, borderColor: REPORT_BORDER },
  reportCountTextTheme: { color: REPORT_MUTED },
  diaryCountChip: {
    minWidth: 56,
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
  reportLoadingCardTheme: { backgroundColor: REPORT_SURFACE },
  reportLoadingTextTheme: { color: REPORT_MUTED },

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
    backgroundColor: REPORT_SAGE,
  },
  reportTrackTheme: { backgroundColor: REPORT_BORDER },
  reportTrackFillTheme: { backgroundColor: REPORT_ACCENT },

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
    flexWrap: 'wrap',
    alignItems: 'flex-start',
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
  reportEnrichmentRequirementInline: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkSubtle,
    fontWeight: '600',
  },
  reportEnrichmentTrack: {
    height: 7,
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
  reportEnrichmentThresholdMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: REPORT_INK,
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
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    backgroundColor: colors.warnLight,
    padding: spacing.md,
  },
  skippedRewardIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  skippedCopy: { flex: 1, minWidth: 0 },
  skippedTitle: { ...typography.bodyBold, color: colors.ink },
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
  subpage: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  reportPendingViewport: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportArchive: { paddingTop: spacing.sm },
  reportArchiveIntro: {
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: REPORT_BORDER,
  },
  reportArchiveEyebrow: {
    ...typography.overline,
    color: REPORT_ACCENT,
    letterSpacing: 1,
  },
  reportArchiveTitle: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    color: REPORT_INK,
    marginTop: spacing.xs,
  },
  reportArchiveText: {
    fontSize: 15,
    lineHeight: 23,
    color: REPORT_MUTED,
    marginTop: spacing.sm,
    maxWidth: 520,
  },
  reportArchiveList: { paddingTop: spacing.md, gap: spacing.md },
  reportArchiveCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: REPORT_BORDER,
    backgroundColor: REPORT_PAGE,
  },
  reportArchiveCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportArchiveCardCopy: { flex: 1, minWidth: 0 },
  reportArchivePeriod: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: REPORT_INK },
  reportArchiveGenerated: { fontSize: 13, lineHeight: 19, color: REPORT_SUBTLE, marginTop: 2 },
  reportArchiveScore: { flexDirection: 'row', alignItems: 'baseline' },
  reportArchiveScoreValue: { fontSize: 24, lineHeight: 29, fontWeight: '800', color: REPORT_INK },
  reportArchiveScoreMax: { fontSize: 13, lineHeight: 19, color: REPORT_SUBTLE },
  reportArchiveHeadline: { fontSize: 20, lineHeight: 27, fontWeight: '700', color: REPORT_INK, marginTop: spacing.lg },
  reportArchiveSummary: { fontSize: 15, lineHeight: 23, color: REPORT_MUTED, marginTop: spacing.xs },
  reportArchiveOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: REPORT_BORDER,
  },
  reportArchiveOpenText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: REPORT_ACCENT },
  reportArchiveEmpty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: spacing.lg },
  reportArchiveEmptyIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: REPORT_ACCENT_SURFACE },
  reportArchiveEmptyTitle: { fontSize: 19, lineHeight: 26, fontWeight: '700', color: REPORT_INK, marginTop: spacing.md },
  reportArchiveEmptyText: { maxWidth: 360, fontSize: 14, lineHeight: 22, color: REPORT_MUTED, textAlign: 'center', marginTop: spacing.xs },
  diarySummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  diarySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  diarySummaryStat: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  diarySummaryStatDivider: { width: 1, height: 38, alignSelf: 'center', backgroundColor: colors.border },
  diarySummaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  diarySummaryValue: {
    fontSize: 21,
    lineHeight: 25,
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
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
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
  diaryMemoryCta: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  diaryMemoryIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaryMemoryCopy: { flex: 1, minWidth: 0 },
  diaryMemoryTitle: { ...typography.bodyBold, color: colors.ink },
  diaryMemoryMeta: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  section: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, flexShrink: 1 },
  sectionMeta: { ...typography.caption, color: colors.inkMuted },
  entryList: { borderTopWidth: 1, borderTopColor: colors.panelRaised },
  entryRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.panelRaised,
    paddingVertical: 9,
  },
  entryOpenAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryPhoto: { width: 40, height: 40, borderRadius: radius.sm },
  entryBody: { flex: 1, minWidth: 0 },
  entryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  entryMealDot: { width: 6, height: 6, borderRadius: radius.pill },
  entryMealLabel: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  entryName: { ...typography.body, color: colors.ink, fontWeight: '600', lineHeight: 20, marginTop: 2 },
  entryEditButton: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  reportDocument: { marginBottom: spacing.xl },
  reportCover: {
    padding: 20,
    marginBottom: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    ...shadows.card,
  },
  reportCoverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reportCoverHeaderCopy: { flex: 1, minWidth: 0 },
  reportCoverEyebrow: { ...typography.overline, color: colors.gold, letterSpacing: 1.15 },
  reportCoverPeriod: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  reportCoverScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  reportCoverScore: { flexDirection: 'row', alignItems: 'baseline', minWidth: 88 },
  reportCoverScoreValue: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.5, color: colors.ink },
  reportCoverScoreMax: { ...typography.caption, color: colors.inkMuted, marginLeft: 2 },
  reportCoverScoreCopy: { flex: 1, minWidth: 0 },
  reportCoverScoreLabel: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: colors.ink },
  reportCoverTrend: { ...typography.caption, color: colors.inkMuted, marginTop: 3 },
  reportCoverHeadline: { fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: -0.45, color: colors.ink, marginTop: spacing.xl },
  reportCoverSummary: { fontSize: 15, lineHeight: 23, color: colors.inkMuted, marginTop: spacing.sm },
  reportCoverStats: { flexDirection: 'row', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  reportCoverStat: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  reportCoverStatDivided: { borderLeftWidth: 1, borderLeftColor: colors.border },
  reportCoverStatValue: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: colors.ink },
  reportCoverStatLabel: { fontSize: 10, lineHeight: 14, color: colors.inkMuted, marginTop: 2 },
  reportChapterHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  reportChapterIndex: { width: 26, paddingTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.gold, letterSpacing: 0.7 },
  reportChapterCopy: { flex: 1, minWidth: 0 },
  reportChapterEyebrow: { ...typography.overline, color: colors.inkSubtle, letterSpacing: 1.05 },
  reportChapterHeading: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2, color: colors.ink, marginTop: 1 },
  reportFocusPanel: { padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, ...shadows.sm },
  reportFocusIcon: { width: 0, height: 0 },
  reportFocusLabel: { ...typography.overline, color: colors.gold },
  reportFocusTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3, color: colors.ink, marginTop: spacing.xs },
  reportFocusWhy: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: spacing.sm },
  reportFocusSteps: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  reportFocusStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md },
  reportFocusStepNumber: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primaryAction },
  reportFocusStepNumberText: { fontSize: 11, lineHeight: 14, color: colors.onPrimary, fontWeight: '900' },
  reportFocusStepText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.ink, paddingBottom: spacing.xs },
  reportImplementation: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgTint },
  reportImplementationLabel: { ...typography.overline, color: colors.gold },
  reportImplementationCue: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },
  reportImplementationAction: { ...typography.bodyBold, color: colors.ink, marginTop: 3 },
  reportImplementationDetails: { gap: spacing.xs, marginTop: spacing.sm },
  reportImplementationDetail: { ...typography.caption, color: colors.inkMuted },
  reportFindingsPanel: { paddingHorizontal: spacing.xs, marginBottom: spacing.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  reportFinding: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg },
  reportFindingDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  reportFindingIndex: { width: 26, ...typography.caption, color: colors.inkSubtle, fontWeight: '800', letterSpacing: 0.5 },
  reportFindingCopy: { flex: 1, minWidth: 0 },
  reportFindingTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  reportFindingTitle: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  reportFindingConfidence: { fontSize: 9, lineHeight: 12, color: colors.inkSubtle, fontWeight: '700', textTransform: 'uppercase' },
  reportFindingObservation: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: spacing.xs },
  reportFindingWhy: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
  reportFindingActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm },
  reportFindingAction: { ...typography.label, color: colors.ink, flex: 1 },
  reportMealGuidePanel: { paddingHorizontal: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportMealGuideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md },
  reportMealGuideRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  reportMealGuideIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  reportMealGuideCopy: { flex: 1, minWidth: 0 },
  reportMealGuideTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reportMealGuideTitle: { ...typography.bodyBold, color: colors.ink },
  reportMealGuideCount: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  reportMealGuidePattern: { fontSize: 15, lineHeight: 23, color: colors.ink, marginTop: spacing.sm },
  reportMealGuideAdvice: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, flex: 1 },
  reportEmpty: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, paddingVertical: spacing.lg },
  reportPendingHero: {
    alignItems: 'flex-start',
    paddingTop: spacing.md,
    paddingBottom: 0,
    marginBottom: 0,
  },
  reportPendingEyebrow: {
    ...reportTypography.label,
    color: REPORT_ACCENT,
  },
  reportPendingTitle: { ...reportTypography.display, maxWidth: 520, color: REPORT_INK, marginTop: spacing.md },
  reportPendingBody: { ...reportTypography.body, maxWidth: 520, color: REPORT_MUTED, marginTop: spacing.xs },
  reportCountdownLabel: { ...reportTypography.label, color: REPORT_SUBTLE },
  reportMasthead: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  reportMastheadEyebrow: { ...typography.overline, color: colors.gold, letterSpacing: 1.4 },
  reportMastheadTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.45,
    color: colors.ink,
    marginTop: 4,
  },
  reportMastheadPeriod: { ...typography.label, color: colors.inkMuted, marginTop: 3 },
  reportSectionHeading: {
    paddingHorizontal: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  reportSectionHeadingEyebrow: { ...typography.overline, color: colors.gold, letterSpacing: 1.2 },
  reportSectionHeadingTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.25,
    color: colors.ink,
    marginTop: 2,
  },
  reportChapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  reportChapterNumber: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
  },
  reportChapterNumberText: {
    ...typography.caption,
    color: colors.inkMuted,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportSectionEyebrow: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
  },
  reportSectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  reportSectionIntro: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  reportPriorityList: { marginTop: spacing.sm },
  reportPriority: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportPriorityRank: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportPriorityRankText: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  reportPriorityCopy: { flex: 1, minWidth: 0 },
  reportPriorityTitle: { ...typography.bodyBold, color: colors.ink },
  reportPriorityObservation: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 3 },
  reportPriorityWhy: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  reportPriorityActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm },
  reportPriorityAction: { ...typography.label, color: colors.ink, flex: 1 },
  reportScoreHero: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
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
    backgroundColor: colors.panelRaised,
  },
  reportLatestPillText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  reportScoreMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reportScoreRing: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 5,
    borderColor: colors.goldMuted,
    backgroundColor: colors.panelRaised,
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
  reportScoreLabel: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.ink },
  reportScoreTrend: { ...typography.label, color: colors.success, marginTop: 4 },
  reportScoreTrendDown: { color: colors.error },
  reportHeadline: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.ink, marginTop: spacing.md },
  reportSummary: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs, lineHeight: 21 },
  reportChartCard: {
    padding: 0,
    marginBottom: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  reportChartHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportChartHeaderStacked: { flexDirection: 'column', alignItems: 'stretch' },
  reportChartTitleBlock: { flex: 1, minWidth: 0 },
  reportChartTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600', color: colors.ink, marginTop: 2 },
  reportChartSubtitle: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: 3 },
  reportChartTotal: { alignItems: 'flex-end' },
  reportChartTotalValue: { fontSize: 26, lineHeight: 30, fontWeight: '900', color: colors.ink },
  reportChartTotalLabel: { fontSize: 14, lineHeight: 20, color: colors.inkSubtle },
  reportChartPlot: {
    height: 132,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reportChartColumn: { flex: 1, minWidth: 36, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  reportChartValue: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, fontWeight: '700', marginBottom: 5 },
  reportChartValueMuted: { color: colors.inkSubtle },
  reportChartBarTrack: { flex: 1, width: '58%', justifyContent: 'flex-end' },
  reportChartBar: {
    width: '100%',
    minHeight: 4,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: colors.gold,
  },
  reportChartBarEmpty: { backgroundColor: colors.panelRaised },
  reportChartBarMissing: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  reportChartLabel: { fontSize: 14, lineHeight: 20, color: colors.inkSubtle, fontWeight: '600', marginTop: 7, marginBottom: 7 },
  reportChartFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingTop: spacing.sm },
  reportChartFooterText: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, flex: 1 },
  reportChartDataList: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  reportChartDataHeading: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.ink, paddingVertical: spacing.sm },
  reportChartDataRow: {
    minHeight: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportChartDataLabel: { flex: 1, minWidth: 120, fontSize: 14, lineHeight: 21, color: colors.inkMuted },
  reportChartDataValue: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: colors.ink },
  reportChartDataValueMissing: { color: colors.inkSubtle, fontStyle: 'italic' },
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
  reportHistoryCopy: { flex: 1, minWidth: 0 },
  reportHistoryPeriod: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.ink },
  reportHistoryLabel: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 1 },
  reportHistoryTrack: {
    flex: 1,
    height: 5,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportHistoryFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryAction },
  reportHistoryScore: { ...typography.bodyBold, width: 30, color: colors.ink, textAlign: 'right' },
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
  reportComponentLabel: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.ink, flex: 1 },
  reportComponentValue: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.ink },
  reportComponentMax: { fontSize: 14, lineHeight: 20, color: colors.inkSubtle },
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
    backgroundColor: colors.primaryAction,
  },
  reportComponentInsight: { fontSize: 14, lineHeight: 22, color: colors.inkMuted, marginTop: spacing.sm },
  reportWinList: { marginTop: spacing.md, gap: spacing.md },
  reportWin: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reportWinIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportWinCopy: { flex: 1, minWidth: 0 },
  reportWinTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.ink },
  reportWinDetail: { fontSize: 16, lineHeight: 24, color: colors.inkMuted, marginTop: 2 },
  reportEvidence: { fontSize: 14, lineHeight: 22, color: colors.inkSubtle, marginTop: spacing.xs },
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
  reportPatternEvidence: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
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
    color: colors.inkMuted,
    textTransform: 'capitalize',
    fontWeight: '800',
  },
  reportFoodGroupStatusStrong: { color: colors.success },
  reportObservedFoods: { ...typography.label, color: colors.ink, marginTop: spacing.sm },
  reportFoodGroupInsight: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
  reportInsightGrid: { marginBottom: 0, borderTopWidth: 1, borderTopColor: colors.border },
  reportInsightCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportInsightTitle: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: colors.ink },
  reportInsightSummary: { fontSize: 13, lineHeight: 18, color: colors.inkMuted, marginTop: spacing.xs, marginBottom: spacing.xs },
  reportInsightBody: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, flex: 1 },
  reportInsightSignal: { ...typography.caption, color: colors.gold, marginTop: spacing.sm },
  reportActionPlan: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
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
    backgroundColor: colors.primaryAction,
  },
  reportActionEyebrow: { ...typography.overline, color: colors.inkSubtle },
  reportActionTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
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
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelRaised,
  },
  reportActionNumberText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  reportActionItemText: { fontSize: 14, lineHeight: 20, color: colors.ink, flex: 1 },
  reportExperiment: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportExperimentCard: { padding: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportExperimentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  reportExperimentCue: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },
  reportExperimentAction: { ...typography.bodyBold, color: colors.ink, marginTop: 3 },
  reportExperimentMetaList: { marginTop: spacing.sm, gap: spacing.xs },
  reportExperimentMeta: { ...typography.caption, color: colors.inkMuted },
  reportTrainingAction: {
    ...typography.label,
    color: colors.ink,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
    minHeight: 142,
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
    color: colors.inkMuted,
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportMealAdvicePattern: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
  reportMealAdviceText: { ...typography.label, color: colors.ink, marginTop: spacing.xs },
  reportMealBuilder: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    backgroundColor: colors.panelRaised,
  },
  reportFactCopy: { flex: 1, minWidth: 0 },
  reportFactTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.ink },
  reportFactBody: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: 4 },
  reportFactSource: { ...typography.caption, color: colors.inkMuted, textDecorationLine: 'underline', marginTop: spacing.sm },
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
  reportQuestionList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportQuestion: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  reportQuestionNumber: { width: 22, height: 22, textAlign: 'center', textAlignVertical: 'center', borderRadius: radius.pill, backgroundColor: colors.panelRaised, ...typography.caption, color: colors.gold, fontWeight: '900' },
  reportQuestionText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  reportMethodNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportMethodText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

  // Diet report editorial system
  reportGroup: { marginBottom: spacing.xl },
  reportGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  reportGroupIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
  },
  reportGroupCopy: { flex: 1, minWidth: 0 },
  reportGroupEyebrow: { ...typography.overline, color: colors.gold, letterSpacing: 1.1 },
  reportGroupTitle: { fontSize: 21, lineHeight: 27, fontWeight: '900', letterSpacing: -0.28, color: colors.ink, marginTop: 1 },
  reportGroupDetail: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  reportCoverMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    backgroundColor: colors.accentLight,
  },
  reportLatestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panelRaised,
  },
  reportLatestDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.success },
  reportLatestText: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: colors.inkMuted },
  reportScoreRingV2: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  reportScoreRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  reportScoreRingValue: { fontSize: 29, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8, color: colors.ink },
  reportScoreRingMax: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: colors.inkSubtle },
  reportScoreMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  reportScoreTrendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.successLight },
  reportScoreTrendPillDown: { backgroundColor: colors.errorLight },
  reportScoreTrendText: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: colors.success },
  reportScoreTrendTextDown: { color: colors.error },
  reportConfidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  reportConfidenceText: { ...typography.caption, color: colors.inkSubtle, textTransform: 'capitalize' },
  reportDataQuality: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  reportDataQualityText: { ...typography.caption, color: colors.inkSubtle, lineHeight: 18, flex: 1 },
  reportStatusPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.infoLight,
  },
  reportStatusPillPositive: { backgroundColor: colors.successLight },
  reportStatusPillAttention: { backgroundColor: colors.warnLight },
  reportStatusDot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: colors.info },
  reportStatusDotPositive: { backgroundColor: colors.success },
  reportStatusDotAttention: { backgroundColor: colors.gold },
  reportStatusPillText: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: colors.info, textTransform: 'capitalize' },
  reportStatusPillTextPositive: { color: colors.success },
  reportImplementationHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  reportImplementationRow: { minWidth: 128, flexBasis: 138, flexGrow: 1, alignItems: 'flex-start', gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.panelMuted },
  reportImplementationKey: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.inkSubtle, paddingTop: 1 },
  reportImplementationValue: { width: '100%', fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  reportImplementationValueStrong: { width: '100%', fontSize: 15, lineHeight: 23, color: colors.ink, fontWeight: '700' },
  reportTrackingFocus: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportTrackingFocusText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18 },
  reportPriorityCards: { gap: spacing.sm },
  reportPriorityCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportPriorityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportPriorityNumber: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  reportPriorityNumberText: { fontSize: 10, lineHeight: 13, fontWeight: '900', color: colors.gold, letterSpacing: 0.5 },
  reportPriorityCardTitle: { ...typography.bodyBold, color: colors.ink, flex: 1, minWidth: 0 },
  reportPriorityCardObservation: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: spacing.md },
  reportWhyBox: { paddingLeft: spacing.sm, marginTop: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.borderStrong },
  reportWhyLabel: { ...typography.overline, color: colors.inkSubtle },
  reportWhyText: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 2 },
  reportNextStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentLight },
  reportNextStepText: { ...typography.label, color: colors.ink, flex: 1, lineHeight: 19, fontWeight: '800' },
  reportEvidenceList: { gap: 5, marginTop: spacing.sm },
  reportEvidenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reportEvidenceDot: { width: 4, height: 4, marginTop: 7, borderRadius: radius.pill, backgroundColor: colors.inkSubtle },
  reportEvidenceText: { fontSize: 14, lineHeight: 22, color: colors.inkSubtle, flex: 1 },
  reportWinsPanel: { padding: spacing.md, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted, gap: spacing.md },
  reportSubsectionLabel: { ...typography.overline, color: colors.gold, letterSpacing: 1 },
  reportMealAdvice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: spacing.sm, marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.panelMuted },
  reportFoodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  reportFoodChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  reportFoodChipText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  reportSignalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  reportSignalLabel: { color: colors.ink, fontWeight: '800' },
  reportTrainingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportTrainingIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.panelRaised },
  reportTrainingCopy: { flex: 1, minWidth: 0 },
  reportTrainingLabel: { ...typography.overline, color: colors.inkSubtle },
  reportTrainingText: { ...typography.label, color: colors.ink, lineHeight: 19, marginTop: 2 },
  reportMealBuilderKey: { width: 66 },
  reportCoachCard: { padding: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm },
  reportCoachTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportCoachTitle: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  reportFactSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  reportMethodCopy: { flex: 1, minWidth: 0, gap: 5 },
  reportMethodTitle: { ...typography.label, color: colors.ink, fontWeight: '800', marginBottom: 2 },
  reportChartScroll: { flexGrow: 1 },
  reportTrendChange: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  reportTrendChangeDown: {},
  reportTrendChangeText: { fontSize: 14, lineHeight: 20, color: colors.success, fontWeight: '700' },
  reportTrendChangeTextDown: { color: colors.error },
  reportTrendChangeTextNeutral: { color: colors.inkMuted },
  reportLineViewport: { minHeight: 194, marginTop: spacing.md },
  reportLineLabels: { flexDirection: 'row', paddingHorizontal: spacing.xs },
  reportLineLabel: { flex: 1, minWidth: 56, fontSize: 14, lineHeight: 20, color: colors.inkSubtle, textAlign: 'center' },
  reportLineValue: { color: colors.ink, fontWeight: '700' },
  reportPendingProgressCard: { width: '100%', padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: REPORT_BORDER, borderRadius: radius.lg, backgroundColor: REPORT_SURFACE },
  reportPendingProgressHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  reportPendingScoreRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'flex-end', gap: spacing.sm },
  reportPendingProgressValue: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: REPORT_ACCENT },
  reportPendingProgressRequirement: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: REPORT_MUTED },
  reportPendingMetaRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reportPendingCadence: { ...reportTypography.data, fontSize: 10, lineHeight: 16, color: REPORT_SUBTLE },
  reportEnrichmentResultText: { fontSize: 13, lineHeight: 20, fontWeight: '700', color: REPORT_INK, marginTop: spacing.xs },
  reportPendingEvidenceFacts: { fontSize: 12, lineHeight: 18, color: REPORT_SUBTLE, marginTop: 2 },
  reportPendingTip: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, marginTop: spacing.md, borderRadius: radius.sm, backgroundColor: REPORT_PAGE },
  reportPendingTipText: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, flex: 1 },
  reportFooterAction: { paddingTop: spacing.lg, marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: REPORT_BORDER, gap: spacing.lg },
  reportFooterActionPending: { paddingTop: 0, marginTop: 0, borderTopWidth: 0, gap: 0 },
  reportFooterCopy: { gap: 3 },
  reportFooterTitle: { ...reportTypography.heading, color: REPORT_INK },
  reportFooterText: { ...reportTypography.body, color: REPORT_MUTED },
  reportLogMealButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: REPORT_INK },
  reportLogMealButtonPending: { minHeight: 64, backgroundColor: REPORT_ACCENT },
  reportLogMealButtonEmbedded: { marginTop: spacing.lg, borderRadius: radius.lg },
  reportLogMealButtonIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: REPORT_PAGE },
  reportLogMealButtonCopy: { flex: 1, minWidth: 0 },
  reportLogMealButtonText: { ...reportTypography.bodyStrong, fontSize: 15, lineHeight: 20, color: REPORT_PAGE },
  reportLogMealButtonHint: { ...reportTypography.body, marginTop: 1, fontSize: 11, lineHeight: 16, color: 'rgba(5, 6, 9, 0.66)' },

  // Weekly diet report — calm editorial presentation
  reportStatusTextRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  reportStatusTextDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
  },
  reportStatusTextDotPositive: { backgroundColor: REPORT_SAGE },
  reportStatusTextDotAttention: { backgroundColor: colors.info },
  reportStatusText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  reportEditorialHeading: { marginBottom: spacing.lg },
  reportEditorialEyebrow: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.inkSubtle,
  },
  reportEditorialTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.ink,
    marginTop: 4,
  },
  reportEditorialDetail: {
    maxWidth: 560,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkMuted,
    marginTop: 5,
  },
  reportDisclosure: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportDisclosureButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportDisclosureIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: REPORT_SAGE_SURFACE,
  },
  reportDisclosureCopy: { flex: 1, minWidth: 0 },
  reportDisclosureTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: colors.ink,
  },
  reportDisclosureMeta: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 2,
  },
  reportDisclosureContent: { marginTop: spacing.md },
  reportDisclosureList: { borderBottomWidth: 1, borderBottomColor: colors.border },
  reportEditorialHero: {
    overflow: 'hidden',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportEditorialMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reportHeroBadgeDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: REPORT_SAGE },
  reportHeroBadgeText: { fontSize: 12, lineHeight: 17, fontWeight: '800', letterSpacing: 1, color: colors.inkMuted },
  reportEditorialLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.inkSubtle,
  },
  reportEditorialDateBlock: { alignItems: 'flex-end' },
  reportEditorialPeriod: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  reportEditorialGenerated: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSubtle,
    marginTop: spacing.sm,
  },
  reportHeroMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  reportHeroMainCompact: { alignItems: 'flex-start' },
  reportHeroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
  reportHeroArtWrap: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  reportHeroArtWrapCompact: { position: 'absolute', width: 104, height: 104, right: -22, top: 42, opacity: 0.3 },
  reportHeroArtGlow: { position: 'absolute', width: 112, height: 112, borderRadius: radius.pill, backgroundColor: REPORT_SAGE_SURFACE, borderWidth: 1, borderColor: 'rgba(168,191,178,0.26)' },
  reportHeroArt: { width: '100%', height: '100%' },
  reportEditorialHeadline: {
    maxWidth: 420,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.65,
    color: colors.ink,
    marginTop: 0,
  },
  reportEditorialSummary: {
    maxWidth: 440,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportSnapshotRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingRight: spacing.md },
  reportScoreTile: { width: 190, padding: spacing.md, borderRadius: radius.lg, backgroundColor: REPORT_SAGE_SURFACE, borderWidth: 1, borderColor: 'rgba(168,191,178,0.24)' },
  reportScoreTileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportScoreTileLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.8, color: REPORT_SAGE },
  reportScoreTileFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 2 },
  reportMetricTile: { width: 104, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  reportMetricTileValue: { fontSize: 22, lineHeight: 27, fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
  reportMetricTileLabel: { fontSize: 12, lineHeight: 17, color: colors.inkMuted, marginTop: 1 },
  reportScoreUnavailable: { fontSize: 22, lineHeight: 29, fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
  reportScoreUnavailableNote: { fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 2 },
  reportTrustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  reportTrustText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.inkSubtle },
  reportConfidenceNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  reportConfidenceNoteText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.inkSubtle },
  reportCarouselContent: { gap: spacing.md, paddingRight: spacing.lg },
  reportCarouselHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  reportCarouselHintText: { fontSize: 12, lineHeight: 17, color: colors.inkSubtle },
  reportCarouselPagination: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  reportCarouselDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reportCarouselDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  reportCarouselDotActive: { width: 18, backgroundColor: REPORT_SAGE },
  reportCarouselPageText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: colors.inkSubtle },
  reportScoreSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  reportScoreValueBlock: { minWidth: 138, flexGrow: 0 },
  reportScoreLabelSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: colors.inkSubtle,
  },
  reportScoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 3,
  },
  reportScoreNumber: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.ink,
  },
  reportScoreDenominator: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSubtle,
    marginLeft: 3,
  },
  reportScoreDescriptor: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.ink,
  },
  reportScoreDelta: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkMuted,
    marginTop: 2,
  },
  reportScoreDeltaDown: { color: colors.error },
  reportScoreContext: {
    maxWidth: 180,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSubtle,
    marginTop: spacing.sm,
  },
  reportCoverageBlock: { flex: 1, minWidth: 210 },
  reportCoverageLabel: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 4,
  },
  reportCoverageText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkMuted,
    marginTop: 4,
  },
  reportMetricLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reportMetricInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportMetricDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.inkSubtle,
  },
  reportMetricInlineText: { fontSize: 14, lineHeight: 21, color: colors.inkMuted },
  reportMetricInlineValue: { fontWeight: '700', color: colors.ink },
  reportAiDisclosure: {
    maxWidth: 580,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkMuted,
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
  },
  reportSchemaNotice: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkMuted,
    marginTop: spacing.md,
  },
  reportSafetyList: { gap: spacing.sm, marginTop: spacing.xl },
  reportSafetyNotice: {
    padding: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.border,
    borderLeftColor: colors.info,
    backgroundColor: colors.panel,
  },
  reportSafetyNoticeWarning: { borderLeftColor: colors.warn },
  reportSafetyNoticeUrgent: { borderLeftColor: colors.error },
  reportSafetyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportSafetyTitle: { flex: 1, fontSize: 18, lineHeight: 25, fontWeight: '700', color: colors.ink },
  reportSafetyBody: { fontSize: 16, lineHeight: 25, color: colors.inkMuted, marginTop: spacing.sm },
  reportEditorialSection: { marginTop: spacing.xl },
  reportPlanPanel: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  reportPlanFocusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reportPlanFocusIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primaryAction },
  reportPlanFocusCopy: { flex: 1, minWidth: 0 },
  reportPlanFocusLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.9, color: REPORT_SAGE },
  reportPlanFocus: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.25,
    color: colors.ink,
    marginTop: 2,
  },
  reportPlanWhy: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportPlanActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  reportImplementationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reportPlanActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
  },
  reportPlanActionCheck: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: REPORT_SAGE_SURFACE },
  reportPlanActionIndex: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: REPORT_SAGE },
  reportPlanActionNumber: {
    width: 28,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.inkSubtle,
  },
  reportPlanActionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  reportTrackingPrompt: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportTrackingLabel: { color: colors.ink, fontWeight: '700' },
  reportImplementationFlat: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportFlatSubhead: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.inkSubtle,
  },
  reportTrackingText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkMuted,
  },
  reportWinsFlat: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.lg,
  },
  reportWinsGrid: { gap: spacing.sm },
  reportWinFlatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
  },
  reportStoryWinIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.successLight },
  reportInsightCards: { gap: spacing.sm, marginTop: spacing.lg },
  reportInlineSectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.ink },
  reportStoryInsightCard: { overflow: 'hidden', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  reportInsightCardButton: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md },
  reportStoryInsightIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  reportInsightIconText: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: REPORT_SAGE },
  reportInsightCardCopy: { flex: 1, minWidth: 0 },
  reportInsightCardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink },
  reportInsightCardBody: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: 3 },
  reportInsightTryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: REPORT_SAGE_SURFACE },
  reportInsightTryIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  reportInsightTryText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.ink },
  reportInsightExpanded: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reportInsightArticles: { borderTopWidth: 1, borderTopColor: colors.border },
  reportInsightArticle: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reportInsightArticleTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportInsightOrdinal: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.inkSubtle,
  },
  reportInsightArticleTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.sm,
  },
  reportInsightArticleBody: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportInsightWhy: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  reportInsightWhyLabel: { fontWeight: '700', color: colors.ink },
  reportInsightAction: {
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
  },
  reportInsightActionText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 4,
  },
  reportCoachEditorial: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: REPORT_SAGE_SURFACE,
  },
  reportCoachEditorialLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.inkSubtle,
  },
  reportCoachEditorialText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  reportQuestionPanel: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderTopWidth: 3,
    borderColor: colors.border,
    borderTopColor: colors.info,
    backgroundColor: colors.panel,
  },
  reportQuestionPanelHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reportQuestionPanelCopy: { flex: 1, minWidth: 190 },
  reportQuestionPanelEyebrow: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.info },
  reportQuestionPanelTitle: { fontSize: 20, lineHeight: 27, fontWeight: '700', color: colors.ink, marginTop: 2 },
  reportQuestionProgress: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.inkMuted },
  reportQuestionDots: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  reportQuestionDot: { flex: 1, maxWidth: 48, height: 4, borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  reportQuestionDotAnswered: { backgroundColor: colors.borderStrong },
  reportQuestionDotActive: { backgroundColor: colors.info },
  reportQuestionPrompt: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: colors.ink, marginTop: spacing.md },
  reportQuestionInput: {
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginTop: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgTint,
    fontSize: 16,
    lineHeight: 25,
    color: colors.ink,
  },
  reportQuestionCharacterCount: { alignSelf: 'flex-end', fontSize: 14, lineHeight: 20, color: colors.inkSubtle, marginTop: spacing.xs },
  reportQuestionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  reportQuestionSecondaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportQuestionPrimaryButton: {
    minWidth: 170,
    minHeight: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryAction,
  },
  reportQuestionButtonDisabled: { opacity: 0.42 },
  reportQuestionSecondaryText: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.inkMuted },
  reportQuestionPrimaryText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.onPrimary },
  reportQuestionSaveStatus: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: spacing.md },
  reportQuestionSaveStatusComplete: { color: colors.success },
  reportCoachQuestions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportCoachQuestionText: { fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  reportMealGuideFlatList: { gap: spacing.md },
  reportMealGuideFlatRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportMealGuideFlatTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reportMealGuideFlatTitle: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  reportMealGuideFlatCount: { fontSize: 14, lineHeight: 20, color: colors.inkSubtle },
  reportMealGuideFlatAdvice: { fontSize: 15, lineHeight: 23, color: colors.inkMuted, marginTop: spacing.sm },
  reportDetailBlock: { marginTop: spacing.md, gap: spacing.sm },
  reportPatternFlatRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportDetailTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportDetailTitle: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.ink },
  reportDetailBody: { fontSize: 15, lineHeight: 24, color: colors.inkMuted, marginTop: spacing.sm },
  reportFoodGroupFlatRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportFoodCoverageList: { marginTop: spacing.sm },
  reportFoodCoverageRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  reportFoodCoverageDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  reportFoodCoverageDotPositive: { backgroundColor: REPORT_SAGE },
  reportFoodCoverageCopy: { flex: 1, minWidth: 0 },
  reportFoodCoverageLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.ink },
  reportFoodCoverageFoods: { fontSize: 11, lineHeight: 16, color: colors.inkSubtle, marginTop: 1 },
  reportObservedFoodsFlat: { fontSize: 15, lineHeight: 23, fontWeight: '600', color: colors.ink, marginTop: spacing.sm },
  reportDetailLine: { fontSize: 15, lineHeight: 24, color: colors.inkMuted, marginTop: spacing.sm },
  reportDetailLineLabel: { fontWeight: '700', color: colors.ink },
  reportCardCategory: { fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.9, color: colors.inkSubtle, marginBottom: spacing.sm },
  reportContextCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  reportContextCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reportContextCardTitle: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.ink },
  reportMealBuilderFlat: { gap: spacing.sm },
  reportMealBuilderCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  reportMealBuilderFlatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reportMealBuilderIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: REPORT_SAGE_SURFACE },
  reportMealBuilderFlatLabel: {
    width: 52,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.inkSubtle,
    textTransform: 'capitalize',
  },
  reportMealBuilderFlatValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21, color: colors.ink },
  reportSwapFlatRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportSwapCarouselFrom: { fontSize: 14, lineHeight: 21, color: colors.inkMuted },
  reportSwapArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: REPORT_SAGE_SURFACE, marginVertical: spacing.sm },
  reportSwapFlatText: { fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  reportSwapFlatTo: { fontWeight: '700', color: colors.ink },
  reportSwapFlatWhy: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: 3 },
  reportScoreHistoryFlatRow: {
    minHeight: 132,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportScoreHistoryFlatValue: { fontSize: 19, lineHeight: 25, fontWeight: '700', color: colors.ink },
  reportComponentFlatRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportFactFlatRow: {
    minHeight: 232,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  reportSourceGraphic: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, marginHorizontal: -spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: colors.panelRaised },
  reportSourceGraphicBlue: { backgroundColor: REPORT_BLUE_SURFACE },
  reportSourceGraphicSage: { backgroundColor: REPORT_SAGE_SURFACE },
  reportSourceGraphicCircle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(168,191,178,0.28)', backgroundColor: colors.panel },
  reportSourceGraphicMeta: { alignItems: 'flex-end', gap: 2 },
  reportSourceCategory: { fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.9, color: colors.inkSubtle },
  reportSourceNumber: { fontSize: 12, lineHeight: 17, fontWeight: '800', letterSpacing: 1, color: colors.inkSubtle },
  reportPublisherRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.sm },
  reportPublisherDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: REPORT_SAGE },
  reportFactDomain: { fontSize: 13, lineHeight: 19, color: colors.inkSubtle },
  reportFactLink: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportFactSourceFlat: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: REPORT_SAGE,
  },
  reportFactUnavailable: { fontSize: 14, lineHeight: 21, color: colors.inkSubtle, marginTop: spacing.sm },
  reportLimitationText: { fontSize: 15, lineHeight: 24, color: colors.inkMuted, marginTop: spacing.sm },
  reportLimitationsCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.infoLight },
  reportCompactDetails: { marginTop: spacing.lg },
  reportDetailSections: { gap: spacing.md },
  reportDetailSection: {
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportDetailSectionHeader: { marginBottom: spacing.lg },
  reportDetailSectionTitle: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: colors.ink },
  reportDetailSectionMeta: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: 3 },
  reportDetailSectionContent: {},
  reportGenericCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  reportGenericParagraph: { fontSize: 15, lineHeight: 23, color: colors.inkMuted, marginTop: spacing.sm },
  reportIssueSection: {
    paddingTop: spacing.xl,
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  reportIssueCopy: { gap: 4 },
  reportIssueTitle: { fontSize: 18, lineHeight: 25, fontWeight: '700', color: colors.ink },
  reportIssueText: { fontSize: 15, lineHeight: 23, color: colors.inkMuted },
  reportIssueButton: {
    minHeight: 50,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  reportIssueButtonText: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.ink },

  // Weekly diet report — restrained black, white and solid-gold document
  paperDocument: {
    width: '100%',
    backgroundColor: REPORT_PAGE,
    marginBottom: spacing.xl,
  },
  paperHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  paperMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  paperEyebrow: {
    ...reportTypography.label,
    color: REPORT_ACCENT,
  },
  paperPeriod: {
    ...reportTypography.data,
    fontSize: 11,
    lineHeight: 16,
    color: REPORT_SUBTLE,
  },
  paperHeadline: {
    ...reportTypography.display,
    maxWidth: 560,
    color: REPORT_INK,
    marginTop: spacing.lg,
  },
  paperSummary: {
    ...reportTypography.body,
    maxWidth: 560,
    color: REPORT_MUTED,
    marginTop: spacing.sm,
  },
  paperEditorialArt: {
    width: '100%',
    height: 96,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: REPORT_BORDER,
    backgroundColor: REPORT_SURFACE,
  },
  reportNoDataHeader: {
    maxWidth: 560,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  reportNoDataIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: REPORT_ACCENT_SURFACE,
  },
  reportNoDataTitle: {
    ...reportTypography.display,
    maxWidth: 500,
    marginTop: spacing.md,
    color: REPORT_INK,
  },
  reportNoDataBody: {
    ...reportTypography.body,
    maxWidth: 500,
    marginTop: spacing.xs,
    color: REPORT_MUTED,
  },
  reportNoDataProgressHint: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: REPORT_MUTED,
  },
  reportNoDataDocument: {
    flexGrow: 1,
    marginBottom: 0,
  },
  reportNoDataHero: {
    flexGrow: 1,
    minHeight: 480,
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: REPORT_BORDER_STRONG,
    backgroundColor: REPORT_SURFACE,
  },
  reportNoDataArtwork: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  reportNoDataArtworkWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(5, 6, 9, 0.06)',
  },
  reportNoDataArtworkShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
  },
  reportNoDataHeroContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  reportNoDataHeroBottom: {
    width: '100%',
  },
  reportNoDataPeriodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5, 6, 9, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  reportNoDataPeriod: {
    ...reportTypography.data,
    fontSize: 10,
    lineHeight: 15,
    color: REPORT_MUTED,
  },
  reportNoDataHeroCopy: {
    maxWidth: '53%',
  },
  reportNoDataHeroCopyExpanded: {
    maxWidth: '100%',
  },
  reportNoDataStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reportNoDataStatusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: REPORT_ACCENT,
  },
  reportNoDataStatus: {
    ...reportTypography.label,
    color: REPORT_ACCENT,
  },
  reportNoDataHeroTitle: {
    ...reportTypography.display,
    maxWidth: 440,
    marginTop: spacing.md,
    color: REPORT_INK,
  },
  reportNoDataHeroBody: {
    ...reportTypography.body,
    maxWidth: 440,
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 20,
    color: REPORT_MUTED,
  },
  reportOverviewBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: REPORT_BORDER,
  },
  reportOverviewBandStack: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  reportOverviewScore: {
    minWidth: 130,
    justifyContent: 'center',
  },
  reportOverviewLabel: {
    ...reportTypography.label,
    color: REPORT_SUBTLE,
  },
  reportOverviewScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  reportOverviewScoreValue: {
    ...reportTypography.dataLarge,
    fontSize: 28,
    lineHeight: 34,
    color: REPORT_INK,
  },
  reportOverviewScoreMax: {
    marginLeft: 2,
    fontSize: 12,
    lineHeight: 18,
    color: REPORT_SUBTLE,
  },
  reportOverviewScoreMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reportOverviewScoreName: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: REPORT_INK,
  },
  reportOverviewTrend: {
    fontSize: 12,
    lineHeight: 18,
    color: REPORT_ACCENT,
  },
  reportOverviewUnavailable: {
    marginTop: spacing.xs,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: REPORT_INK,
  },
  reportOverviewUnavailableNote: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 18,
    color: REPORT_MUTED,
  },
  reportOverviewStats: {
    flex: 1,
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  reportOverviewStat: {
    flex: 1,
    minWidth: 68,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: REPORT_BORDER,
  },
  reportOverviewStatValue: {
    ...reportTypography.dataLarge,
    fontSize: 19,
    lineHeight: 25,
    color: REPORT_INK,
  },
  reportOverviewStatLabel: {
    ...reportTypography.label,
    marginTop: 1,
    color: REPORT_SUBTLE,
    textTransform: 'uppercase',
  },
  paperMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  paperScoreMetric: {
    minWidth: 186,
    flexBasis: 196,
    flexGrow: 2,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: REPORT_BORDER_STRONG,
    backgroundColor: REPORT_PAGE,
  },
  paperMetric: {
    minWidth: 102,
    flexBasis: 108,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: REPORT_SURFACE,
  },
  paperGridItemFull: {
    width: '100%',
    minWidth: '100%',
    flexBasis: '100%',
  },
  paperMetricEyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: REPORT_SUBTLE,
  },
  paperScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.xs,
  },
  paperScoreValue: {
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '800',
    letterSpacing: -1,
    color: REPORT_INK,
  },
  paperScoreMax: {
    fontSize: 14,
    lineHeight: 21,
    color: REPORT_SUBTLE,
    marginLeft: 3,
  },
  paperScoreMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: 2,
  },
  paperScoreLabel: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: REPORT_INK },
  paperScoreTrend: { fontSize: 12, lineHeight: 18, color: REPORT_MUTED },
  paperScoreUnavailable: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    color: REPORT_INK,
    marginTop: spacing.sm,
  },
  paperScoreUnavailableNote: { fontSize: 13, lineHeight: 19, color: REPORT_MUTED, marginTop: 2 },
  paperMetricValue: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    color: REPORT_INK,
    marginTop: spacing.sm,
  },
  paperMetricLabel: { fontSize: 12, lineHeight: 18, color: REPORT_MUTED, marginTop: 1 },
  paperConfidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  paperConfidenceLabel: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: REPORT_INFO_SURFACE,
  },
  paperConfidenceLabelText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: REPORT_INFO },
  paperConfidenceText: { flex: 1, minWidth: 190, fontSize: 13, lineHeight: 20, color: REPORT_MUTED },
  paperSchemaNotice: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: spacing.sm },
  paperSection: {
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: REPORT_BORDER,
  },
  paperSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  paperSectionIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperSectionHeading: { flex: 1, minWidth: 0 },
  paperSectionTitle: {
    ...reportTypography.heading,
    color: REPORT_INK,
  },
  paperSectionMeta: { ...reportTypography.body, fontSize: 12, lineHeight: 18, color: REPORT_MUTED, marginTop: 2 },
  paperSafetyList: { gap: spacing.sm, paddingBottom: spacing.md },
  paperSafetyNotice: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: REPORT_BORDER,
    borderLeftColor: REPORT_INFO,
    backgroundColor: REPORT_PAGE,
  },
  paperSafetyNoticeWarning: { borderLeftColor: REPORT_WARNING },
  paperSafetyNoticeUrgent: { borderLeftColor: REPORT_DANGER },
  paperSafetyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  paperSafetyTitle: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '700', color: REPORT_INK },
  paperSafetyBody: { fontSize: 15, lineHeight: 23, color: REPORT_MUTED, marginTop: spacing.xs },
  paperFocusPanel: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: REPORT_BORDER,
  },
  paperFocusHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  paperFocusMarker: {
    ...reportTypography.data,
    width: 24,
    paddingTop: 1,
    fontSize: 10,
    lineHeight: 15,
    color: REPORT_ACCENT,
  },
  paperFocusCopy: { flex: 1, minWidth: 0 },
  paperFocusLabel: { ...reportTypography.label, color: REPORT_ACCENT },
  paperFocusTitle: { ...reportTypography.heading, color: REPORT_INK, marginTop: 2 },
  paperFocusWhy: { ...reportTypography.body, color: REPORT_MUTED, marginTop: spacing.sm },
  paperActionList: { marginTop: spacing.md, marginLeft: 38, borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: REPORT_BORDER,
  },
  paperActionNumber: {
    ...reportTypography.data,
    width: 24,
    paddingTop: 1,
    fontSize: 10,
    lineHeight: 17,
    color: REPORT_SUBTLE,
  },
  paperActionText: { ...reportTypography.bodyStrong, flex: 1, fontSize: 14, lineHeight: 20, color: REPORT_INK },
  paperDefinitionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  paperDefinitionCell: {
    minWidth: 160,
    flexBasis: 210,
    flexGrow: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: REPORT_SURFACE,
  },
  paperDefinitionLabel: { fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.5, color: REPORT_SUBTLE, textTransform: 'uppercase' },
  paperDefinitionValue: { fontSize: 14, lineHeight: 21, color: REPORT_MUTED, marginTop: 2 },
  paperDefinitionValueStrong: { fontWeight: '700', color: REPORT_INK },
  paperTrackingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  paperTrackingText: { flex: 1, fontSize: 14, lineHeight: 21, color: REPORT_MUTED },
  paperTrackingLabel: { fontWeight: '700', color: REPORT_INK },
  paperSubsection: { marginTop: spacing.md },
  paperSubsectionTitle: { ...reportTypography.label, color: REPORT_SUBTLE, marginBottom: spacing.xs, textTransform: 'uppercase' },
  paperRows: { borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperWinRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperCheckIcon: { ...reportTypography.data, width: 24, paddingTop: 1, fontSize: 12, lineHeight: 18, color: REPORT_ACCENT },
  paperRowCopy: { flex: 1, minWidth: 0 },
  paperRowTitle: { ...reportTypography.bodyStrong, fontSize: 16, lineHeight: 22, color: REPORT_INK },
  paperRowBody: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: 3 },
  paperRowEvidence: { fontSize: 12, lineHeight: 18, color: REPORT_SUBTLE, marginTop: 4 },
  paperInsightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperInsightNumber: { ...reportTypography.data, width: 24, paddingTop: 1, fontSize: 10, lineHeight: 18, color: REPORT_ACCENT },
  paperWhyLine: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: spacing.xs },
  paperInlineLabel: { fontWeight: '700', color: REPORT_INK },
  paperEvidenceLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.xs },
  paperEvidenceText: { flex: 1, fontSize: 12, lineHeight: 18, color: REPORT_SUBTLE },
  paperInsightWhy: { ...reportTypography.body, fontSize: 13, lineHeight: 20, color: REPORT_INK, marginTop: spacing.xs },
  paperNextStep: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingTop: spacing.sm, marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: REPORT_BORDER },
  paperNextStepLabel: { ...reportTypography.label, fontSize: 8, lineHeight: 11, color: REPORT_ACCENT },
  paperNextStepText: { ...reportTypography.bodyStrong, flex: 1, fontSize: 13, lineHeight: 19, color: REPORT_INK },
  paperPatternRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperPatternTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  paperStatusRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  paperStatusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: REPORT_INFO },
  paperStatusDotPositive: { backgroundColor: REPORT_ACCENT },
  paperStatusDotAttention: { backgroundColor: REPORT_WARNING },
  paperStatusText: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', color: REPORT_MUTED },
  paperRhythmBlock: { padding: spacing.md, borderRadius: radius.md, backgroundColor: REPORT_SURFACE },
  paperRhythmTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: REPORT_INK },
  paperRhythmFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  paperRhythmFact: { flexGrow: 1, flexBasis: 210, fontSize: 13, lineHeight: 20, color: REPORT_MUTED },
  paperMealList: { borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperMealRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperMealIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: REPORT_ACCENT_SURFACE },
  paperMealTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  paperMealCount: { fontSize: 12, lineHeight: 18, color: REPORT_SUBTLE },
  paperMealAdvice: { fontSize: 14, lineHeight: 21, color: REPORT_MUTED, marginTop: spacing.xs },
  paperCoverageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  paperCoverageCell: { minWidth: 220, flexBasis: 240, flexGrow: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: REPORT_BORDER },
  paperCoverageTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.xs },
  paperCoverageLabel: { flex: 1, minWidth: 100, fontSize: 14, lineHeight: 20, fontWeight: '700', color: REPORT_INK },
  paperCoverageStatus: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: REPORT_SUBTLE },
  paperCoverageStatusPositive: { color: REPORT_ACCENT },
  paperCoverageFoods: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: REPORT_INK, marginTop: spacing.xs },
  paperCoverageInsight: { fontSize: 12, lineHeight: 18, color: REPORT_MUTED, marginTop: 3 },
  paperBuilderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  paperBuilderCell: { minWidth: 190, flexBasis: 220, flexGrow: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: REPORT_SURFACE },
  paperBuilderIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: REPORT_ACCENT_SURFACE },
  paperBuilderValue: { fontSize: 14, lineHeight: 21, color: REPORT_INK, marginTop: 2 },
  paperSwapRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperSwapMain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  paperSwapFrom: { fontSize: 14, lineHeight: 21, color: REPORT_MUTED },
  paperSwapTo: { flexShrink: 1, fontSize: 14, lineHeight: 21, fontWeight: '700', color: REPORT_INK },
  paperContextBlock: { paddingTop: spacing.md, marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperContextTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  paperContextTitle: { flex: 1, minWidth: 120, fontSize: 15, lineHeight: 22, fontWeight: '700', color: REPORT_INK },
  paperContextBadge: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: REPORT_INFO, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: REPORT_INFO_SURFACE },
  paperContextLine: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: spacing.xs },
  paperComponentList: { gap: spacing.md },
  paperComponentRow: { paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperComponentTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  paperComponentLabel: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '700', color: REPORT_INK },
  paperComponentValue: { fontSize: 14, lineHeight: 21, fontWeight: '800', color: REPORT_INK },
  paperComponentMax: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: REPORT_SUBTLE },
  paperComponentTrack: { height: 6, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: REPORT_BORDER, marginTop: spacing.xs },
  paperComponentFill: { height: '100%', borderRadius: radius.pill, backgroundColor: REPORT_ACCENT },
  paperComponentInsight: { fontSize: 12, lineHeight: 18, color: REPORT_MUTED, marginTop: spacing.xs },
  paperCoachNote: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  paperCoachRule: { width: 3, borderRadius: radius.pill, backgroundColor: REPORT_ACCENT },
  paperCoachText: { flex: 1, fontSize: 16, lineHeight: 25, fontStyle: 'italic', color: REPORT_INK },
  paperGenericSection: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperGenericParagraph: { fontSize: 14, lineHeight: 22, color: REPORT_MUTED, marginTop: spacing.xs },
  paperGenericItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  paperGenericDot: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: REPORT_SUBTLE, marginTop: 7 },
  paperGenericItemText: { flex: 1, fontSize: 13, lineHeight: 20, color: REPORT_MUTED },
  paperSourceList: { borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperSourceRow: { minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: REPORT_BORDER },
  paperSourceNumber: { ...reportTypography.data, width: 24, paddingTop: 2, fontSize: 10, lineHeight: 16, color: REPORT_INFO },
  paperSourceIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: REPORT_INFO_SURFACE },
  paperSourceCopy: { flex: 1, minWidth: 0 },
  paperSourceTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: REPORT_INK },
  paperSourceBody: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: 2 },
  paperSourceMeta: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: REPORT_INFO, marginTop: spacing.xs },
  paperAboutBox: { paddingVertical: spacing.xs },
  paperAboutText: { ...reportTypography.body, fontSize: 12, lineHeight: 18, color: REPORT_MUTED },
  paperLimitationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  paperLimitationText: { ...reportTypography.body, flex: 1, fontSize: 11, lineHeight: 17, color: REPORT_MUTED },
  paperQuestionPanel: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: REPORT_BORDER_STRONG, backgroundColor: REPORT_PAGE },
  paperQuestionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  paperQuestionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: REPORT_INFO_SURFACE },
  paperQuestionHeading: { flex: 1, minWidth: 0 },
  paperQuestionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: REPORT_INK },
  paperQuestionIntro: { fontSize: 13, lineHeight: 20, color: REPORT_MUTED, marginTop: 2 },
  paperQuestionList: { marginTop: spacing.md, gap: spacing.md },
  paperQuestionItem: { gap: spacing.xs },
  paperQuestionLabel: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: REPORT_INK },
  paperQuestionNumber: { color: REPORT_INFO },
  paperQuestionInput: { minHeight: 68, paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: REPORT_BORDER_STRONG, backgroundColor: REPORT_SURFACE, fontSize: 15, lineHeight: 22, color: REPORT_INK },
  paperQuestionFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  paperQuestionStatus: { flex: 1, minWidth: 180, fontSize: 12, lineHeight: 18, color: REPORT_MUTED },
  paperQuestionSaveButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: REPORT_ACCENT },
  paperQuestionSaveButtonDisabled: { opacity: 0.42 },
  paperQuestionSaveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: REPORT_PAGE },
  paperFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xl, borderTopWidth: 1, borderTopColor: REPORT_BORDER },
  paperFooterCopy: { flex: 1, minWidth: 210 },
  paperGenerated: { ...reportTypography.data, fontSize: 10, lineHeight: 16, color: REPORT_SUBTLE },
  paperFooterNote: { ...reportTypography.body, fontSize: 12, lineHeight: 18, color: REPORT_MUTED, marginTop: 2 },
  paperIssueButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: REPORT_BORDER_STRONG, backgroundColor: REPORT_PAGE },
  paperIssueButtonText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: REPORT_MUTED },

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
  editDeleteButton: {
    minHeight: 50,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.errorLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  editDeleteButtonText: { ...typography.bodyBold, color: colors.error },
  deleteConfirmIcon: {
    width: 42,
    height: 42,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmText: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  editDeleteConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDeleteConfirmText: { ...typography.bodyBold, color: colors.white },

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
  editorTitle: { ...typography.title, color: colors.ink },
  editorScore: {
    minWidth: 54,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
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
  slotTimeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 24 },
  inlineTimeEditor: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  inlineTimeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  inlineTimeLabel: { ...typography.overline, color: colors.gold, letterSpacing: 1.1 },
  inlineTimeHint: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
  inlineTimeClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  inlineTimeControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: spacing.md },
  inlineTimeStep: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  inlineTimeValue: { minWidth: 24, fontSize: 18, lineHeight: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  inlineTimeColon: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: colors.inkMuted },
  inlineTimePeriod: { flexDirection: 'row', padding: 2, borderRadius: radius.sm, backgroundColor: colors.bg },
  inlineTimePeriodButton: { minWidth: 34, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  inlineTimePeriodButtonSelected: { backgroundColor: colors.primaryAction },
  inlineTimePeriodText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  inlineTimePeriodTextSelected: { color: colors.onPrimary },
  memoryAnswerStage: { minHeight: 164, gap: spacing.sm },
  memoryAnswerStageCompleted: { justifyContent: 'center' },
  textInput: {
    height: 104,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  textModalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalActionButton: { flex: 1 },
  skipMealAction: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
  },
  skipMealActionDisabled: { opacity: 0.45 },
  skipMealTitle: { ...typography.bodyBold, color: colors.inkMuted, flex: 1 },
  timeModalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 100,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.overlay,
  },
  timeModalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  timeModalTitle: { ...typography.title, color: colors.ink },
  timeModalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  timeCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCancelText: { ...typography.bodyBold, color: colors.inkMuted },
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
