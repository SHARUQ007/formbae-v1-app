import { StableImage, StableImageBackground } from '../../components/StableImage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, PixelRatio, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { observeAppEvent } from '../../services/monitoringService';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PartnerMatchWaitingCard } from '../../components/PartnerMatchWaitingCard';
import { ConnectionDetailsSheet } from '../../components/ConnectionDetailsSheet';
import { ScreenContainer } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import { TrophyIllustration } from '../../components/TrophyIllustration';
import { AccountabilityViewArt } from '../../components/AccountabilityViewArt';
import { DailyReadingRoom } from '../../components/DailyReadingRoom';
import {
  accountabilityBaeProofSource,
  fetchAccountability,
  fetchAccountabilityBae,
  joinAccountabilityBaeFriend,
  leaveAccountabilityBae,
  normalizeAccountabilityBaeSummary,
  startAccountabilityBaeMatch,
  updateAccountability,
  uploadAccountabilityBaeProof,
  peekAccountability,
  peekAccountabilityBae,
} from '../../services/accountabilityService';
import { cancelAccountabilityReminder, scheduleAccountabilityReminder } from '../../services/notificationService';
import { loadProgressBundleCached, peekProgressBundleCached } from '../../services/preloadService';
import { subscribeToTrophySummary } from '../../services/trophyRealtime';
import type { AccountabilityBaeSummary, AccountabilitySummary, TrophySummary } from '../../types/api';
import {
  currentMealType,
  isToday,
  nextPlanDay,
  peekContextualSnapshot,
  resolveContextualSnapshot,
  resolveTargetFromSnapshot,
  suggestedMealToLog,
  shouldOfferAccountabilityFoodShortcut,
  workoutTitle,
  type ContextualSnapshot,
} from '../../utils/contextualAction';
import {
  canCreateAccountabilityCommitment,
  getAccountabilityTaskArtwork,
  getAccountabilityTaskLabel,
  accountabilityArtworkFrame,
} from '../../utils/accountabilityArtwork';
import { getAccountabilityBaeArtwork, getAccountabilityBaeModeCaption, getPartnerState } from '../../utils/accountabilityBaeArtwork';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = BottomTabScreenProps<MainTabParamList, 'Action'>;

type TodayTask = {
  key: string;
  kind: string;
  targetId: string;
  title: string;
  detail: string;
  action: string;
  onOpen: () => void;
  active?: boolean;
  committable?: boolean;
};

