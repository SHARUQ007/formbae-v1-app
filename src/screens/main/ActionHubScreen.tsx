import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer, SectionTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState } from '../../components/States';
import {
  accountabilityBaeProofSource,
  fetchAccountability,
  fetchAccountabilityBae,
  joinAccountabilityBaeFriend,
  leaveAccountabilityBae,
  startAccountabilityBaeMatch,
  updateAccountability,
  uploadAccountabilityBaeProof,
} from '../../services/accountabilityService';
import { cancelAccountabilityReminder, scheduleAccountabilityReminder } from '../../services/notificationService';
import { loadProgressBundleCached, peekProgressBundleCached } from '../../services/preloadService';
import type { AccountabilityBaeSummary, AccountabilitySummary, TrophySummary } from '../../types/api';
import {
  currentMealType,
  isMealWindow,
  isToday,
  nextPlanDay,
  resolveContextualSnapshot,
  workoutTitle,
  type ContextualSnapshot,
} from '../../utils/contextualAction';
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
  icon: string;
  title: string;
  detail: string;
  action: string;
  onOpen: () => void;
  active?: boolean;
};

export function ActionHubScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [snapshot, setSnapshot] = useState<ContextualSnapshot | null>(null);
  const [accountability, setAccountability] = useState<AccountabilitySummary | null>(null);
  const [trophies, setTrophies] = useState<TrophySummary | null>(
    () => peekProgressBundleCached()?.progress.trophies ?? null,
  );
  const [accountabilityBae, setAccountabilityBae] = useState<AccountabilityBaeSummary | null>(null);
  const [baeBusy, setBaeBusy] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCommitment, setSavingCommitment] = useState(false);
  const [startingTaskKey, setStartingTaskKey] = useState('');
  const [activeView, setActiveView] = useState<'today' | 'bae'>('today');
  const [accountabilityUnavailable, setAccountabilityUnavailable] = useState(false);
  const [baeUnavailable, setBaeUnavailable] = useState(false);
  const autoCompletedDate = useRef('');

  const applyBaeSummary = useCallback((next: AccountabilityBaeSummary) => {
    setAccountabilityBae(next);
    setBaeUnavailable(false);
  }, []);
  const partnerStatus = accountabilityBae?.status;

  const load = useCallback(async (force = false) => {
    // Apply each resource as soon as it arrives. The previous all-at-once
    // update kept the entire tab behind whichever optional service was slowest.
    const [, nextAccountability, nextBae] = await Promise.allSettled([
      resolveContextualSnapshot().then((value) => {
        setSnapshot(value);
        setInitialLoading(false);
        return value;
      }),
      fetchAccountability({ force }).then((value) => {
        setAccountability(value);
        return value;
      }),
      fetchAccountabilityBae({ force }).then((value) => {
        setAccountabilityBae(value);
        return value;
      }),
      loadProgressBundleCached({ force }).then((value) => {
        setTrophies(value.progress.trophies ?? null);
        return value;
      }),
    ]);
    setAccountabilityUnavailable(nextAccountability.status === 'rejected');
    setBaeUnavailable(nextBae.status === 'rejected');
    setInitialLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch(() => undefined);
    if (!partnerStatus || partnerStatus === 'locked' || partnerStatus === 'inactive') return undefined;
    const partnerRefresh = setInterval(() => {
      fetchAccountabilityBae({ force: true }).then(applyBaeSummary).catch(() => setBaeUnavailable(true));
    }, 30_000);
    return () => clearInterval(partnerRefresh);
  }, [applyBaeSummary, load, partnerStatus]));

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
    const target = snapshot.target;
    if (target.kind === 'diet') {
      navigation.navigate('Diet', { mealType: target.mealType });
      return;
    }
    if (target.kind === 'workout') {
      if (target.day?.planDayId) {
        navigation.navigate('Workouts', {
          screen: 'WorkoutSummary',
          params: { planDayId: target.day.planDayId, title: workoutTitle(target.day), mode: 'standard' },
        });
        return;
      }
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
    if (!snapshot) return;
    const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
    const day = nextPlanDay(plan);
    if (day?.planDayId) {
      navigation.navigate('Workouts', {
        screen: 'WorkoutSummary',
        params: { planDayId: day.planDayId, title: workoutTitle(day), mode: 'standard' },
      });
      return;
    }
    navigation.navigate('Workouts', { screen: 'WorkoutList' });
  };

  const openFoodMemory = () => {
    navigation.navigate('Diet', { mealType: currentMealType() });
  };

  const openCommitment = () => {
    const commitment = accountability?.today;
    if (!commitment || !snapshot) return openTarget();
    if (commitment.targetKind === 'diet') {
      navigation.navigate('Diet', { mealType: commitment.targetId as ReturnType<typeof currentMealType> });
      return;
    }
    if (commitment.targetKind === 'workout') {
      const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
      const day = plan?.days?.find((item) => item.planDayId === commitment.targetId);
      if (day) {
        navigation.navigate('Workouts', { screen: 'WorkoutSummary', params: { planDayId: day.planDayId, title: workoutTitle(day), mode: 'standard' } });
        return;
      }
    }
    openTarget();
  };

  const startTodayTask = async (task: TodayTask) => {
    if (startingTaskKey) return;
    task.onOpen();
    if (accountability?.today) return;

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
    }
  };

  const completeCommitment = async () => {
    if (savingCommitment) return;
    setSavingCommitment(true);
    try {
      const next = await updateAccountability({ action: 'complete' });
      setAccountability(next);
      setAccountabilityUnavailable(false);
      cancelAccountabilityReminder().catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not update commitment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingCommitment(false);
    }
  };

  const startBaeMatch = async (preference: 'male' | 'female' | 'friend') => {
    if (baeBusy) return;
    setBaeBusy(true);
    try {
      applyBaeSummary(await startAccountabilityBaeMatch(preference));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (message.includes('gender in Profile')) {
        Alert.alert('Complete your profile first', 'Add your gender before using automatic partner matching.', [
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
    if (!code) return;
    await Share.share({
      title: 'Be my FormBae accountability partner',
      message: `Want to keep each other consistent on FormBae? We’ll get one daily challenge, check in privately, and unlock each other’s proof only after we both show up.\n\nUse my partner code: ${code}`,
    });
  };

  const uploadProof = async (asset?: Asset) => {
    if (baeBusy) return;
    if (!asset?.base64) {
      Alert.alert('Photo could not be read', 'Choose another photo and try again.');
      return;
    }
    setBaeBusy(true);
    try {
      applyBaeSummary(await uploadAccountabilityBaeProof(asset));
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
    const replacing = Boolean(accountabilityBae?.youSubmitted);
    Alert.alert(replacing ? 'Replace today’s proof?' : 'Submit today’s proof', 'Your photo stays private to this match. Your partner can view it only after both of you submit. Your face does not need to be visible.', [
      { text: 'Take photo', onPress: () => { takeProofPhoto().catch(() => undefined); } },
      { text: 'Choose from library', onPress: () => { chooseProofPhoto().catch(() => undefined); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const leaveBae = () => {
    Alert.alert('Leave this match?', 'Both people will be disconnected and the shared proof photos stored for this match will be deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave match',
        style: 'destructive',
        onPress: () => {
          setBaeBusy(true);
          leaveAccountabilityBae()
            .then(applyBaeSummary)
            .catch((error) => Alert.alert('Could not leave match', error instanceof Error ? error.message : 'Please try again.'))
            .finally(() => setBaeBusy(false));
        },
      },
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
  const planDays = plan?.days || [];
  const completedDays = planDays.filter((day) => day.completed).length;
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const commitment = accountability?.today;
  const commitmentActive = commitment?.status === 'active';
  const nextWorkout = nextPlanDay(plan);
  const mealType = currentMealType();
  const currentMealLogged = snapshot.dietEntries.some((entry) => isToday(entry.createdAt) && entry.mealType === mealType);
  const todayTasks: TodayTask[] = [];
  if (commitmentActive) {
    todayTasks.push({
      key: `active:${commitment.targetKind}:${commitment.targetId}`,
      kind: commitment.targetKind,
      targetId: commitment.targetId,
      icon: 'shield',
      title: commitment.title,
      detail: 'Active accountability task',
      action: 'Continue',
      onOpen: openCommitment,
      active: true,
    });
  }
  if (isMealWindow() && !currentMealLogged) {
    todayTasks.push({
      key: `diet:${mealType}`,
      kind: 'diet',
      targetId: mealType,
      icon: 'coffee',
      title: 'Play food memory',
      detail: `Recall your ${mealType.toLowerCase()} one item at a time`,
      action: 'Play',
      onOpen: openFoodMemory,
    });
  }
  if (nextWorkout?.planDayId && !nextWorkout.completed) {
    todayTasks.push({
      key: `workout:${nextWorkout.planDayId}`,
      kind: 'workout',
      targetId: nextWorkout.planDayId,
      icon: 'activity',
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
      icon: 'refresh-cw',
      title: 'Build your next plan',
      detail: 'Plan check-in is ready',
      action: 'Check in',
      onOpen: () => navigation.navigate('Workouts', { screen: 'PlanRefresh' }),
    });
  }
  const uniqueTodayTasks = todayTasks.filter((task, index, tasks) => tasks.findIndex((candidate) => candidate.kind === task.kind && candidate.targetId === task.targetId) === index);
  if (!uniqueTodayTasks.length) {
    uniqueTodayTasks.push({
      key: 'progress:review',
      kind: 'progress',
      targetId: 'progress',
      icon: 'bar-chart-2',
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
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <Text style={styles.kicker}>{dateLabel}</Text>
            <Text style={styles.pageTitle}>Accountability</Text>
          </View>
          <TouchableOpacity style={styles.trophyButton} onPress={() => navigation.navigate('Progress')} activeOpacity={0.76} accessibilityRole="button" accessibilityLabel={`${trophies?.score ?? 0} trophies. View trophy progress`}>
            <MaterialCommunityIcon name="trophy-outline" size={20} color={colors.gold} />
            <View style={styles.trophyButtonCopy}>
              <Text style={styles.trophyButtonValue}>{trophies?.score ?? '—'}</Text>
              <Text style={styles.trophyButtonLabel}>Trophies</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.gold} />
          </TouchableOpacity>
        </View>

        {accountabilityUnavailable ? (
          <InlineNotice
            icon="wifi-off"
            title={accountability ? 'Showing saved accountability' : 'Accountability is offline'}
            body={accountability ? 'Your latest saved status is visible. Refresh when your connection returns.' : 'Reconnect before creating or completing a promise.'}
            action="Retry"
            onPress={() => load(true)}
          />
        ) : null}

        <View style={styles.accountabilityTabs} accessibilityRole="tablist">
          <TouchableOpacity style={[styles.accountabilityTab, activeView === 'today' && styles.accountabilityTabActive]} onPress={() => setActiveView('today')} accessibilityRole="tab" accessibilityState={{ selected: activeView === 'today' }}>
            <Feather name="check-square" size={17} color={activeView === 'today' ? colors.gold : colors.inkMuted} />
            <Text style={[styles.accountabilityTabText, activeView === 'today' && styles.accountabilityTabTextActive]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.accountabilityTab, activeView === 'bae' && styles.accountabilityTabActive]} onPress={() => setActiveView('bae')} accessibilityRole="tab" accessibilityState={{ selected: activeView === 'bae' }}>
            <Feather name={accountabilityBae?.status === 'locked' ? 'lock' : 'users'} size={17} color={activeView === 'bae' ? colors.gold : colors.inkMuted} />
            <Text style={[styles.accountabilityTabText, activeView === 'bae' && styles.accountabilityTabTextActive]}>Bae</Text>
          </TouchableOpacity>
        </View>
        {activeView === 'today' ? (
          <>
            <View style={styles.todaySectionHead}>
              <View style={styles.todaySectionCopy}>
                <Text style={styles.todaySectionTitle}>Today’s focus</Text>
                <Text style={styles.todaySectionSubtitle}>Small actions that keep your plan moving.</Text>
              </View>
              <View style={styles.todaySectionCountPill}>
                <Text style={styles.todaySectionCount}>{uniqueTodayTasks.length}</Text>
              </View>
            </View>
            <View style={styles.todayTaskList}>
              {uniqueTodayTasks.map((task) => (
                <TodayTaskRow key={task.key} task={task} loading={startingTaskKey === task.key} onPress={() => startTodayTask(task)} />
              ))}
            </View>
            {commitmentActive ? (
              <PrimaryButton
                title="Mark task complete"
                icon="check"
                onPress={completeCommitment}
                loading={savingCommitment}
                disabled={accountabilityUnavailable}
                style={styles.markDoneAction}
              />
            ) : null}

            <SectionTitle>Your record</SectionTitle>
            <View style={styles.consistencyCard}>
              <ConsistencyMetric icon="shield" label="Promises kept" value={`${accountability?.keptCount || 0}`} />
              <ConsistencyMetric icon="check-circle" label="Plan complete" value={planDays.length ? `${completedDays}/${planDays.length}` : '—'} />
            </View>
          </>
        ) : (
          <>
            {baeUnavailable && accountabilityBae ? (
              <InlineNotice icon="refresh-cw" title="Partner status may be out of date" body="Your saved match is still available." action="Refresh" onPress={() => load(true)} />
            ) : null}

            <AccountabilityBaeCard
              data={accountabilityBae}
              busy={baeBusy}
              friendCode={friendCode}
              onFriendCodeChange={setFriendCode}
              onStart={startBaeMatch}
              onJoinFriend={joinFriend}
              onShareFriendCode={shareFriendCode}
              onSubmitProof={openProofPicker}
              onLeave={leaveBae}
              onRetry={() => load(true)}
              onViewTrophies={() => navigation.navigate('Progress')}
            />
          </>
        )}

      </ScrollView>
    </ScreenContainer>
  );
}

type AccountabilityBaeCardProps = {
  data: AccountabilityBaeSummary | null;
  busy: boolean;
  friendCode: string;
  onFriendCodeChange: (value: string) => void;
  onStart: (preference: 'male' | 'female' | 'friend') => void;
  onJoinFriend: () => void;
  onShareFriendCode: () => void;
  onSubmitProof: () => void;
  onLeave: () => void;
  onRetry: () => void;
  onViewTrophies: () => void;
};

function AccountabilityBaeCard({ data, busy, friendCode, onFriendCodeChange, onStart, onJoinFriend, onShareFriendCode, onSubmitProof, onLeave, onRetry, onViewTrophies }: AccountabilityBaeCardProps) {
  if (!data) {
    return <InlineNotice icon="wifi-off" title="Partner accountability is unavailable" body="Your match has not been changed. Check your connection and try again." action="Try again" onPress={onRetry} />;
  }

  const header = (
    <View style={styles.baeHeader}>
      <View style={styles.baeHeaderCopy}>
        <Text style={styles.baeTitle}>Accountability Bae</Text>
        <Text style={styles.baeHeaderCaption}>A private daily check-in with a partner</Text>
      </View>
      {data.status === 'matched' ? <Badge label="Active" tone="gold" icon="check" style={styles.activeBadge} /> : null}
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
        <View style={styles.baeLockHero}>
          <View style={styles.baeLockIcon}><MaterialCommunityIcon name="trophy-outline" size={30} color={colors.gold} /></View>
          <Text style={styles.baeLockEyebrow}>{forceLocked ? 'ACCESS PAUSED' : 'UNLOCK AT 50 TROPHIES'}</Text>
          <Text style={styles.baeLockTitle}>{forceLocked ? 'Accountability Bae is unavailable' : 'Earn your way in'}</Text>
          <Text style={styles.baeLockText}>{forceLocked ? 'Your access is currently managed by FormBae support.' : `Earn ${remaining} more ${remaining === 1 ? 'trophy' : 'trophies'} to unlock private partner challenges.`}</Text>
          <View style={styles.baeTrophyProgressHead}><Text style={styles.baeTrophyProgressValue}>{score} trophies</Text><Text style={styles.baeTrophyProgressTarget}>{threshold}</Text></View>
          <View style={styles.baeTrophyTrack}><View style={[styles.baeTrophyFill, { width: progress }]} /></View>
          <PrimaryButton title="View trophy progress" icon="award" variant="secondary" onPress={onViewTrophies} style={styles.baeTrophyButton} />
        </View>
      </View>
    );
  }

  if (data.status === 'inactive') {
    return (
      <View style={styles.partnerSection}>
        {header}
        <View style={styles.baeIntroHero}>
          <Text style={styles.baeIntroTitle}>Choose your partner</Text>
          <Text style={styles.baeIntro}>Complete one shared daily challenge. Proof stays private and unlocks only after both people check in.</Text>
        </View>
        <View style={styles.baePreferenceRow}>
          <BaePreference icon="gender-male" label="Male" onPress={() => onStart('male')} disabled={busy} />
          <BaePreference icon="gender-female" label="Female" onPress={() => onStart('female')} disabled={busy} />
          <BaePreference icon="account-multiple-plus-outline" label="Friend" onPress={() => onStart('friend')} disabled={busy} />
        </View>
        {busy ? <ActivityIndicator color={colors.gold} /> : null}
        <View style={styles.baeSafety}><Feather name="lock" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>First names only. No face photo required.</Text></View>
      </View>
    );
  }

  if (data.status === 'waiting') {
    const friendMode = data.preference === 'friend';
    return (
      <View style={styles.partnerSection}>
        {header}
        <View style={styles.baeWaitingHero}>
          <View style={styles.baeWaitingIcon}>{busy ? <ActivityIndicator color={colors.gold} /> : <MaterialCommunityIcon name={friendMode ? 'account-multiple-plus-outline' : 'radar'} size={28} color={colors.gold} />}</View>
          <View style={styles.baeWaitingCopy}>
            <Text style={styles.baeWaitingKicker}>{friendMode ? 'INVITE READY' : 'MATCHING IN PROGRESS'}</Text>
            <Text style={styles.baeWaitingTitle}>{friendMode ? 'Bring your partner in' : 'Finding the right partner'}</Text>
            <Text style={styles.baeWaitingDescription}>{friendMode ? 'Share your code. You’ll connect when your friend enters it.' : `We’re finding a compatible ${data.preference} partner. You can leave this screen.`}</Text>
          </View>
        </View>
        {friendMode ? (
          <>
            <View style={styles.friendInviteBox}>
              <View><Text style={styles.friendCodeLabel}>PARTNER CODE</Text><Text style={styles.friendCodeValue}>{data.inviteCode}</Text></View>
              <PrimaryButton title="Invite" icon="share-2" size="sm" onPress={onShareFriendCode} style={styles.friendShareButton} />
            </View>
            <Text style={styles.friendJoinLabel}>Already have their code?</Text>
            <View style={styles.friendJoinRow}>
              <TextInput
                value={friendCode}
                onChangeText={(value) => onFriendCodeChange(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ENTER PARTNER CODE"
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
        <PrimaryButton title="Cancel matching" variant="ghost" size="sm" onPress={onLeave} disabled={busy} style={styles.baeTextButton} />
      </View>
    );
  }

  const challenge = data.challenge;
  const partnerName = data.partner?.displayName || 'Your partner';
  const proofCount = Number(Boolean(data.youSubmitted)) + Number(Boolean(data.partnerSubmitted));
  const proofGuidance = data.youSubmitted
    ? `Waiting for ${partnerName}.`
    : data.partnerSubmitted
      ? `${partnerName} checked in. Add yours to unlock both.`
      : 'Check in to start today’s challenge.';
  return (
    <View style={styles.partnerSection}>
      {header}
      <View style={styles.baePartnerRow}>
        <View style={styles.baePartnerAvatar}><Text style={styles.baePartnerInitial}>{partnerName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.baePartnerCopy}><Text style={styles.baePartnerLabel}>YOUR PARTNER</Text><Text style={styles.baePartnerName}>{partnerName}</Text></View>
        <TouchableOpacity onPress={onLeave} style={styles.baeMoreButton} accessibilityRole="button" accessibilityLabel="Leave Accountability Bae match"><Feather name="more-horizontal" size={20} color={colors.inkMuted} /></TouchableOpacity>
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
          </View>
        </View>
      ) : null}
      <View style={styles.proofCard}>
        <View style={styles.proofSectionHead}>
          <Text style={styles.proofSectionTitle}>Today’s proof</Text>
          <Text style={styles.proofSectionCount}>{proofCount} of 2 checked in</Text>
        </View>
        <View style={styles.proofProgress}>
          <View style={[styles.proofProgressStep, proofCount >= 1 && styles.proofProgressStepDone]} />
          <View style={[styles.proofProgressStep, proofCount >= 2 && styles.proofProgressStepDone]} />
        </View>
        <View style={styles.proofGrid}>
          <ProofTile label="You" submitted={Boolean(data.youSubmitted)} imageUrl={data.yourProofUrl} locked={false} />
          <ProofTile label={partnerName} submitted={Boolean(data.partnerSubmitted)} imageUrl={data.partnerProofUrl} locked={Boolean(data.partnerSubmitted && !data.bothSubmitted)} />
        </View>
        {data.bothSubmitted ? (
          <View style={styles.baeCompleteBanner}><View style={styles.baeCompleteIcon}><Feather name="check" size={18} color={colors.onPrimary} /></View><View style={styles.baeCompleteCopy}><Text style={styles.baeCompleteTitle}>You both showed up</Text><Text style={styles.baeCompleteText}>Done for today. Come back tomorrow.</Text></View></View>
        ) : (
          <>
            <Text style={styles.proofGuidance}>{proofGuidance}</Text>
            <PrimaryButton title={data.youSubmitted ? 'Update my check-in' : 'Check in with a photo'} icon="camera" onPress={onSubmitProof} loading={busy} style={styles.baeProofButton} />
          </>
        )}
      </View>
      <View style={styles.baeSafety}><Feather name="eye-off" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>Photos unlock together—never one-sided.</Text></View>
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

function ConsistencyMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricValueRow}>
        <View style={styles.metricIcon}><Feather name={icon} size={16} color={colors.gold} /></View>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function BaePreference({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled: boolean }) {
  const detail = label === 'Friend' ? 'Invite someone with a private code' : `Find a ${label.toLowerCase()} accountability partner`;
  return (
    <TouchableOpacity activeOpacity={0.78} style={[styles.baePreference, disabled && styles.baeDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Match with a ${label.toLowerCase()} accountability partner`}>
      <View style={styles.baePreferenceIcon}><MaterialCommunityIcon name={icon} size={22} color={colors.gold} /></View>
      <View style={styles.baePreferenceCopy}>
        <Text style={styles.baePreferenceText}>{label}</Text>
        <Text style={styles.baePreferenceDetail}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={19} color={colors.gold} />
    </TouchableOpacity>
  );
}

function ProofTile({ label, submitted, imageUrl, locked }: { label: string; submitted: boolean; imageUrl?: string; locked: boolean }) {
  const source = accountabilityBaeProofSource(imageUrl);
  return (
    <View style={styles.proofTile}>
      <View style={styles.proofImageWrap}>
        {source && !locked ? <Image source={source} style={styles.proofImage} resizeMode="cover" /> : <View style={styles.proofPlaceholder}><Feather name={locked ? 'lock' : submitted ? 'check' : 'camera'} size={23} color={submitted ? colors.gold : colors.inkSubtle} /></View>}
        <View style={[styles.proofStatusDot, submitted && styles.proofStatusDotDone]} />
      </View>
      <View style={styles.proofMeta}>
        <Text style={styles.proofLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.proofStatus, submitted && styles.proofStatusDone]}>{locked ? 'Unlocks together' : submitted ? 'Submitted' : 'Waiting'}</Text>
      </View>
    </View>
  );
}

function commitmentMet(kind: string, targetId: string, snapshot: ContextualSnapshot) {
  if (kind === 'diet') {
    return snapshot.dietEntries.some((entry) => isToday(entry.createdAt) && entry.mealType === targetId);
  }
  if (kind === 'workout') {
    const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
    return Boolean(plan?.days?.find((day) => day.planDayId === targetId)?.completed);
  }
  return false;
}

function TodayTaskRow({ task, loading, onPress }: { task: TodayTask; loading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      disabled={loading}
      style={[styles.todayTaskRow, task.active && styles.todayTaskRowActive]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${task.detail}. ${task.action}`}
      accessibilityState={{ busy: loading }}
    >
      <View style={[styles.todayTaskRowIcon, task.active && styles.todayTaskRowIconActive]}>
        {loading ? <ActivityIndicator size="small" color={colors.gold} /> : <Feather name={task.icon} size={18} color={colors.gold} />}
      </View>
      <View style={styles.todayTaskRowCopy}>
        <Text style={styles.todayTaskRowTitle}>{task.title}</Text>
        <Text style={styles.todayTaskRowDetail}>{task.detail}</Text>
      </View>
      <View style={styles.todayTaskRowAction}><Text style={styles.todayTaskRowActionText}>{task.action}</Text><Feather name="chevron-right" size={17} color={colors.inkSubtle} /></View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pageHeaderCopy: { flex: 1, minWidth: 0 },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  pageTitle: { ...typography.display, color: colors.inkStrong, marginTop: 2 },
  trophyButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.panelWarm, paddingHorizontal: spacing.sm },
  trophyButtonCopy: { minWidth: 42 },
  trophyButtonValue: { fontSize: 17, lineHeight: 19, color: colors.ink, fontWeight: '900' },
  trophyButtonLabel: { fontSize: 9, lineHeight: 11, color: colors.inkMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  activeBadge: { backgroundColor: colors.panelWarm, borderColor: colors.goldMuted },
  inlineNotice: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.sm, marginTop: spacing.md },
  inlineNoticeStandalone: { marginTop: spacing.xl },
  inlineNoticeIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  inlineNoticeCopy: { flex: 1, minWidth: 0 },
  inlineNoticeTitle: { ...typography.label, color: colors.ink, fontWeight: '800' },
  inlineNoticeBody: { ...typography.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 1 },
  inlineNoticeAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  inlineNoticeActionText: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  accountabilityTabs: { flexDirection: 'row', gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: spacing.lg },
  accountabilityTab: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderBottomWidth: 2, borderBottomColor: colors.bg },
  accountabilityTabActive: { borderBottomColor: colors.gold },
  accountabilityTabText: { ...typography.bodyBold, color: colors.inkMuted },
  accountabilityTabTextActive: { color: colors.ink },
  todaySectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md },
  todaySectionCopy: { flex: 1, minWidth: 0 },
  todaySectionTitle: { ...typography.title, color: colors.ink },
  todaySectionSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  todaySectionCountPill: { minWidth: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  todaySectionCount: { ...typography.label, color: colors.ink, fontWeight: '800' },
  todayTaskList: { gap: spacing.sm },
  todayTaskRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  todayTaskRowActive: { backgroundColor: colors.panelWarm, borderColor: colors.goldMuted },
  todayTaskRowIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  todayTaskRowIconActive: { backgroundColor: colors.accentLight },
  todayTaskRowCopy: { flex: 1, minWidth: 0 },
  todayTaskRowTitle: { ...typography.bodyBold, color: colors.ink },
  todayTaskRowDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  todayTaskRowAction: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingLeft: spacing.xs },
  todayTaskRowActionText: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  markDoneAction: { marginTop: spacing.sm },
  partnerSection: { paddingBottom: spacing.sm, marginTop: spacing.xl },
  baeHeader: { minHeight: 46, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },
  baeHeaderCopy: { flex: 1, minWidth: 0 },
  baeTitle: { ...typography.title, color: colors.ink },
  baeHeaderCaption: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  baeLockHero: { alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: spacing.lg },
  baeLockIcon: { width: 66, height: 66, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelWarm, borderWidth: 1, borderColor: colors.goldMuted },
  baeLockEyebrow: { ...typography.overline, color: colors.gold, marginTop: spacing.md },
  baeLockTitle: { ...typography.title, color: colors.ink, textAlign: 'center', marginTop: spacing.xs },
  baeLockText: { ...typography.body, color: colors.inkMuted, textAlign: 'center', lineHeight: 22, maxWidth: 320, marginTop: spacing.xs },
  baeTrophyProgressHead: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl },
  baeTrophyProgressValue: { ...typography.bodyBold, color: colors.ink },
  baeTrophyProgressTarget: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  baeTrophyTrack: { width: '100%', height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.panelRaised, marginTop: spacing.xs },
  baeTrophyFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  baeTrophyButton: { width: '100%', marginTop: spacing.lg },
  baeIntroHero: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: spacing.md },
  baeIntroTitle: { ...typography.title, color: colors.ink },
  baeIntro: { ...typography.body, color: colors.inkMuted, lineHeight: 22, marginTop: spacing.xs, maxWidth: 330 },
  baePreferenceRow: { gap: spacing.sm, marginTop: spacing.sm },
  baePreference: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.md },
  baePreferenceIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDarker },
  baePreferenceCopy: { flex: 1, minWidth: 0 },
  baePreferenceText: { ...typography.bodyBold, color: colors.ink },
  baePreferenceDetail: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  baeSafety: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  baeSafetyText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  baeMuted: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, textAlign: 'center' },
  baeWaitingHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: spacing.md },
  baeWaitingIcon: { width: 58, height: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.borderStrong },
  baeWaitingCopy: { flex: 1, minWidth: 0 },
  baeWaitingKicker: { ...typography.overline, color: colors.gold },
  baeWaitingTitle: { ...typography.title, color: colors.ink, marginTop: spacing.xs },
  baeWaitingDescription: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.xs },
  friendInviteBox: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.panelWarm, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  friendCodeLabel: { ...typography.overline, color: colors.inkMuted },
  friendCodeValue: { fontSize: 22, lineHeight: 27, color: colors.ink, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  friendShareButton: { minWidth: 92 },
  friendJoinLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700', marginTop: spacing.md },
  friendJoinRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  friendCodeInput: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', paddingHorizontal: spacing.sm },
  friendJoinButton: { minWidth: 92, minHeight: 48 },
  baeTextButton: { alignSelf: 'center', marginTop: spacing.sm },
  baeDisabled: { opacity: 0.45 },
  baePartnerRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, paddingHorizontal: spacing.md },
  baePartnerAvatar: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelWarm, borderWidth: 1, borderColor: colors.goldMuted },
  baePartnerInitial: { ...typography.subtitle, color: colors.ink, fontWeight: '900' },
  baePartnerCopy: { flex: 1, minWidth: 0 },
  baePartnerLabel: { ...typography.overline, color: colors.inkMuted },
  baePartnerName: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  baeMoreButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  baeChallenge: { padding: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.panelWarm },
  baeChallengeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  baeChallengeIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  baeDuePill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  baeChallengeCopy: {},
  baeChallengeTitle: { fontSize: 20, lineHeight: 25, color: colors.ink, fontWeight: '900' },
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
  proofStatusDot: { position: 'absolute', right: 8, top: 8, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.inkSubtle, borderWidth: 2, borderColor: colors.panel },
  proofStatusDotDone: { backgroundColor: colors.gold },
  proofMeta: { paddingTop: spacing.xs, paddingHorizontal: 2 },
  proofLabel: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  proofStatus: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', marginTop: 1 },
  proofStatusDone: { color: colors.gold },
  proofGuidance: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.md },
  baeProofButton: { marginTop: spacing.md },
  baeCompleteBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.panelWarm, borderWidth: 1, borderColor: colors.goldMuted, paddingHorizontal: spacing.md, marginTop: spacing.md },
  baeCompleteIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  baeCompleteCopy: { flex: 1 },
  baeCompleteTitle: { ...typography.bodyBold, color: colors.ink },
  baeCompleteText: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  consistencyCard: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  metric: { flex: 1, minWidth: 0, minHeight: 92, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricIcon: { width: 20, alignItems: 'flex-start', justifyContent: 'center' },
  metricValue: { fontSize: 21, lineHeight: 26, fontWeight: '900', color: colors.inkStrong },
  metricLabel: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', marginTop: 4 },
});
