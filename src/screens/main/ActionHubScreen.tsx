import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScreenContainer } from '../../components/Card';
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
import type { AccountabilityBaeSummary, AccountabilitySummary } from '../../types/api';
import {
  currentMealType,
  isToday,
  nextPlanDay,
  resolveContextualSnapshot,
  workoutTitle,
  type ContextualSnapshot,
} from '../../utils/contextualAction';
import type { MainTabParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type Props = BottomTabScreenProps<MainTabParamList, 'Action'>;

export function ActionHubScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [snapshot, setSnapshot] = useState<ContextualSnapshot | null>(null);
  const [accountability, setAccountability] = useState<AccountabilitySummary | null>(null);
  const [accountabilityBae, setAccountabilityBae] = useState<AccountabilityBaeSummary | null>(null);
  const [baeBusy, setBaeBusy] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savingCommitment, setSavingCommitment] = useState(false);
  const autoCompletedDate = useRef('');

  const load = useCallback(async () => {
    const [nextSnapshot, nextAccountability, nextBae] = await Promise.all([
      resolveContextualSnapshot(),
      fetchAccountability().catch(() => null),
      fetchAccountabilityBae().catch(() => null),
    ]);
    setSnapshot(nextSnapshot);
    setAccountability(nextAccountability);
    setAccountabilityBae(nextBae);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const partnerRefresh = setInterval(() => {
      fetchAccountabilityBae().then(setAccountabilityBae).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(partnerRefresh);
  }, [load]));

  useEffect(() => {
    const commitment = accountability?.today;
    if (!snapshot || !commitment || commitment.status !== 'active' || savingCommitment || autoCompletedDate.current === commitment.date || !commitmentMet(commitment.targetKind, commitment.targetId, snapshot)) return;
    autoCompletedDate.current = commitment.date;
    setSavingCommitment(true);
    updateAccountability({ action: 'complete' })
      .then((next) => {
        setAccountability(next);
        cancelAccountabilityReminder().catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => setSavingCommitment(false));
  }, [accountability?.today, savingCommitment, snapshot]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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

  const commitForToday = async () => {
    if (!snapshot || savingCommitment) return;
    setSavingCommitment(true);
    try {
      const target = snapshot.target;
      const targetId = target.kind === 'workout' ? target.day?.planDayId || '' : target.kind === 'diet' ? target.mealType : target.kind;
      const title = targetTitle(snapshot);
      const next = await updateAccountability({ action: 'commit', targetKind: target.kind, targetId, title });
      setAccountability(next);
      scheduleAccountabilityReminder(title).catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not save commitment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingCommitment(false);
    }
  };

  const completeCommitment = async () => {
    if (savingCommitment) return;
    setSavingCommitment(true);
    try {
      const next = await updateAccountability({ action: 'complete' });
      setAccountability(next);
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
      setAccountabilityBae(await startAccountabilityBaeMatch(preference));
    } catch (error) {
      Alert.alert('Could not start matching', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBaeBusy(false);
    }
  };

  const joinFriend = async () => {
    const code = friendCode.trim();
    if (!code || baeBusy) return;
    setBaeBusy(true);
    try {
      setAccountabilityBae(await joinAccountabilityBaeFriend(code));
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
      title: 'Join my Accountability Bae',
      message: `Be my Accountability Bae on FormBae. Use friend code ${code}.`,
    });
  };

  const uploadProof = async (asset?: Asset) => {
    if (!asset?.base64 || baeBusy) return;
    setBaeBusy(true);
    try {
      setAccountabilityBae(await uploadAccountabilityBaeProof(asset));
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
    Alert.alert('Submit today’s proof', 'Choose a clear photo. Your face does not need to be visible.', [
      { text: 'Take photo', onPress: () => { takeProofPhoto().catch(() => undefined); } },
      { text: 'Choose from library', onPress: () => { chooseProofPhoto().catch(() => undefined); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const leaveBae = () => {
    Alert.alert('Leave this match?', 'Both people will be disconnected from this Accountability Bae match.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave match',
        style: 'destructive',
        onPress: () => {
          setBaeBusy(true);
          leaveAccountabilityBae()
            .then(setAccountabilityBae)
            .catch((error) => Alert.alert('Could not leave match', error instanceof Error ? error.message : 'Please try again.'))
            .finally(() => setBaeBusy(false));
        },
      },
    ]);
  };

  if (!snapshot) {
    return (
      <ScreenContainer>
        <LoadingState message="Preparing today..." />
      </ScreenContainer>
    );
  }

  const plan = snapshot.workoutData?.plan || snapshot.workoutData?.today?.plan;
  const planDays = plan?.days || [];
  const completedDays = planDays.filter((day) => day.completed).length;
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const quickActions = [
    {
      kind: 'workout',
      icon: 'activity',
      title: 'Workout plan',
      body: nextPlanDay(plan) ? 'Open your next planned session' : 'Review your training schedule',
      onPress: openWorkout,
    },
    {
      kind: 'diet',
      icon: 'edit-3',
      title: 'Food memory',
      body: `Add ${currentMealType().toLowerCase()} while it is fresh`,
      onPress: openFoodMemory,
    },
    {
      kind: 'progress',
      icon: 'bar-chart-2',
      title: 'Progress',
      body: 'View consistency, streaks, and trends',
      onPress: () => navigation.navigate('Progress'),
    },
  ].filter((action) => action.kind !== snapshot.target.kind);
  const commitment = accountability?.today;
  const commitmentComplete = commitment?.status === 'completed';

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>{dateLabel}</Text>
          <Text style={styles.title}>Accountability</Text>
          <Text style={styles.subtitle}>One clear promise. Follow through today.</Text>
        </View>

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
        />

        <View style={[styles.hero, commitmentComplete && styles.heroComplete]}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Feather name={commitmentComplete ? 'check' : commitment ? 'shield' : snapshot.target.icon} size={22} color={commitmentComplete ? colors.onPrimary : colors.inkStrong} />
            </View>
            <View style={styles.recommendedPill}>
              <View style={[styles.recommendedDot, commitmentComplete && styles.recommendedDotComplete]} />
              <Text style={styles.recommendedText}>{commitmentComplete ? 'Promise kept' : commitment ? 'Committed' : 'Recommended'}</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>Today's commitment</Text>
          <Text style={styles.heroTitle}>{commitment?.title || targetTitle(snapshot)}</Text>
          <Text style={styles.heroMeta}>{commitmentComplete ? 'You followed through. That is how consistency gets built.' : commitment ? 'Your reminder is set. Do it now or mark it complete when you finish.' : targetMeta(snapshot)}</Text>
          {commitmentComplete ? (
            <View style={styles.keptRow}><Feather name="zap" size={18} color={colors.gold} /><Text style={styles.keptText}>{accountability?.streak || 1} day accountability streak</Text></View>
          ) : commitment ? (
            <View style={styles.commitmentActions}>
              <TouchableOpacity onPress={openCommitment} style={styles.heroCta} accessibilityRole="button"><Text style={styles.heroCtaText}>Do it now</Text><Feather name="arrow-right" size={19} color={colors.onPrimary} /></TouchableOpacity>
              <TouchableOpacity onPress={completeCommitment} style={styles.markDoneButton} accessibilityRole="button" disabled={savingCommitment}>
                {savingCommitment ? <ActivityIndicator size="small" color={colors.gold} /> : <><Feather name="check" size={17} color={colors.gold} /><Text style={styles.markDoneText}>Mark as done</Text></>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={commitForToday} style={styles.heroCta} accessibilityRole="button" disabled={savingCommitment}>
              {savingCommitment ? <ActivityIndicator color={colors.onPrimary} /> : <><Text style={styles.heroCtaText}>Commit for today</Text><Feather name="shield" size={19} color={colors.onPrimary} /></>}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.reasonCard}>
          <View style={styles.reasonIcon}>
            <Feather name="zap" size={17} color={colors.goldMuted} />
          </View>
          <View style={styles.reasonCopy}>
            <Text style={styles.reasonTitle}>{commitment ? 'Your accountability rule' : 'Why this commitment'}</Text>
            <Text style={styles.reasonText}>{commitment ? 'Keep the promise small and specific. Completing it today extends your accountability streak.' : targetReason(snapshot)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.snapshotGrid}>
            <SnapshotStat icon="shield" label="Promises kept" value={`${accountability?.keptCount || 0} total`} />
            <SnapshotStat icon="zap" label="Accountability" value={`${accountability?.streak || 0} day streak`} />
            <SnapshotStat
              icon="check-circle"
              label="Plan progress"
              value={planDays.length ? `${completedDays} of ${planDays.length} days` : 'Plan loading'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          <View style={styles.quickList}>
            {quickActions.map((action) => (
              <QuickAction key={action.kind} icon={action.icon} title={action.title} body={action.body} onPress={action.onPress} />
            ))}
          </View>
        </View>
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
};

function AccountabilityBaeCard({ data, busy, friendCode, onFriendCodeChange, onStart, onJoinFriend, onShareFriendCode, onSubmitProof, onLeave }: AccountabilityBaeCardProps) {
  if (!data) {
    return <View style={styles.baeCard}><View style={styles.baeLoading}><Feather name="wifi-off" size={22} color={colors.inkMuted} /><Text style={styles.baeMuted}>Accountability Bae is unavailable. Pull down to retry.</Text></View></View>;
  }

  const header = (
    <View style={styles.baeHeader}>
      <View style={styles.baeBrandIcon}><MaterialCommunityIcon name="account-heart-outline" size={23} color={colors.gold} /></View>
      <View style={styles.baeHeaderCopy}>
        <Text style={styles.baeEyebrow}>Daily partner challenge</Text>
        <Text style={styles.baeTitle}>Accountability Bae</Text>
      </View>
      {data.status === 'matched' ? <View style={styles.baeLivePill}><View style={styles.baeLiveDot} /><Text style={styles.baeLiveText}>Matched</Text></View> : null}
    </View>
  );

  if (data.status === 'inactive') {
    return (
      <View style={styles.baeCard}>
        {header}
        <Text style={styles.baeIntro}>Get one shared challenge each day. You both submit photo proof before midnight.</Text>
        <Text style={styles.baePrompt}>Who should we match you with?</Text>
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
      <View style={styles.baeCard}>
        {header}
        <View style={styles.baeWaitingHero}>
          <View style={styles.baeWaitingIcon}>{busy ? <ActivityIndicator color={colors.gold} /> : <MaterialCommunityIcon name={friendMode ? 'account-multiple-plus-outline' : 'radar'} size={28} color={colors.gold} />}</View>
          <Text style={styles.baeWaitingTitle}>{friendMode ? 'Connect with a friend' : `Finding a ${data.preference} partner`}</Text>
          <Text style={styles.baeMuted}>{friendMode ? 'Share your code, or enter the code your friend sent you.' : 'We will connect you when a compatible person is available.'}</Text>
        </View>
        {friendMode ? (
          <>
            <View style={styles.friendInviteBox}>
              <View><Text style={styles.friendCodeLabel}>YOUR FRIEND CODE</Text><Text style={styles.friendCodeValue}>{data.inviteCode}</Text></View>
              <TouchableOpacity style={styles.friendShareButton} onPress={onShareFriendCode} accessibilityRole="button"><Feather name="share-2" size={17} color={colors.onPrimary} /><Text style={styles.friendShareText}>Share</Text></TouchableOpacity>
            </View>
            <View style={styles.friendJoinRow}>
              <TextInput
                value={friendCode}
                onChangeText={(value) => onFriendCodeChange(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="FRIEND CODE"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                style={styles.friendCodeInput}
                accessibilityLabel="Friend code"
              />
              <TouchableOpacity style={[styles.friendJoinButton, (!friendCode.trim() || busy) && styles.baeDisabled]} onPress={onJoinFriend} disabled={!friendCode.trim() || busy} accessibilityRole="button"><Text style={styles.friendJoinText}>Join</Text></TouchableOpacity>
            </View>
          </>
        ) : null}
        <TouchableOpacity onPress={onLeave} style={styles.baeTextButton} accessibilityRole="button" disabled={busy}><Text style={styles.baeTextButtonLabel}>Cancel matching</Text></TouchableOpacity>
      </View>
    );
  }

  const challenge = data.challenge;
  const partnerName = data.partner?.displayName || 'Your partner';
  return (
    <View style={styles.baeCard}>
      {header}
      <View style={styles.baePartnerRow}>
        <View style={styles.baePartnerAvatar}><Text style={styles.baePartnerInitial}>{partnerName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.baePartnerCopy}><Text style={styles.baePartnerLabel}>YOUR ACCOUNTABILITY BAE</Text><Text style={styles.baePartnerName}>{partnerName}</Text></View>
        <TouchableOpacity onPress={onLeave} style={styles.baeMoreButton} accessibilityRole="button" accessibilityLabel="Leave Accountability Bae match"><Feather name="more-horizontal" size={20} color={colors.inkMuted} /></TouchableOpacity>
      </View>
      {challenge ? (
        <View style={styles.baeChallenge}>
          <View style={styles.baeChallengeIcon}><MaterialCommunityIcon name={challenge.icon} size={27} color={colors.gold} /></View>
          <View style={styles.baeChallengeCopy}>
            <Text style={styles.baeChallengeKicker}>TODAY’S CHALLENGE</Text>
            <Text style={styles.baeChallengeTitle}>{challenge.title}</Text>
            <Text style={styles.baeChallengePrompt}>{challenge.prompt}</Text>
          </View>
          <Text style={styles.baeDue}>{challenge.dueLabel}</Text>
        </View>
      ) : null}
      <View style={styles.proofGrid}>
        <ProofTile label="You" submitted={Boolean(data.youSubmitted)} imageUrl={data.yourProofUrl} locked={false} />
        <ProofTile label={partnerName} submitted={Boolean(data.partnerSubmitted)} imageUrl={data.partnerProofUrl} locked={Boolean(data.partnerSubmitted && !data.bothSubmitted)} />
      </View>
      {data.bothSubmitted ? (
        <View style={styles.baeCompleteBanner}><View style={styles.baeCompleteIcon}><Feather name="check" size={18} color={colors.onPrimary} /></View><View style={styles.baeCompleteCopy}><Text style={styles.baeCompleteTitle}>Challenge complete</Text><Text style={styles.baeCompleteText}>You both showed up today.</Text></View></View>
      ) : (
        <TouchableOpacity style={[styles.baeProofButton, busy && styles.baeDisabled]} onPress={onSubmitProof} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <><Feather name="camera" size={19} color={colors.onPrimary} /><Text style={styles.baeProofButtonText}>{data.youSubmitted ? 'Replace my proof' : 'Submit my proof'}</Text></>}
        </TouchableOpacity>
      )}
      <View style={styles.baeSafety}><Feather name="eye-off" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>Your partner’s photo unlocks only after you both submit.</Text></View>
    </View>
  );
}

function BaePreference({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <TouchableOpacity style={[styles.baePreference, disabled && styles.baeDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Match with a ${label.toLowerCase()} accountability partner`}>
      <MaterialCommunityIcon name={icon} size={24} color={colors.gold} />
      <Text style={styles.baePreferenceText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProofTile({ label, submitted, imageUrl, locked }: { label: string; submitted: boolean; imageUrl?: string; locked: boolean }) {
  const source = accountabilityBaeProofSource(imageUrl);
  return (
    <View style={styles.proofTile}>
      <View style={styles.proofImageWrap}>
        {source && !locked ? <Image source={source} style={styles.proofImage} resizeMode="cover" /> : <View style={styles.proofPlaceholder}><Feather name={locked ? 'lock' : submitted ? 'check' : 'camera'} size={23} color={submitted ? colors.success : colors.inkSubtle} /></View>}
        <View style={[styles.proofStatusDot, submitted && styles.proofStatusDotDone]} />
      </View>
      <Text style={styles.proofLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.proofStatus, submitted && styles.proofStatusDone]}>{locked ? 'Unlocks together' : submitted ? 'Submitted' : 'Waiting'}</Text>
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

function SnapshotStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.snapshotCard}>
      <Feather name={icon} size={18} color={colors.inkMuted} />
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      style={styles.quickAction}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={styles.quickIcon}>
        <Feather name={icon} size={19} color={colors.ink} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={styles.quickBody}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
    </TouchableOpacity>
  );
}

function targetTitle(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return workoutTitle(target.day);
  if (target.kind === 'diet') return `Log ${target.mealType.toLowerCase()}`;
  if (target.kind === 'refresh') return 'Build your next plan';
  return 'Review progress';
}

function targetMeta(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return `Day ${target.day?.dayNumber || '-'} · ${target.day?.exercises?.length || 0} exercises`;
  if (target.kind === 'diet') return 'Capture what you ate while the details are still fresh.';
  if (target.kind === 'refresh') return 'Use your latest check-in to shape the next two weeks.';
  return 'See your consistency, streaks, and body trends in one place.';
}

function targetReason(snapshot: ContextualSnapshot) {
  const target = snapshot.target;
  if (target.kind === 'workout') return 'This is the next incomplete session in your plan.';
  if (target.kind === 'diet') return `${target.mealType} is the current meal and has not been logged.`;
  if (target.kind === 'refresh') return 'Your current training block is ready for its next check-in.';
  return 'Nothing is overdue. Review your current training trend.';
}

const styles = StyleSheet.create({
  scroll: {},
  header: { marginTop: spacing.sm },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  title: { ...typography.hero, color: colors.ink, marginTop: spacing.xs },
  subtitle: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs, maxWidth: 320 },
  baeCard: { borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.accentSurface, padding: spacing.lg, marginTop: spacing.lg, ...shadows.card },
  baeLoading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  baeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  baeBrandIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  baeHeaderCopy: { flex: 1, minWidth: 0 },
  baeEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  baeTitle: { ...typography.subtitle, color: colors.ink, marginTop: 1 },
  baeLivePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 6 },
  baeLiveDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.success },
  baeLiveText: { fontSize: 10, lineHeight: 12, color: colors.success, fontWeight: '900' },
  baeIntro: { ...typography.body, color: colors.inkMuted, lineHeight: 21, marginTop: spacing.md },
  baePrompt: { ...typography.bodyBold, color: colors.ink, marginTop: spacing.lg },
  baePreferenceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  baePreference: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted },
  baePreferenceText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  baeSafety: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  baeSafetyText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  baeMuted: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, textAlign: 'center' },
  baeWaitingHero: { alignItems: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.md },
  baeWaitingIcon: { width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  baeWaitingTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'center', marginTop: spacing.sm },
  friendInviteBox: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  friendCodeLabel: { ...typography.overline, color: colors.inkMuted },
  friendCodeValue: { fontSize: 22, lineHeight: 27, color: colors.ink, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  friendShareButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, backgroundColor: colors.primaryAction, paddingHorizontal: 13 },
  friendShareText: { ...typography.caption, color: colors.onPrimary, fontWeight: '900' },
  friendJoinRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  friendCodeInput: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', paddingHorizontal: spacing.sm },
  friendJoinButton: { minWidth: 76, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primaryAction },
  friendJoinText: { ...typography.bodyBold, color: colors.onPrimary },
  baeTextButton: { alignSelf: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm },
  baeTextButtonLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '800' },
  baeDisabled: { opacity: 0.45 },
  baePartnerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  baePartnerAvatar: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.borderStrong },
  baePartnerInitial: { ...typography.subtitle, color: colors.ink, fontWeight: '900' },
  baePartnerCopy: { flex: 1, minWidth: 0 },
  baePartnerLabel: { ...typography.overline, color: colors.inkMuted },
  baePartnerName: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  baeMoreButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  baeChallenge: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, padding: spacing.md, marginTop: spacing.md },
  baeChallengeIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, marginBottom: spacing.sm },
  baeChallengeCopy: {},
  baeChallengeKicker: { ...typography.overline, color: colors.gold },
  baeChallengeTitle: { fontSize: 20, lineHeight: 25, color: colors.ink, fontWeight: '900', marginTop: 2 },
  baeChallengePrompt: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  baeDue: { ...typography.caption, color: colors.gold, fontWeight: '800', marginTop: spacing.sm },
  proofGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  proofTile: { flex: 1, minWidth: 0 },
  proofImageWrap: { width: '100%', aspectRatio: 1.25, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  proofImage: { width: '100%', height: '100%' },
  proofPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  proofStatusDot: { position: 'absolute', right: 8, top: 8, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.inkSubtle, borderWidth: 2, borderColor: colors.panel },
  proofStatusDotDone: { backgroundColor: colors.success },
  proofLabel: { ...typography.caption, color: colors.ink, fontWeight: '900', marginTop: spacing.xs },
  proofStatus: { fontSize: 10, lineHeight: 13, color: colors.inkSubtle, fontWeight: '700', marginTop: 1 },
  proofStatusDone: { color: colors.success },
  baeProofButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryAction, marginTop: spacing.md },
  baeProofButtonText: { ...typography.button, color: colors.onPrimary },
  baeCompleteBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successLight, paddingHorizontal: spacing.md, marginTop: spacing.md },
  baeCompleteIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  baeCompleteCopy: { flex: 1 },
  baeCompleteTitle: { ...typography.bodyBold, color: colors.ink },
  baeCompleteText: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  hero: {
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  heroComplete: { borderColor: colors.accentSurface, backgroundColor: colors.panelWarm },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedPill: {
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendedDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  recommendedDotComplete: { backgroundColor: colors.success },
  recommendedText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  heroLabel: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase', marginTop: spacing.lg },
  heroTitle: { ...typography.hero, color: colors.inkStrong, marginTop: spacing.xs },
  heroMeta: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 22 },
  heroCta: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryAction,
    borderWidth: 1,
    borderColor: colors.primaryAction,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  heroCtaText: { ...typography.button, color: colors.onPrimary },
  commitmentActions: { gap: spacing.sm },
  markDoneButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  markDoneText: { ...typography.bodyBold, color: colors.gold },
  keptRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.accentSurface, marginTop: spacing.lg },
  keptText: { ...typography.bodyBold, color: colors.ink },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.goldMuted,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  reasonIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonCopy: { flex: 1 },
  reasonTitle: { ...typography.bodyBold, color: colors.ink },
  reasonText: { ...typography.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 18 },
  section: { marginTop: spacing.xl },
  sectionTitle: { ...typography.bodyBold, color: colors.ink, marginBottom: spacing.sm },
  snapshotGrid: { flexDirection: 'row', gap: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  snapshotCard: {
    flex: 1,
    minHeight: 112,
    padding: spacing.md,
  },
  snapshotLabel: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
  snapshotValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  quickList: {},
  quickAction: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quickIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCopy: { flex: 1 },
  quickTitle: { ...typography.bodyBold, color: colors.ink },
  quickBody: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