export function ActionHubScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { width, fontScale } = useWindowDimensions();
  const compactLayout = width < 360 || fontScale > 1.15;
  const [warmSnapshot] = useState(() => peekContextualSnapshot());
  const [snapshot, setSnapshot] = useState<ContextualSnapshot | null>(warmSnapshot);
  const [accountability, setAccountability] = useState<AccountabilitySummary | null>(() => peekAccountability());
  const [trophies, setTrophies] = useState<TrophySummary | null>(
    () => peekProgressBundleCached()?.progress.trophies ?? null,
  );
  const [warmBae] = useState<AccountabilityBaeSummary | null>(() => peekAccountabilityBae());
  const [accountabilityBae, setAccountabilityBae] = useState<AccountabilityBaeSummary | null>(warmBae);
  const [baeLoading, setBaeLoading] = useState(!warmBae);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [baeBusy, setBaeBusy] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [initialLoading, setInitialLoading] = useState(!warmSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCommitment, setSavingCommitment] = useState(false);
  const [startingTaskKey, setStartingTaskKey] = useState('');
  const [activeView, setActiveView] = useState<'today' | 'bae'>('today');
  const [contextNow, setContextNow] = useState(() => new Date());
  const [accountabilityUnavailable, setAccountabilityUnavailable] = useState(false);
  const [baeUnavailable, setBaeUnavailable] = useState(false);
  const autoCompletedDate = useRef('');
  const loadGeneration = useRef(0);

  useEffect(() => subscribeToTrophySummary(setTrophies), []);

  const applyBaeSummary = useCallback((next: AccountabilityBaeSummary) => {
    loadGeneration.current += 1;
    setAccountabilityBae(next);
    setBaeLoading(false);
    setBaeUnavailable(false);
  }, []);
  const partnerStatus = accountabilityBae?.status;
  useFocusEffect(useCallback(() => {
    if (activeView === 'today') observeAppEvent('feature_view', 'my_day');
    else if (!baeLoading && !baeUnavailable) {
      const state = getPartnerState(accountabilityBae?.status, accountabilityBae?.preference);
      observeAppEvent('feature_view', state === 'matching' ? 'partner_search' : state === 'invite' ? 'partner_invite' : state === 'matched' ? 'partner_matched' : 'partner_home');
    }
  }, [activeView, accountabilityBae?.status, accountabilityBae?.preference, baeLoading, baeUnavailable]));


  const load = useCallback(async (force = false) => {
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    const isCurrent = () => loadGeneration.current === generation;
    if (force) autoCompletedDate.current = '';
    setBaeLoading(true);
    // Apply each resource as soon as it arrives. The previous all-at-once
    // update kept the entire tab behind whichever optional service was slowest.
    const [, nextAccountability] = await Promise.allSettled([
      resolveContextualSnapshot().then((value) => {
        if (isCurrent()) {
          setSnapshot(value);
          setInitialLoading(false);
        }
        return value;
      }),
      fetchAccountability({ force }).then((value) => {
        if (isCurrent()) setAccountability(value);
        return value;
      }),
      fetchAccountabilityBae({ force: true })
        .then((value) => {
          if (isCurrent()) {
            setAccountabilityBae(value);
            setBaeUnavailable(false);
          }
          return value;
        })
        .catch((error) => {
          if (isCurrent()) setBaeUnavailable(true);
          throw error;
        })
        .finally(() => {
          if (isCurrent()) setBaeLoading(false);
        }),
      loadProgressBundleCached({ force }).then((value) => {
        if (isCurrent()) setTrophies(value.progress.trophies ?? null);
        return value;
      }),
    ]);
    if (!isCurrent()) return;
    setAccountabilityUnavailable(nextAccountability.status === 'rejected');
    setInitialLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setContextNow(new Date());
    load().catch(() => undefined);
    const contextTimer = setInterval(() => setContextNow(new Date()), 60_000);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setContextNow(new Date());
        load().catch(() => undefined);
      }
    });
    let partnerPollActive = true;
    let partnerPollBusy = false;
    const partnerRefresh = !selectedPartner && activeView === 'bae' && partnerStatus && partnerStatus !== 'locked' && partnerStatus !== 'inactive' ? setInterval(() => {
      if (!partnerPollActive || partnerPollBusy || AppState.currentState !== 'active') return;
      partnerPollBusy = true;
      fetchAccountabilityBae({ force: true }).then(value => { if (partnerPollActive) applyBaeSummary(value); }).catch(() => { if (partnerPollActive) setBaeUnavailable(true); }).finally(() => { partnerPollBusy = false; });
    }, 30_000) : null;
    return () => { partnerPollActive = false; clearInterval(contextTimer); if (partnerRefresh) clearInterval(partnerRefresh); foreground.remove(); };
  }, [applyBaeSummary, load, partnerStatus, activeView, selectedPartner]));

  useEffect(() => {
    const commitment = accountability?.today;
    if (!snapshot || !commitment || commitment.status !== 'active' || savingCommitment || autoCompletedDate.current === commitment.date || !commitmentMet(commitment.targetKind, commitment.targetId, snapshot)) return;
    autoCompletedDate.current = commitment.date;
    setSavingCommitment(true);
    updateAccountability({ action: 'complete' })
      .then((next) => {
        setAccountability(next);
        setAccountabilityUnavailable(false);
        cancelAccountabilityReminder().catch(() => undefined);
      })
      .catch(() => setAccountabilityUnavailable(true))
      .finally(() => setSavingCommitment(false));
  }, [accountability?.today, savingCommitment, snapshot]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  };

  const openTarget = () => {
    if (!snapshot) return;
    const target = resolveTargetFromSnapshot(snapshot);
    if (target.kind === 'diet') {
      navigation.navigate('Diet', { action: 'log', requestId: Date.now(), mealType: target.mealType });
      return;
    }
    if (target.kind === 'workout') {
      navigation.navigate('Workouts', { screen: 'WorkoutList' });
      return;
    }
    if (target.kind === 'refresh') {
      navigation.navigate('Workouts', { screen: 'PlanRefresh' });
      return;
    }
    navigation.navigate('Progress');
  };

  const openWorkout = () => {
    navigation.navigate('Workouts', { screen: 'WorkoutList' });
  };

  const openFoodMemory = (mealType: ReturnType<typeof currentMealType>) => {
    navigation.navigate('Diet', { action: 'log', requestId: Date.now(), mealType });
  };

  const openCommitment = () => {
    const commitment = accountability?.today;
    if (!commitment || !snapshot) return openTarget();
    if (commitment.targetKind === 'diet') {
      navigation.navigate('Diet', { action: 'log', requestId: Date.now(), mealType: commitment.targetId as ReturnType<typeof currentMealType> });
      return;
    }
    if (commitment.targetKind === 'workout') {
      openWorkout();
      return;
    }
    if (commitment.targetKind === 'refresh') {
      navigation.navigate('Workouts', { screen: 'PlanRefresh' });
      return;
    }
    if (commitment.targetKind === 'progress') {
      navigation.navigate('Progress');
      return;
    }
    openTarget();
  };

  const startTodayTask = async (task: TodayTask) => {
    if (startingTaskKey) return;
    if (task.committable === false || accountability?.today || !canCreateAccountabilityCommitment(task.kind)) {
      task.onOpen();
      return;
    }

    setStartingTaskKey(task.key);
    try {
      const next = await updateAccountability({ action: 'commit', targetKind: task.kind, targetId: task.targetId, title: task.title });
      setAccountability(next);
      setAccountabilityUnavailable(false);
      scheduleAccountabilityReminder(task.title).catch(() => undefined);
    } catch {
      setAccountabilityUnavailable(true);
    } finally {
      setStartingTaskKey('');
      // The task itself is always available, even if the optional
      // accountability commitment could not be saved while offline.
      task.onOpen();
    }
  };

  const runBaeMatch = async (preference: 'male' | 'female' | 'friend') => {
    if (baeBusy) return;
    setBaeBusy(true);
    try {
      if (accountabilityBae?.status === 'matched' || (getPartnerState(accountabilityBae?.status, accountabilityBae?.preference) === 'matching' && preference === 'friend')) {
        applyBaeSummary(await leaveAccountabilityBae());
      }
      applyBaeSummary(await startAccountabilityBaeMatch(preference));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (message.includes('gender in Profile')) {
        Alert.alert('Complete your profile', 'Add your gender in Profile to use automatic matching.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open profile', onPress: () => navigation.navigate('Profile') },
        ]);
      } else {
        Alert.alert('Could not start matching', message);
      }
    } finally {
      setBaeBusy(false);
    }
  };

  const startBaeMatch = (preference: 'male' | 'female' | 'friend') => {
    if (baeBusy) return;
    if (getPartnerState(accountabilityBae?.status, accountabilityBae?.preference) === 'matching' && preference === 'friend') {
      Alert.alert('Invite a friend instead?', 'This cancels your current matching and creates a friend invite.', [
        { text: 'Keep matching', style: 'cancel' },
        { text: 'Invite a friend', onPress: () => { runBaeMatch('friend').catch(() => undefined); } },
      ]);
      return;
    }
    if (accountabilityBae?.status !== 'matched') { runBaeMatch(preference).catch(() => undefined); return; }
    Alert.alert('Invite a friend instead?', 'This ends your current match and deletes its shared photos. Any leaderboard connection stays. You can then share a partner code with your friend.', [
      { text: 'Keep my partner', style: 'cancel' },
      { text: 'Switch to a friend', onPress: () => { runBaeMatch(preference).catch(() => undefined); } },
    ]);
  };

  const cancelBaeMatch = async () => {
    if (baeBusy) return;
    setBaeBusy(true);
    try {
      applyBaeSummary(await leaveAccountabilityBae());
      setFriendCode('');
    } catch (error) {
      Alert.alert('Could not cancel matching', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBaeBusy(false);
    }
  };

  const joinFriend = async () => {
    const code = friendCode.trim();
    if (!code || baeBusy) return;
    setBaeBusy(true);
    try {
      applyBaeSummary(await joinAccountabilityBaeFriend(code));
      setFriendCode('');
    } catch (error) {
      Alert.alert('Could not join your friend', error instanceof Error ? error.message : 'Check the code and try again.');
    } finally {
      setBaeBusy(false);
    }
  };

  const shareFriendCode = async () => {
    const code = accountabilityBae?.inviteCode;
    if (!code || baeBusy) return;
    setBaeBusy(true);
    try {
      await Share.share({
        title: 'Be my FormBae accountability partner',
        message: `Join me on FormBae for shared daily challenges and a place on each other’s leaderboard. Complete the task, add a photo, and unlock both photos after midnight when we both check in.\n\nUse my partner code: ${code}`,
      });
    } catch {
      Alert.alert('Could not open your invite', 'Your code is still ready. Please try sharing again.');
    } finally { setBaeBusy(false); }
  };

  const uploadProof = async (asset?: Asset) => {
    if (baeBusy) return;
    if (!asset?.base64) {
      Alert.alert('Photo could not be read', 'Choose another photo and try again.');
      return;
    }
    setBaeBusy(true);
    try {
      const challenge = accountabilityBae?.challenge;
      if (!challenge?.assignmentId) throw new Error('Refresh Partner mode to load today’s task.');
      applyBaeSummary(await uploadAccountabilityBaeProof(asset, { assignmentId: challenge.assignmentId, date: challenge.date }));
    } catch (error) {
      Alert.alert('Could not submit proof', error instanceof Error ? error.message : 'Please try another photo.');
    } finally {
      setBaeBusy(false);
    }
  };

  const takeProofPhoto = async () => {
    const result = await launchCamera({ mediaType: 'photo', cameraType: 'back', quality: 0.7, maxWidth: 1280, maxHeight: 1280, includeBase64: true, saveToPhotos: false });
    if (result.didCancel) return;
    if (result.errorMessage) return Alert.alert('Camera unavailable', result.errorMessage);
    await uploadProof(result.assets?.[0]);
  };

  const chooseProofPhoto = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.7, maxWidth: 1280, maxHeight: 1280, includeBase64: true });
    if (result.didCancel) return;
    if (result.errorMessage) return Alert.alert('Photo library unavailable', result.errorMessage);
    await uploadProof(result.assets?.[0]);
  };

  const openProofPicker = () => {
    Alert.alert('Complete with a photo', 'Photos unlock after midnight only when you both submit before the deadline. Faces are optional.', [
      { text: 'Take photo', onPress: () => { takeProofPhoto().catch(() => undefined); } },
      { text: 'Choose from library', onPress: () => { chooseProofPhoto().catch(() => undefined); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!snapshot && initialLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading accountability..." />
      </ScreenContainer>
    );
  }

  if (!snapshot) {
    return (
      <ScreenContainer>
        <InlineNotice
          icon="wifi-off"
          title="Accountability is unavailable"
          body="Check your connection and try again."
          action="Try again"
          onPress={() => load(true)}
          standalone
        />
      </ScreenContainer>
    );
  }

  const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
  const dateLabel = contextNow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const commitment = accountability?.today;
  const commitmentActive = commitment?.status === 'active' && !commitmentMet(commitment.targetKind, commitment.targetId, snapshot);
  const nextWorkout = nextPlanDay(plan);
  const mealType = suggestedMealToLog(snapshot.dietEntries, contextNow) || currentMealType(contextNow);
  const todayTasks: TodayTask[] = [];
  if (commitmentActive) {
    const isDietCommitment = commitment.targetKind === 'diet';
    todayTasks.push({
      key: `active:${commitment.targetKind}:${commitment.targetId}`,
      kind: commitment.targetKind,
      targetId: commitment.targetId,
      title: isDietCommitment ? 'Log food' : commitment.title,
      detail: isDietCommitment ? 'Add what you ate while it is fresh' : 'Ready to continue',
      action: isDietCommitment ? 'Add a meal' : 'Continue',
      onOpen: openCommitment,
      active: true,
    });
  }
  if (shouldOfferAccountabilityFoodShortcut(
    snapshot.dietEntries,
    commitmentActive ? commitment.targetKind : undefined,
    contextNow,
  )) {
    todayTasks.push({
      key: `diet:${mealType}`,
      kind: 'diet',
      targetId: mealType,
      title: 'Log food',
      detail: `Remember your ${mealType === 'Evening' ? 'evening snack' : mealType.toLowerCase()}`,
      action: 'Add a meal',
      onOpen: () => openFoodMemory(mealType),
      committable: false,
    });
  }
  if (nextWorkout?.planDayId && !nextWorkout.completed) {
    todayTasks.push({
      key: `workout:${nextWorkout.planDayId}`,
      kind: 'workout',
      targetId: nextWorkout.planDayId,
      title: workoutTitle(nextWorkout),
      detail: `Day ${nextWorkout.dayNumber || '-'} · ${nextWorkout.exercises?.length || 0} exercises`,
      action: 'Start',
      onOpen: openWorkout,
    });
  }
  if (snapshot.workoutData?.aiPlanRefresh?.due) {
    todayTasks.push({
      key: 'refresh:plan',
      kind: 'refresh',
      targetId: 'refresh',
      title: 'Build your next plan',
      detail: 'Plan check-in is ready',
      action: 'Check in',
      onOpen: () => navigation.navigate('Workouts', { screen: 'PlanRefresh' }),
    });
  }
  if (!plan?.days?.length && !snapshot.workoutData?.aiPlanRefresh?.due) {
    todayTasks.push({
      key: 'workout:first',
      kind: 'workout',
      targetId: 'browse',
      title: 'Choose your first workout',
      detail: 'Your training starts here',
      action: 'Explore',
      onOpen: openWorkout,
      committable: false,
    });
  }
  const uniqueTodayTasks = todayTasks.filter((task, index, tasks) => tasks.findIndex((candidate) => candidate.kind === task.kind && candidate.targetId === task.targetId) === index);
  if (!uniqueTodayTasks.length) {
    uniqueTodayTasks.push({
      key: 'progress:review',
      kind: 'progress',
      targetId: 'progress',
      title: 'Review your progress',
      detail: 'Weekly report and body trends',
      action: 'Open',
      onOpen: () => navigation.navigate('Progress'),
    });
  }

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + (activeView === 'bae' ? spacing.sm : spacing.xl) }]}
      >
        <View style={[styles.pageHeader, compactLayout && styles.pageHeaderCompact]}>
          <View style={styles.pageHeaderCopy}>
            <Text style={styles.kicker}>{dateLabel}</Text>
            <Text style={styles.pageTitle}>Accountability</Text>
          </View>
          <TouchableOpacity style={styles.trophyButton} onPress={() => navigation.navigate('Progress')} activeOpacity={0.76} accessibilityRole="button" accessibilityLabel={trophies ? `${trophies.score} trophies. View trophy progress` : 'Trophy score unavailable. View trophy progress'}>
            <TrophyIllustration size={28} />
            <View style={styles.trophyButtonCopy}>
              <Text style={styles.trophyButtonValue}>{trophies?.score ?? '—'}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.inkMuted} />
          </TouchableOpacity>
        </View>

        {accountabilityUnavailable ? (
          <InlineNotice
            icon="wifi-off"
            title={accountability ? 'Showing saved accountability' : 'Accountability is offline'}
            body={accountability ? 'Your latest saved status is visible. Refresh when your connection returns.' : 'Reconnect before starting or completing today’s task.'}
            action="Retry"
            onPress={() => load(true)}
          />
        ) : null}

        <AccountabilityModeSwitch
          activeView={activeView}
          partnerStatus={accountabilityBae?.status}
          partnerPreference={accountabilityBae?.preference}
          partnerBusy={baeBusy}
          partnerLoading={baeLoading && !accountabilityBae}
          partnerUnavailable={baeUnavailable && !accountabilityBae}
          compact={compactLayout}
          onChange={setActiveView}
        />
        {activeView === 'today' ? (
          <View style={styles.todayDashboard}>
            <View style={styles.todayQueueHeader}>
              <Text style={styles.todayQueueTitle}>Today’s focus</Text>
              <Text style={styles.todayQueueCount}>{uniqueTodayTasks.length} move{uniqueTodayTasks.length === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.todayTaskList}>
              {uniqueTodayTasks.map((task) => (
                <TodayTaskCard
                  key={task.key}
                  task={task}
                  loading={startingTaskKey === task.key}
                  onPress={() => startTodayTask(task)}
                />
              ))}
            </View>
          </View>
        ) : (
          <>
            {baeUnavailable && accountabilityBae ? (
              <InlineNotice icon="refresh-cw" title="Partner status may be out of date" body="Your saved partner space is still available." action="Refresh" onPress={() => load(true)} />
            ) : null}

            <AccountabilityBaeCard
              data={accountabilityBae}
              loading={baeLoading}
              compact={compactLayout}
              busy={baeBusy}
              friendCode={friendCode}
              onFriendCodeChange={setFriendCode}
              onStart={startBaeMatch}
              onCancelMatch={cancelBaeMatch}
              onJoinFriend={joinFriend}
              onShareFriendCode={shareFriendCode}
              onSubmitProof={openProofPicker}
              onViewPartner={() => setSelectedPartner(accountabilityBae?.partner?.userId || null)}
              onRetry={() => load(true)}
              onViewTrophies={() => navigation.navigate('Progress', { screen: 'TrophyDetails' })}
            />
          </>
        )}
        {activeView === 'today' ? <DailyReadingRoom /> : null}
      </ScrollView>
      <ConnectionDetailsSheet userId={selectedPartner} onClose={() => setSelectedPartner(null)} onChanged={() => { load(true).catch(() => undefined); }}/>
    </ScreenContainer>
  );
}

type AccountabilityView = 'today' | 'bae';

export function AccountabilityModeSwitch({ activeView, partnerStatus, partnerPreference, partnerBusy = false, partnerLoading, partnerUnavailable, compact, onChange }: {
  activeView: AccountabilityView;
  partnerStatus?: AccountabilityBaeSummary['status'];
  partnerPreference?: AccountabilityBaeSummary['preference'];
  partnerBusy?: boolean;
  partnerLoading: boolean;
  partnerUnavailable: boolean;
  compact: boolean;
  onChange: (view: AccountabilityView) => void;
}) {
  const partnerCaption = partnerUnavailable ? 'Unavailable' : partnerBusy ? 'Updating' : partnerLoading ? 'Loading' : getAccountabilityBaeModeCaption(partnerStatus, partnerPreference);
  return (
    <View style={styles.accountabilityTabs} accessibilityRole="tablist" accessibilityLabel="Accountability views">
      <AccountabilityModeOption
        active={activeView === 'today'}
        art="day"
        label="My day"
        caption="Your focus"
        compact={compact}
        onPress={() => onChange('today')}
      />
      <AccountabilityModeOption
        active={activeView === 'bae'}
        art="partner"
        label="Partner"
        caption={partnerCaption}
        compact={compact}
        onPress={() => onChange('bae')}
      />
    </View>
  );
}

function AccountabilityModeOption({ active, art, label, caption, compact, onPress }: {
  active: boolean;
  art: 'day' | 'partner';
  label: string;
  caption: string;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      style={[styles.accountabilityTab, active && styles.accountabilityTabActive]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${label}. ${caption}`}
      accessibilityState={{ selected: active }}
    >
      <View
        style={[
          styles.accountabilityTabIcon,
          compact && styles.accountabilityTabIconCompact,
        ]}
        accessible={false}
      >
        <AccountabilityViewArt kind={art} size={compact ? 26 : 30} />
      </View>
      <View style={styles.accountabilityTabCopy}>
        <Text style={[styles.accountabilityTabText, active && styles.accountabilityTabTextActive]} numberOfLines={1}>{label}</Text>
        {!compact ? <Text style={[styles.accountabilityTabCaption, active && styles.accountabilityTabCaptionActive]} numberOfLines={2}>{caption}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function BaeLoadingState() {
  return (
    <View style={styles.partnerSection} accessibilityLiveRegion="polite">
      <View style={styles.baeHeader}>
        <View style={styles.baeHeaderCopy}>
          <Text style={styles.baeTitle}>Partner check-in</Text>
          <Text style={styles.baeHeaderCaption}>Getting your shared space ready</Text>
        </View>
      </View>
      <BaeArtworkHero eyebrow="OPENING PARTNER MODE" title="Getting things ready" body="One moment." loading />
    </View>
  );
}

function BaeArtworkHero({ eyebrow, title, body, loading = false, compact = false, expanded = false }: {
  eyebrow: string;
  title: string;
  body: string;
  loading?: boolean;
  compact?: boolean;
  expanded?: boolean;
}) {
  return (
    <StableImageBackground source={getAccountabilityBaeArtwork('inactive')} defaultSource={getAccountabilityBaeArtwork('inactive')} fadeDuration={0} style={[styles.baeArtworkHero, compact && styles.baeArtworkCompact, expanded && styles.baeArtworkExpanded]} imageStyle={styles.baeArtworkImage} resizeMode={expanded ? "cover" : "contain"}>
      <LinearGradient colors={['rgba(4,5,8,0.98)', 'rgba(4,5,8,0.82)', 'rgba(4,5,8,0.08)']} locations={[0, 0.58, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.baeArtworkContent, compact && styles.baeArtworkContentCompact, expanded && styles.baeArtworkContentExpanded]}>
        <View style={styles.baeArtworkEyebrowRow}>
          {loading ? <ActivityIndicator size="small" color={colors.gold} /> : <View style={styles.baeArtworkDot} />}
          <Text style={styles.baeArtworkEyebrow}>{eyebrow}</Text>
        </View>
        <View>
          <Text style={styles.baeArtworkTitle}>{title}</Text>
          <Text style={styles.baeArtworkBody}>{body}</Text>
        </View>
      </View>
    </StableImageBackground>
  );
}

type AccountabilityBaeCardProps = {
  data: AccountabilityBaeSummary | null;
  loading: boolean;
  compact: boolean;
  busy: boolean;
  friendCode: string;
  onFriendCodeChange: (value: string) => void;
  onStart: (preference: 'male' | 'female' | 'friend') => void;
  onCancelMatch: () => void;
  onJoinFriend: () => void;
  onShareFriendCode: () => void;
  onSubmitProof: () => void;
  onViewPartner?: () => void;
  onRetry: () => void;
  onViewTrophies: () => void;
};

export function AccountabilityBaeCard({ data: rawData, loading, compact, busy, friendCode, onFriendCodeChange, onStart, onCancelMatch, onJoinFriend, onShareFriendCode, onSubmitProof, onRetry, onViewTrophies, onViewPartner }: AccountabilityBaeCardProps) {
  const data = normalizeAccountabilityBaeSummary(rawData);
  const partnerState = getPartnerState(data?.status, data?.preference);
  const [editingPreferences, setEditingPreferences] = useState(false);
  useEffect(() => { setEditingPreferences(false); }, [data?.status]);
  const confirmCancelMatch = () => {
    if (busy) return;
    const isInvite = data?.preference === 'friend';
    Alert.alert(isInvite ? 'Cancel your invite?' : 'Stop matching?', isInvite
      ? 'This ends your current friend invite. You can create a new one anytime.'
      : 'We’ll stop searching for a training partner. You can start again anytime.', [
      { text: isInvite ? 'Keep invite' : 'Keep searching', style: 'cancel' },
      { text: isInvite ? 'Cancel invite' : 'Stop matching', style: 'destructive', onPress: onCancelMatch },
    ]);
  };
  const cancelMatchButton = <PrimaryButton title="Cancel matching" icon="x-circle" variant="secondary" onPress={confirmCancelMatch} disabled={busy} style={styles.baeCancelButton} />;
  const showingPreferences = (partnerState === 'invite' || partnerState === 'matching') && editingPreferences;
  const selectPreference = (preference: 'male' | 'female' | 'friend') => {
    if (busy) return;
    setEditingPreferences(false);
    onStart(preference);
  };
  if (loading && !data) {
    return <BaeLoadingState />;
  }
  if (!data) {
    return <InlineNotice icon="wifi-off" title="Partner accountability is unavailable" body="Your match has not been changed. Check your connection and try again." action="Try again" onPress={onRetry} />;
  }

  const headerCaption = data.status === 'matched'
    ? 'One shared challenge each day'
    : data.status === 'waiting'
      ? data.preference === 'friend' ? 'Your shared space starts with an invite' : 'A shared rhythm starts here'
      : data.status === 'locked'
        ? 'Unlock shared daily challenges'
        : 'A little support goes a long way';
  const header = partnerState === 'invite' && !showingPreferences ? null : (
    <View style={styles.baeHeader}>
      <View style={styles.baeHeaderCopy}>
        <Text style={styles.baeTitle}>Partner check-in</Text>
        <Text style={styles.baeHeaderCaption}>{headerCaption}</Text>
      </View>
    </View>
  );

  if (data.status === 'locked') {
    const score = Math.max(0, data.access?.trophyScore || 0);
    const threshold = Math.max(1, data.access?.trophyThreshold || 50);
    const remaining = Math.max(0, data.access?.trophiesRemaining ?? threshold - score);
    const progress = `${Math.min(100, Math.round((score / threshold) * 100))}%` as `${number}%`;
    const forceLocked = data.access?.override === 'locked';
    return (
      <View style={styles.partnerSection}>
        {header}
        <BaeArtworkHero
          eyebrow={forceLocked ? 'ACCESS PAUSED' : 'UNLOCK PARTNER MODE'}
          title={forceLocked ? 'Partner mode is paused' : 'Consistency opens the door'}
          body={forceLocked ? 'FormBae support manages this access.' : `${remaining} more ${remaining === 1 ? 'trophy' : 'trophies'} to start shared challenges.`}
        />
        <View style={styles.baeAccessCard}>
          <View style={styles.baeLockHeading}><View style={styles.baeLockIcon}><Feather name="lock" size={20} color={colors.gold}/></View><View style={styles.matchStageCopy}><Text style={styles.matchStageTitle}>{forceLocked ? 'Access paused' : `Unlock at ${threshold} trophies`}</Text><Text style={styles.baeSafetyText}>{forceLocked ? 'Your existing connection is kept safe.' : 'Keep showing up. Get there together.'}</Text></View></View>
          {!forceLocked ? (
            <>
              <View style={styles.baeTrophyProgressHead}>
                <Text style={styles.baeTrophyProgressValue}>{score} trophies</Text>
                <Text style={styles.baeTrophyProgressTarget}>Unlocks at {threshold}</Text>
              </View>
              <View style={styles.baeTrophyTrack} accessible accessibilityRole="progressbar" accessibilityLabel="Partner mode unlock progress" accessibilityValue={{ min: 0, max: threshold, now: Math.min(score, threshold), text: `${score} of ${threshold} trophies. ${remaining} to go.` }}><View style={[styles.baeTrophyFill, { width: progress }]} /></View>
            </>
          ) : null}
          {!forceLocked ? <View style={styles.baeUnlockBenefits}><View style={styles.baeUnlockBenefit}><Feather name="users" size={16} color={colors.gold}/><Text style={styles.baeSafetyText}>A partner & shared daily challenges</Text></View><View style={styles.baeUnlockBenefit}><Feather name="image" size={16} color={colors.gold}/><Text style={styles.baeSafetyText}>Private photo check-ins, revealed together</Text></View></View> : null}
          <PrimaryButton title="View trophy progress" variant={forceLocked ? 'secondary' : 'primary'} onPress={onViewTrophies} style={styles.baeTrophyButton} />
        </View>
      </View>
    );
  }

  if (data.status === 'inactive' || showingPreferences) {
    return (
      <View style={styles.partnerSection}>
        {header}
        <BaeArtworkHero
          expanded
          eyebrow={busy ? 'SETTING UP' : showingPreferences ? 'MATCH PREFERENCES' : 'PARTNER MODE'}
          title={busy ? 'Saving your preference' : 'Get fit together'}
          body={busy ? 'Getting your shared space ready.' : 'Fitness is better with a friend.'}
          loading={busy}
        />
        <Text style={styles.baeChoicePrompt}>Match with</Text>
        <View style={[styles.baePreferenceRow, compact && styles.baePreferenceRowCompact]}>
          <BaePreference kind="male" label="Male" detail="Auto-match" compact={compact} onPress={() => selectPreference('male')} disabled={busy} />
          <BaePreference kind="female" label="Female" detail="Auto-match" compact={compact} onPress={() => selectPreference('female')} disabled={busy} />
          <BaePreference kind="friend" label="Friend" detail="Use a code" compact={compact} onPress={() => selectPreference('friend')} disabled={busy} />
        </View>
        {busy ? <ActivityIndicator color={colors.gold} /> : null}
      </View>
    );
  }

  if (partnerState === 'invite' || partnerState === 'matching') {
    const friendMode = partnerState === 'invite';
    const inviteCodeReady = Boolean(data.inviteCode);
    if (!friendMode) {
      return (
        <View style={styles.partnerSection}>
          {header}
          <PartnerMatchWaitingCard
            preference={data.preference === 'female' ? 'female' : 'male'}
            compact={compact} busy={busy}
            onChangePreference={() => setEditingPreferences(true)}
            onInviteFriend={() => onStart('friend')}
          />
          {cancelMatchButton}
        </View>
      );
    }
    return (
      <View style={styles.partnerSection}>
        {header}
        <BaeArtworkHero
          eyebrow="FRIEND INVITE"
          title="Invite a friend"
          body="Share your code to connect."
          compact
          loading={busy}
        />
        {friendMode ? (
          <>
            <View style={styles.friendInviteBox}>
              <View style={styles.friendCodeCopy}><Text style={styles.friendCodeLabel}>YOUR CODE</Text><Text style={styles.friendCodeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{inviteCodeReady ? data.inviteCode : 'Preparing…'}</Text></View>
              <PrimaryButton title="Invite" icon="share-2" size="sm" onPress={onShareFriendCode} disabled={!inviteCodeReady || busy} style={styles.friendShareButton} />
            </View>
            <Text style={styles.friendJoinLabel}>Or use their code</Text>
            <View style={styles.friendJoinRow}>
              <TextInput
                value={friendCode}
                onChangeText={(value) => onFriendCodeChange(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="Partner code"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                style={styles.friendCodeInput}
                accessibilityLabel="Friend code"
              />
              <PrimaryButton title="Connect" size="sm" onPress={onJoinFriend} disabled={!friendCode.trim() || busy} style={styles.friendJoinButton} />
            </View>
          </>
        ) : null}
        {cancelMatchButton}
      </View>
    );
  }

  const challenge = data.challenge;
  const partnerName = data.partner?.displayName || 'Your partner';
  const proofCount = Number(Boolean(data.youSubmitted)) + Number(Boolean(data.partnerSubmitted));
  const proofGuidance = data.bothSubmitted
    ? 'Both photos are saved. They’ll unlock together after midnight.'
    : data.youSubmitted
      ? `Your photo is saved. ${partnerName} has until midnight to check in.`
      : data.partnerSubmitted
        ? `${partnerName} checked in. Complete your task and add a photo before midnight.`
        : 'Complete the task, then add a photo before midnight.';
  return (
    <View style={styles.partnerSection}>
      {header}
      <StableImageBackground source={getAccountabilityBaeArtwork('matched')} defaultSource={getAccountabilityBaeArtwork('matched')} fadeDuration={0} style={styles.baeConnectedHero} imageStyle={styles.baeArtworkImage} resizeMode="contain">
        <LinearGradient colors={['rgba(4,5,8,0.98)', 'rgba(4,5,8,0.74)', 'rgba(4,5,8,0.06)']} locations={[0, 0.52, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.baeConnectedContent}>
          <View style={styles.baeConnectedTop}>
            <View style={styles.baeConnectedStatus}><View style={styles.baeConnectedDot} /><Text style={styles.baeConnectedStatusText}>CONNECTED</Text></View>
            <TouchableOpacity onPress={onViewPartner} disabled={busy} style={[styles.baeMoreButton, busy && styles.baeDisabled]} accessibilityRole="button" accessibilityLabel="View partner details" accessibilityState={{ disabled: busy }}><Feather name="more-horizontal" size={20} color={colors.ink} /></TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onViewPartner} style={styles.baeConnectedCopy} accessibilityRole="button" accessibilityLabel={`View ${partnerName} details`}>
            <Text style={styles.baePartnerLabel}>YOUR PARTNER</Text>
            <Text style={styles.baePartnerName} numberOfLines={1} ellipsizeMode="tail">{partnerName}</Text>
            <Text style={styles.baeConnectedCaption}>View partner & connection settings →</Text>
          </TouchableOpacity>
        </View>
      </StableImageBackground>
      <View style={styles.baePairSummary}>
        <View style={styles.baePairScores}>
          <View style={styles.baePairMember}>
            <Text style={styles.baePairName}>You</Text>
            <View style={styles.baePairScore}><TrophyIllustration size={22}/><Text style={styles.baePairNumber}>{data.access?.trophyScore ?? 0}</Text></View>
            <Text style={styles.baeSafetyText}>trophies</Text>
          </View>
          <View style={styles.baePairDivider}/>
          <View style={styles.baePairMember}>
            <Text style={styles.baePairName}>{partnerName}</Text>
            <View style={styles.baePairScore}><TrophyIllustration size={22}/><Text style={styles.baePairNumber}>{data.partner?.trophyCount ?? 0}</Text></View>
            <Text style={styles.baeSafetyText}>trophies</Text>
          </View>
        </View>
        <Text style={styles.baePairRecap}>{(data.history || []).filter(day => day.photosRevealed).length} shared days completed in the last 31 days</Text>
      </View>
      {challenge ? (
        <View style={styles.baeChallenge}>
          <View style={styles.baeChallengeTop}>
            <View style={styles.baeChallengeIcon}><MaterialCommunityIcon name={challenge.icon} size={24} color={colors.gold} /></View>
            <View style={styles.baeDuePill}><Feather name="clock" size={12} color={colors.gold} /><Text style={styles.baeDue}>{challenge.dueLabel}</Text></View>
          </View>
          <View style={styles.baeChallengeCopy}>
            <Text style={styles.baeChallengeTitle}>{challenge.title}</Text>
            <Text style={styles.baeChallengePrompt}>{challenge.prompt}</Text>
            {data.reason ? <Text style={styles.baeSafetyText}>{data.reason}</Text> : null}
            {data.timezone ? <Text style={styles.baeSafetyText}>Daily deadline: midnight ({data.timezone})</Text> : null}
          </View>
        </View>
      ) : <View style={styles.baeChallenge}><Text style={styles.baeChallengeTitle}>No open challenges</Text><Text style={styles.baeChallengePrompt}>You’re still connected. Enjoy your day and check back for your next shared task.</Text></View>}
      {challenge ? <View style={styles.proofCard}>
        <View style={styles.proofSectionHead}>
          <Text style={styles.proofSectionTitle}>Today’s proof</Text>
          <Text style={styles.proofSectionCount}>{proofCount} of 2 checked in</Text>
        </View>
        <View style={styles.proofProgress}>
          <View style={[styles.proofProgressStep, proofCount >= 1 && styles.proofProgressStepDone]} />
          <View style={[styles.proofProgressStep, proofCount >= 2 && styles.proofProgressStepDone]} />
        </View>
        <View style={styles.proofGrid}>
          <ProofTile label="You" submitted={Boolean(data.youSubmitted)} imageUrl={data.yourProofUrl} locked={!data.photosRevealed && Boolean(data.youSubmitted)} />
          <ProofTile label={partnerName} submitted={Boolean(data.partnerSubmitted)} imageUrl={data.partnerProofUrl} locked={!data.photosRevealed && Boolean(data.partnerSubmitted)} />
        </View>
        {data.bothSubmitted ? (
          <View style={styles.baeCompleteBanner}><View style={styles.baeCompleteIcon}><Feather name="check" size={18} color={colors.onPrimary} /></View><View style={styles.baeCompleteCopy}><Text style={styles.baeCompleteTitle}>You both showed up</Text><Text style={styles.baeCompleteText}>Both photos are saved. View them in Past days after midnight.</Text></View></View>
        ) : (
          <>
            <Text style={styles.proofGuidance}>{proofGuidance}</Text>
            {!data.youSubmitted ? <PrimaryButton title="Complete with a photo" icon="camera" onPress={onSubmitProof} loading={busy} style={styles.baeProofButton} /> : null}
          </>
        )}
      </View> : null}
      <PartnerDayHistory history={data.history || []} partnerName={partnerName} />
      <PrimaryButton title="Invite a friend instead" variant="secondary" icon="user-plus" onPress={() => onStart('friend')} disabled={busy}/>
      <View style={styles.baeSafety}><Feather name="eye-off" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>Photos unlock after midnight only when both people submitted before the deadline. Missed days stay private.</Text></View>
    </View>
  );
}

function InlineNotice({ icon, title, body, action, onPress, standalone = false }: { icon: string; title: string; body: string; action: string; onPress: () => void; standalone?: boolean }) {
  return (
    <View style={[styles.inlineNotice, standalone && styles.inlineNoticeStandalone]} accessibilityLiveRegion="polite">
      <View style={styles.inlineNoticeIcon}><Feather name={icon} size={18} color={colors.gold} /></View>
      <View style={styles.inlineNoticeCopy}>
        <Text style={styles.inlineNoticeTitle}>{title}</Text>
        <Text style={styles.inlineNoticeBody}>{body}</Text>
      </View>
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.inlineNoticeAction} accessibilityRole="button" accessibilityLabel={action}>
        <Text style={styles.inlineNoticeActionText}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function BaePreference({ kind, label, detail, compact, onPress, disabled }: {
  kind: 'male' | 'female' | 'friend';
  label: string;
  detail: string;
  compact: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.78} style={[styles.baePreference, compact && styles.baePreferenceCompact, disabled && styles.baeDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}. ${detail}`} accessibilityState={{ disabled }}>
      <PartnerChoiceMark kind={kind} />
      <View style={[styles.baePreferenceCopy, compact && styles.baePreferenceCopyCompact]}>
        <Text style={styles.baePreferenceText}>{label}</Text>
        <Text style={styles.baePreferenceDetail}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );
}

function PartnerChoiceMark({ kind }: { kind: 'male' | 'female' | 'friend' }) {
  const double = kind === 'friend';
  return (
    <View style={styles.partnerChoiceMark} accessible={false}>
      <View style={[styles.partnerChoiceFigure, double && styles.partnerChoiceFigureBack]}>
        <View style={styles.partnerChoiceHead} />
        <View style={styles.partnerChoiceBody} />
      </View>
      {double ? (
        <View style={[styles.partnerChoiceFigure, styles.partnerChoiceFigureFront]}>
          <View style={[styles.partnerChoiceHead, styles.partnerChoiceHeadGold]} />
          <View style={[styles.partnerChoiceBody, styles.partnerChoiceBodyGold]} />
        </View>
      ) : (
        <View style={[styles.partnerChoiceOrbit, kind === 'female' && styles.partnerChoiceOrbitOffset]} />
      )}
    </View>
  );
}

function PartnerDayHistory({ history, partnerName }: { history: NonNullable<AccountabilityBaeSummary['history']>; partnerName: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!history.length) return null;
  return <View style={styles.proofCard}>
    <Text style={styles.proofSectionTitle}>Past days</Text>
    <Text style={styles.baeSafetyText}>Your recent shared tasks. Photos stay available for 31 days while you’re matched.</Text>
    {history.slice(0, expanded ? 31 : 3).map(day => <View key={day.date} style={styles.baeHistoryDay}>
      <Text style={styles.baeDue}>{day.date}</Text>
      <Text style={styles.baeChallengeTitle}>{day.challenge?.title || 'Shared task'}</Text>
      {day.photosRevealed ? <View style={styles.proofGrid}>
        <ProofTile label="You" submitted imageUrl={day.yourProofUrl} locked={false}/>
        <ProofTile label={partnerName} submitted imageUrl={day.partnerProofUrl} locked={false}/>
      </View> : <Text style={styles.baeSafetyText}>This day closed without both check-ins. Photos remain private.</Text>}
    </View>)}
    {history.length > 3 ? <TouchableOpacity onPress={() => setExpanded(value => !value)} accessibilityRole="button" style={styles.baeHistoryMore}><Text style={styles.baeDue}>{expanded ? 'Show fewer days' : 'See more days'}</Text></TouchableOpacity> : null}
  </View>;
}

function ProofTile({ label, submitted, imageUrl, locked }: { label: string; submitted: boolean; imageUrl?: string; locked: boolean }) {
  const source = locked ? undefined : accountabilityBaeProofSource(imageUrl);
  const stateLabel = locked ? 'locked until after midnight and both people check in' : submitted ? 'submitted' : 'waiting';
  return (
    <View style={styles.proofTile} accessible accessibilityRole="image" accessibilityLabel={`${label}, ${stateLabel}`}>
      <View style={styles.proofImageWrap}>
        {source && !locked ? <StableImage source={source} style={styles.proofImage} resizeMode="cover" accessible={false} /> : <View style={styles.proofPlaceholder}><Feather name={locked ? 'lock' : submitted ? 'check' : 'camera'} size={23} color={submitted ? colors.ink : colors.inkSubtle} /></View>}
        <View style={[styles.proofStatusDot, submitted && styles.proofStatusDotDone]} />
      </View>
      <View style={styles.proofMeta}>
        <Text style={styles.proofLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.proofStatus, submitted && styles.proofStatusDone]}>{locked ? 'Saved · locked' : submitted ? 'Submitted' : 'Waiting'}</Text>
      </View>
    </View>
  );
}

function commitmentMet(kind: string, targetId: string, snapshot: ContextualSnapshot) {
  if (kind === 'diet') {
    return snapshot.dietEntries.some(
      (entry) => isToday(entry.createdAt)
        && entry.mealType === targetId
        && entry.kind !== 'skip'
        && entry.status !== 'skipped',
    );
  }
  if (kind === 'workout') {
    const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
    return Boolean(plan?.days?.find((day) => day.planDayId === targetId)?.completed);
  }
  return false;
}

function TodayTaskCard({ task, loading, onPress }: { task: TodayTask; loading: boolean; onPress: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const [artworkLayout, setArtworkLayout] = useState({ width: 0, height: 0 });
  const artwork = getAccountabilityTaskArtwork(task.kind);
  const artworkSize = Image.resolveAssetSource(artwork);
  const artworkFrame = artworkSize ? accountabilityArtworkFrame(artworkLayout, artworkSize, PixelRatio.get()) : undefined;
  const title = String(task.title || '').trim() || "Open today's task";
  const detail = String(task.detail || '').trim() || 'Ready when you are';
  const action = String(task.action || '').trim() || 'Open';
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      disabled={loading}
      style={[styles.todayTaskCard, task.active && styles.todayTaskCardActive]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}. ${action}`}
      accessibilityState={{ busy: loading }}
    >
      <View style={[styles.todayTaskArtwork, compact && styles.todayTaskArtworkCompact]}>
        <View pointerEvents="none" style={styles.todayTaskImageWindow}
          onLayout={({ nativeEvent: { layout } }) => setArtworkLayout({ width: layout.width, height: layout.height })}>
          <StableImage source={artwork} defaultSource={artwork} fadeDuration={0} resizeMode="contain" resizeMethod="scale" accessible={false}
            style={[styles.todayTaskImage, artworkFrame]} />
        </View>
        <LinearGradient colors={[colors.bg, 'rgba(5,6,10,0.74)', 'rgba(5,6,10,0)']}
          locations={[0, 0.53, 0.94]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.todayTaskContent}>
          <Text style={styles.todayTaskCategoryText}>{getAccountabilityTaskLabel(task.kind)}</Text>
          <View style={[styles.todayTaskCardCopy, compact && styles.todayTaskCardCopyCompact]}>
            <Text style={styles.todayTaskCardTitle}>{title}</Text>
            <Text style={styles.todayTaskCardDetail}>{detail}</Text>
            <View style={styles.todayTaskCardAction}>
              {loading ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <>
                <Text style={styles.todayTaskCardActionText}>{action}</Text>
                <Feather name="arrow-right" size={16} color={colors.onPrimary} />
              </>}
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  baeLockHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  baeLockIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  baeUnlockBenefits: { gap: 12, paddingVertical: 12 },
  baeUnlockBenefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchStageCopy: { flex: 1, gap: 4 },
  matchStageTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  scroll: { flexGrow: 1 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pageHeaderCompact: { flexWrap: 'wrap' },
  pageHeaderCopy: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  pageTitle: { ...typography.hero, color: colors.inkStrong, marginTop: 5 },
  trophyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 10 },
  trophyButtonCopy: { minWidth: 24 },
  trophyButtonValue: { fontSize: 17, lineHeight: 19, color: colors.ink, fontWeight: '900' },
  trophyButtonLabel: { fontSize: 9, lineHeight: 11, color: colors.inkMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  inlineNotice: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.sm, marginTop: spacing.md },
  inlineNoticeStandalone: { marginTop: spacing.xl },
  inlineNoticeIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  inlineNoticeCopy: { flex: 1, minWidth: 0 },
  inlineNoticeTitle: { ...typography.label, color: colors.ink, fontWeight: '800' },
  inlineNoticeBody: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 1 },
  inlineNoticeAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  inlineNoticeActionText: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  accountabilityTabs: { flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.panel, padding: 4, marginTop: 20 },
  accountabilityTab: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  accountabilityTabActive: { borderColor: colors.borderStrong, backgroundColor: colors.panelRaised },
  accountabilityTabIcon: { width: 30, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  accountabilityTabIconCompact: { width: 26 },
  accountabilityTabCopy: { flex: 1, minWidth: 0 },
  accountabilityTabText: { ...typography.label, color: colors.inkMuted, fontWeight: '700' },
  accountabilityTabTextActive: { color: colors.gold },
  accountabilityTabCaption: { fontSize: 10, lineHeight: 14, color: colors.inkSubtle, fontWeight: '500', marginTop: 1 },
  accountabilityTabCaptionActive: { color: colors.inkMuted },
  todayDashboard: { gap: 10 },
  todayHero: { marginTop: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  todayHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  todayHeroKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  todayMovePill: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, paddingHorizontal: spacing.sm },
  todayMovePillText: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  todayHeroTitle: { ...typography.title, color: colors.inkStrong, marginTop: spacing.md },
  todayHeroSubtitle: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.xs, maxWidth: 350 },
  todayHeroRule: { height: 5, flexDirection: 'row', gap: 5, marginTop: spacing.md },
  todayHeroSegment: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  todayHeroSegmentActive: { backgroundColor: colors.gold },
  todayQueueHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 14 },
  todayQueueTitle: { ...typography.bodyBold, color: colors.ink },
  todayQueueCount: { ...typography.caption, color: colors.inkMuted, backgroundColor: colors.panel, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  todayTaskList: { gap: spacing.sm },
  todayTaskCard: { overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bg },
  todayTaskCardActive: { borderColor: colors.gold },
  todayTaskArtwork: { minHeight: 208, overflow: 'hidden' },
  todayTaskArtworkCompact: { minHeight: 228 },
  todayTaskImageWindow: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '78%', overflow: 'hidden' },
  todayTaskImage: { position: 'absolute', bottom: 0, width: '100%', height: '100%' },
  todayTaskContent: { flexGrow: 1, minHeight: 208, justifyContent: 'space-between', padding: 16, gap: 24 },
  todayTaskCardCopy: { width: '76%', minWidth: 0, gap: 8 },
  todayTaskCardCopyCompact: { width: '100%' },
  todayTaskCategoryText: { ...typography.overline, fontSize: 10, letterSpacing: 1.5, color: colors.gold },
  todayTaskCardTitle: { fontSize: 22, lineHeight: 28, color: colors.inkStrong, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  todayTaskCardDetail: { ...typography.caption, color: colors.inkMuted },
  todayTaskCardAction: { alignSelf: 'flex-start', minWidth: 104, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.gold, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  todayTaskCardActionText: { ...typography.label, color: colors.onPrimary, fontWeight: '800' },
  partnerSection: { flexGrow: 1, flexShrink: 0, paddingBottom: spacing.sm, marginTop: spacing.lg },
  baeHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: 2 },
  baeHeaderCopy: { flex: 1, minWidth: 0 },
  baeTitle: { ...typography.subtitle, color: colors.ink, fontWeight: '700' },
  baeHeaderCaption: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  baeArtworkHero: { flexGrow: 1, flexShrink: 0, minHeight: 226, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.panel },
  baeArtworkExpanded: { minHeight: 310 },
  baeArtworkContentExpanded: { minHeight: 310 },
  baeArtworkCompact: { minHeight: 166 },
  baeArtworkContentCompact: { minHeight: 166, gap: spacing.md },
  baeArtworkImage: { borderRadius: radius.lg },
  baeArtworkContent: { flex: 1, minHeight: 226, justifyContent: 'space-between', padding: spacing.md },
  baeArtworkEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baeArtworkDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.gold },
  baeArtworkEyebrow: { ...typography.overline, color: colors.gold },
  baeArtworkTitle: { ...typography.hero, color: colors.inkStrong, maxWidth: '58%' },
  baeArtworkBody: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, maxWidth: '58%', marginTop: spacing.xs },
  baeAccessCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: spacing.md, marginTop: spacing.sm },
  baeTrophyProgressHead: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baeTrophyProgressValue: { ...typography.bodyBold, color: colors.ink },
  baeTrophyProgressTarget: { ...typography.caption, color: colors.inkMuted },
  baeTrophyTrack: { width: '100%', height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.panelRaised, marginTop: spacing.xs },
  baeTrophyFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  baeTrophyButton: { width: '100%', marginTop: spacing.md },
  baeChoicePrompt: { ...typography.label, color: colors.ink, marginTop: spacing.md, marginLeft: 2 },
  baePreferenceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  baePreferenceRowCompact: { flexDirection: 'column' },
  baePreference: { flex: 1, minWidth: 0, minHeight: 112, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  baePreferenceCompact: { flex: 0, width: '100%', minHeight: 74, flexDirection: 'row', justifyContent: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md },
  baePreferenceCopy: { alignItems: 'center' },
  baePreferenceCopyCompact: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  baePreferenceText: { ...typography.label, color: colors.ink, fontWeight: '800' },
  baePreferenceDetail: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '600', marginTop: 1 },
  partnerChoiceMark: { width: 52, height: 36, alignItems: 'center', justifyContent: 'center' },
  partnerChoiceFigure: { position: 'absolute', width: 24, height: 32, alignItems: 'center', justifyContent: 'flex-end', zIndex: 2 },
  partnerChoiceFigureBack: { left: 4, opacity: 0.68, zIndex: 1 },
  partnerChoiceFigureFront: { right: 4 },
  partnerChoiceHead: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.ink },
  partnerChoiceHeadGold: { backgroundColor: colors.gold },
  partnerChoiceBody: { width: 22, height: 14, borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: colors.ink, marginTop: 3 },
  partnerChoiceBodyGold: { backgroundColor: colors.gold },
  partnerChoiceOrbit: { position: 'absolute', width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldMuted, opacity: 0.7 },
  partnerChoiceOrbitOffset: { width: 40, height: 28, transform: [{ rotate: '-18deg' }] },
  baeSafety: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  baeSafetyText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  friendInviteBox: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  friendCodeCopy: { flex: 1, minWidth: 0 },
  friendCodeLabel: { ...typography.overline, color: colors.inkMuted },
  friendCodeValue: { fontSize: 22, lineHeight: 27, color: colors.ink, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  friendShareButton: { minWidth: 92 },
  friendJoinLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700', marginTop: spacing.md },
  friendJoinRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  friendCodeInput: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, fontSize: 14, fontWeight: '600', letterSpacing: 0.5, textAlign: 'left', paddingHorizontal: spacing.md },
  friendJoinButton: { minWidth: 92, minHeight: 48 },
  baeCancelButton: { marginTop: spacing.sm, borderRadius: 16, backgroundColor: colors.bg, borderColor: colors.border },
  baeDisabled: { opacity: 0.45 },
  baeConnectedHero: { flexGrow: 1, flexShrink: 0, minHeight: 238, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.panel },
  baeConnectedContent: { flex: 1, minHeight: 238, justifyContent: 'space-between', padding: spacing.md },
  baeConnectedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  baeConnectedStatus: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(240,206,120,0.35)', backgroundColor: 'rgba(5,6,10,0.78)', paddingHorizontal: spacing.sm },
  baeConnectedDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.gold },
  baeConnectedStatusText: { fontSize: 10, lineHeight: 13, color: colors.gold, fontWeight: '800', letterSpacing: 1.2 },
  baeConnectedCopy: { maxWidth: '60%' },
  baePartnerLabel: { ...typography.overline, color: colors.gold },
  baePartnerName: { ...typography.hero, color: colors.inkStrong, marginTop: 2 },
  baeConnectedCaption: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.xs },
  baeMoreButton: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,6,10,0.78)', borderWidth: 1, borderColor: colors.borderStrong },
  baeChallenge: { padding: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  baeChallengeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  baeChallengeIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  baeDuePill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  baeChallengeCopy: {},
  baeChallengeTitle: { fontSize: 19, lineHeight: 24, color: colors.ink, fontWeight: '700' },
  baeChallengePrompt: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  baeDue: { fontSize: 10, lineHeight: 13, color: colors.gold, fontWeight: '800' },
  proofCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: spacing.md, marginTop: spacing.sm },
  proofSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  proofSectionTitle: { ...typography.bodyBold, color: colors.ink },
  proofSectionCount: { ...typography.caption, color: colors.inkMuted },
  proofProgress: { height: 4, flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  proofProgressStep: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  proofProgressStepDone: { backgroundColor: colors.gold },
  proofGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  proofTile: { flex: 1, minWidth: 0 },
  proofImageWrap: { width: '100%', aspectRatio: 1.08, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  proofImage: { width: '100%', height: '100%' },
  proofPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  proofStatusDot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'transparent' },
  proofStatusDotDone: { backgroundColor: colors.gold },
  proofMeta: { paddingTop: spacing.xs, paddingHorizontal: 2 },
  proofLabel: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  proofStatus: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', marginTop: 1 },
  proofStatusDone: { color: colors.inkMuted },
  proofGuidance: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.md },
  baePairSummary: { padding: 18, gap: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  baePairScores: { flexDirection: 'row', gap: 16 },
  baePairMember: { flex: 1, minWidth: 0, gap: 5 },
  baePairName: { ...typography.bodyBold, color: colors.ink },
  baePairScore: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  baePairNumber: { fontSize: 25, lineHeight: 32, color: colors.gold, fontWeight: '700', fontVariant: ['tabular-nums'] },
  baePairDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  baePairRecap: { ...typography.caption, color: colors.inkMuted, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  baeHistoryDay: { gap: 10, paddingTop: 16, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  baeHistoryMore: { paddingVertical: 14, alignItems: 'center' },
  baeProofButton: { marginTop: spacing.md, backgroundColor: colors.gold, borderColor: colors.gold },
  baeCompleteBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: spacing.md, marginTop: spacing.md },
  baeCompleteIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,9,12,0.10)' },
  baeCompleteCopy: { flex: 1 },
  baeCompleteTitle: { ...typography.bodyBold, color: colors.onPrimary },
  baeCompleteText: { ...typography.caption, color: 'rgba(8,9,12,0.68)', marginTop: 1 },
});
