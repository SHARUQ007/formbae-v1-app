import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Card, ScreenContainer, SectionTitle } from '../../components/Card';
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
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
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
      title: 'Be my FormBae accountability partner',
      message: `Want to keep each other consistent on FormBae? We’ll get one daily challenge, check in privately, and unlock each other’s proof only after we both show up.\n\nUse my partner code: ${code}`,
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
        <View style={styles.headerMeta}>
          <Text style={styles.kicker}>{dateLabel}</Text>
          <Badge label={`${accountability?.streak || 0} day streak`} tone="gold" icon="zap" />
        </View>
        <Text style={styles.pageTitle}>Accountability</Text>
        <Text style={styles.pageSubtitle}>A clear promise for today. A stronger pattern for tomorrow.</Text>

        <View style={styles.personalSectionHead}>
          <SectionTitle style={styles.inlineSectionTitle}>Today’s promise</SectionTitle>
          <Badge label={commitmentComplete ? 'Complete' : commitment ? 'In progress' : 'Not started'} tone={commitmentComplete ? 'goldSolid' : commitment ? 'gold' : 'neutral'} icon={commitmentComplete ? 'check' : commitment ? 'clock' : 'circle'} />
        </View>

        <View style={[styles.promiseCard, commitmentComplete && styles.promiseCardComplete]}>
          <LinearGradient
            colors={['rgba(240,206,120,0.15)', 'rgba(17,18,23,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.promiseTopRow}>
            <View style={[styles.heroIcon, commitmentComplete && styles.heroIconComplete]}>
              <Feather name={commitmentComplete ? 'check' : commitment ? 'shield' : snapshot.target.icon} size={21} color={commitmentComplete ? colors.onPrimary : colors.gold} />
            </View>
            <View style={styles.promiseLabelWrap}>
              <Text style={styles.promiseEyebrow}>{commitmentComplete ? 'PROMISE KEPT' : commitment ? 'COMMITTED FOR TODAY' : 'YOUR NEXT MOVE'}</Text>
              <Text style={styles.promiseTiming}>{commitmentComplete ? 'Momentum secured' : 'One meaningful action'}</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{commitment?.title || targetTitle(snapshot)}</Text>
          <Text style={styles.heroMeta}>{commitmentComplete ? 'You followed through. That is how consistency gets built.' : commitment ? 'Your reminder is set. Do it now or mark it complete when you finish.' : targetMeta(snapshot)}</Text>
          {commitmentComplete ? (
            <View style={styles.keptRow}><Feather name="zap" size={18} color={colors.gold} /><Text style={styles.keptText}>{accountability?.streak || 1} day accountability streak</Text></View>
          ) : commitment ? (
            <View style={styles.commitmentActions}>
              <PrimaryButton title="Do it now" icon="arrow-right" onPress={openCommitment} />
              <PrimaryButton title="Mark as done" icon="check" variant="secondary" onPress={completeCommitment} loading={savingCommitment} />
            </View>
          ) : (
            <PrimaryButton title="Commit for today" icon="shield" onPress={commitForToday} loading={savingCommitment} style={styles.heroCta} />
          )}
        </View>

        <SectionTitle>Show up together</SectionTitle>

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

        <SectionTitle>Your consistency</SectionTitle>
        <Card variant="flat" style={styles.consistencyCard}>
          <ConsistencyMetric icon="zap" label="Day streak" value={`${accountability?.streak || 0}`} />
          <View style={styles.metricDivider} />
          <ConsistencyMetric icon="shield" label="Promises kept" value={`${accountability?.keptCount || 0}`} />
          <View style={styles.metricDivider} />
          <ConsistencyMetric icon="check-circle" label="Plan complete" value={planDays.length ? `${completedDays}/${planDays.length}` : '—'} />
        </Card>

        <SectionTitle>Keep moving</SectionTitle>
        <Card variant="flat" style={styles.quickList}>
          {quickActions.map((action) => (
            <QuickAction key={action.kind} icon={action.icon} title={action.title} body={action.body} onPress={action.onPress} />
          ))}
        </Card>
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
    return <Card style={styles.partnerCard}><View style={styles.baeLoading}><Feather name="wifi-off" size={22} color={colors.inkMuted} /><Text style={styles.baeMuted}>Accountability Bae is unavailable. Pull down to retry.</Text></View></Card>;
  }

  const header = (
    <View style={styles.baeHeader}>
      <View style={styles.baeBrandIcon}><MaterialCommunityIcon name="account-heart-outline" size={23} color={colors.gold} /></View>
      <View style={styles.baeHeaderCopy}>
        <Text style={styles.baeEyebrow}>ACCOUNTABILITY BAE</Text>
        <Text style={styles.baeHeaderCaption}>A private daily check-in with a partner</Text>
      </View>
      {data.status === 'matched' ? <Badge label="Active" tone="gold" icon="check" /> : null}
    </View>
  );

  if (data.status === 'inactive') {
    return (
      <Card style={styles.partnerCard}>
        {header}
        <View style={styles.baeIntroHero}>
          <View style={styles.baeDuoVisual}>
            <View style={[styles.baeDuoAvatar, styles.baeDuoAvatarBack]}><MaterialCommunityIcon name="account-outline" size={25} color={colors.inkMuted} /></View>
            <View style={[styles.baeDuoAvatar, styles.baeDuoAvatarFront]}><MaterialCommunityIcon name="account" size={25} color={colors.gold} /></View>
          </View>
          <Text style={styles.baeIntroTitle}>Better together</Text>
          <Text style={styles.baeIntro}>One daily challenge. Two photo check-ins. Done by midnight.</Text>
        </View>
        <View style={styles.baeSteps}>
          <BaeStep icon="user-plus" label="Match" />
          <View style={styles.baeStepLine} />
          <BaeStep icon="target" label="Challenge" />
          <View style={styles.baeStepLine} />
          <BaeStep icon="camera" label="Proof" />
        </View>
        <Text style={styles.baePrompt}>Who should we match you with?</Text>
        <View style={styles.baePreferenceRow}>
          <BaePreference icon="gender-male" label="Male" onPress={() => onStart('male')} disabled={busy} />
          <BaePreference icon="gender-female" label="Female" onPress={() => onStart('female')} disabled={busy} />
          <BaePreference icon="account-multiple-plus-outline" label="Friend" onPress={() => onStart('friend')} disabled={busy} />
        </View>
        {busy ? <ActivityIndicator color={colors.gold} /> : null}
        <View style={styles.baeSafety}><Feather name="lock" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>First names only. No face photo required.</Text></View>
      </Card>
    );
  }

  if (data.status === 'waiting') {
    const friendMode = data.preference === 'friend';
    return (
      <Card style={styles.partnerCard}>
        {header}
        <View style={styles.baeWaitingHero}>
          <View style={styles.baeWaitingIcon}>{busy ? <ActivityIndicator color={colors.gold} /> : <MaterialCommunityIcon name={friendMode ? 'account-multiple-plus-outline' : 'radar'} size={28} color={colors.gold} />}</View>
          <Text style={styles.baeWaitingKicker}>{friendMode ? 'INVITE READY' : 'MATCHING IN PROGRESS'}</Text>
          <Text style={styles.baeWaitingTitle}>{friendMode ? 'Bring your partner in' : 'Finding the right partner'}</Text>
          <Text style={styles.baeMuted}>{friendMode ? 'Share your code. You’ll connect when your friend enters it.' : `We’re finding a compatible ${data.preference} partner. You can leave this screen.`}</Text>
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
      </Card>
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
    <Card style={styles.partnerCard}>
      {header}
      <View style={styles.baePartnerRow}>
        <View style={styles.baePartnerAvatar}><Text style={styles.baePartnerInitial}>{partnerName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.baePartnerCopy}><Text style={styles.baePartnerLabel}>YOUR PARTNER</Text><Text style={styles.baePartnerName}>{partnerName}</Text></View>
        <TouchableOpacity onPress={onLeave} style={styles.baeMoreButton} accessibilityRole="button" accessibilityLabel="Leave Accountability Bae match"><Feather name="more-horizontal" size={20} color={colors.inkMuted} /></TouchableOpacity>
      </View>
      {challenge ? (
        <Card variant="accent" style={styles.baeChallenge}>
          <View style={styles.baeChallengeTop}>
            <View style={styles.baeChallengeIcon}><MaterialCommunityIcon name={challenge.icon} size={24} color={colors.gold} /></View>
            <View style={styles.baeDuePill}><Feather name="clock" size={12} color={colors.gold} /><Text style={styles.baeDue}>{challenge.dueLabel}</Text></View>
          </View>
          <View style={styles.baeChallengeCopy}>
            <Text style={styles.baeChallengeTitle}>{challenge.title}</Text>
            <Text style={styles.baeChallengePrompt}>{challenge.prompt}</Text>
          </View>
        </Card>
      ) : null}
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
      <View style={styles.baeSafety}><Feather name="eye-off" size={14} color={colors.inkMuted} /><Text style={styles.baeSafetyText}>Photos unlock together—never one-sided.</Text></View>
    </Card>
  );
}

function ConsistencyMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}><Feather name={icon} size={15} color={colors.gold} /></View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function BaePreference({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.78} style={[styles.baePreference, disabled && styles.baeDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Match with a ${label.toLowerCase()} accountability partner`}>
      <MaterialCommunityIcon name={icon} size={24} color={colors.gold} />
      <Text style={styles.baePreferenceText}>{label}</Text>
    </TouchableOpacity>
  );
}

function BaeStep({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.baeStep}>
      <View style={styles.baeStepIcon}><Feather name={icon} size={15} color={colors.gold} /></View>
      <Text style={styles.baeStepLabel}>{label}</Text>
    </View>
  );
}

function ProofTile({ label, submitted, imageUrl, locked }: { label: string; submitted: boolean; imageUrl?: string; locked: boolean }) {
  const source = accountabilityBaeProofSource(imageUrl);
  return (
    <View style={styles.proofTile}>
      <View style={styles.proofImageWrap}>
        {source && !locked ? <Image source={source} style={styles.proofImage} resizeMode="cover" /> : <View style={styles.proofPlaceholder}><Feather name={locked ? 'lock' : submitted ? 'check' : 'camera'} size={23} color={submitted ? colors.gold : colors.inkSubtle} /></View>}
        <View style={[styles.proofStatusDot, submitted && styles.proofStatusDotDone]} />
        <View style={styles.proofMeta}>
          <Text style={styles.proofLabel} numberOfLines={1}>{label}</Text>
          <Text style={[styles.proofStatus, submitted && styles.proofStatusDone]}>{locked ? 'Unlocks together' : submitted ? 'Submitted' : 'Waiting'}</Text>
        </View>
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
        <Feather name={icon} size={18} color={colors.gold} />
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

const styles = StyleSheet.create({
  scroll: {},
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  kicker: { ...typography.overline, color: colors.inkSubtle, textTransform: 'uppercase' },
  pageTitle: { ...typography.display, color: colors.inkStrong },
  pageSubtitle: { ...typography.body, color: colors.inkMuted, maxWidth: 330, marginTop: spacing.xs, marginBottom: spacing.sm },
  personalSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.sm },
  inlineSectionTitle: { marginTop: 0, marginBottom: 0 },
  promiseCard: { position: 'relative', overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panel, padding: spacing.lg, ...shadows.card },
  promiseCardComplete: { borderColor: colors.accentSurface },
  promiseTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  promiseLabelWrap: { flex: 1 },
  promiseEyebrow: { ...typography.overline, color: colors.gold },
  promiseTiming: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  partnerCard: { borderRadius: radius.xl, padding: spacing.lg, backgroundColor: colors.panel },
  baeLoading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  baeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  baeBrandIcon: { width: 46, height: 46, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  baeHeaderCopy: { flex: 1, minWidth: 0 },
  baeEyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  baeHeaderCaption: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  baeIntroHero: { alignItems: 'center', paddingHorizontal: spacing.sm, paddingTop: spacing.lg },
  baeDuoVisual: { width: 88, height: 62, position: 'relative' },
  baeDuoAvatar: { position: 'absolute', width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.panel },
  baeDuoAvatarBack: { left: 0, top: 8, backgroundColor: colors.panelRaised },
  baeDuoAvatarFront: { right: 0, top: 0, backgroundColor: colors.accentFill, borderColor: colors.panel },
  baeIntroTitle: { fontSize: 22, lineHeight: 28, color: colors.ink, fontWeight: '900', letterSpacing: -0.3, marginTop: spacing.sm, textAlign: 'center' },
  baeIntro: { ...typography.caption, color: colors.inkMuted, lineHeight: 19, marginTop: spacing.xs, textAlign: 'center', maxWidth: 300 },
  baeSteps: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  baeStep: { alignItems: 'center', gap: 4, minWidth: 58 },
  baeStepIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accentLight },
  baeStepLabel: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '800' },
  baeStepLine: { width: 30, height: 1, backgroundColor: colors.borderStrong, marginHorizontal: spacing.xs, marginBottom: 17 },
  baePrompt: { ...typography.bodyBold, color: colors.ink, marginTop: spacing.lg },
  baePreferenceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  baePreference: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted },
  baePreferenceText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  baeSafety: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  baeSafetyText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  baeMuted: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, textAlign: 'center' },
  baeWaitingHero: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.md },
  baeWaitingIcon: { width: 68, height: 68, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  baeWaitingKicker: { ...typography.overline, color: colors.gold, textAlign: 'center', marginTop: spacing.md },
  baeWaitingTitle: { ...typography.title, color: colors.ink, textAlign: 'center', marginTop: spacing.xs },
  friendInviteBox: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  friendCodeLabel: { ...typography.overline, color: colors.inkMuted },
  friendCodeValue: { fontSize: 22, lineHeight: 27, color: colors.ink, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  friendShareButton: { minWidth: 92 },
  friendJoinLabel: { ...typography.caption, color: colors.inkMuted, fontWeight: '700', marginTop: spacing.md },
  friendJoinRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  friendCodeInput: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', paddingHorizontal: spacing.sm },
  friendJoinButton: { minWidth: 92, minHeight: 48 },
  baeTextButton: { alignSelf: 'center', marginTop: spacing.sm },
  baeDisabled: { opacity: 0.45 },
  baePartnerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  baePartnerAvatar: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill, borderWidth: 1, borderColor: colors.accentSurface },
  baePartnerInitial: { ...typography.subtitle, color: colors.ink, fontWeight: '900' },
  baePartnerCopy: { flex: 1, minWidth: 0 },
  baePartnerLabel: { ...typography.overline, color: colors.inkMuted },
  baePartnerName: { ...typography.bodyBold, color: colors.ink, marginTop: 1 },
  baeMoreButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  baeChallenge: { padding: spacing.md, marginTop: spacing.md },
  baeChallengeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  baeChallengeIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  baeDuePill: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.accentLight },
  baeChallengeCopy: {},
  baeChallengeTitle: { fontSize: 20, lineHeight: 25, color: colors.ink, fontWeight: '900' },
  baeChallengePrompt: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: 3 },
  baeDue: { fontSize: 10, lineHeight: 13, color: colors.gold, fontWeight: '800' },
  proofSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg },
  proofSectionTitle: { ...typography.bodyBold, color: colors.ink },
  proofSectionCount: { ...typography.caption, color: colors.inkMuted },
  proofProgress: { height: 4, flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  proofProgressStep: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.panelRaised },
  proofProgressStepDone: { backgroundColor: colors.gold },
  proofGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  proofTile: { flex: 1, minWidth: 0 },
  proofImageWrap: { width: '100%', aspectRatio: 1.05, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  proofImage: { width: '100%', height: '100%' },
  proofPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 38 },
  proofStatusDot: { position: 'absolute', right: 8, top: 8, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.inkSubtle, borderWidth: 2, borderColor: colors.panel },
  proofStatusDotDone: { backgroundColor: colors.gold },
  proofMeta: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 47, justifyContent: 'center', backgroundColor: 'rgba(10,10,13,0.88)', paddingHorizontal: spacing.sm },
  proofLabel: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  proofStatus: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', marginTop: 1 },
  proofStatusDone: { color: colors.gold },
  proofGuidance: { ...typography.caption, color: colors.inkMuted, lineHeight: 18, marginTop: spacing.md },
  baeProofButton: { marginTop: spacing.md },
  baeCompleteBanner: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface, paddingHorizontal: spacing.md, marginTop: spacing.md },
  baeCompleteIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  baeCompleteCopy: { flex: 1 },
  baeCompleteTitle: { ...typography.bodyBold, color: colors.ink },
  baeCompleteText: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconComplete: { backgroundColor: colors.gold, borderColor: colors.gold },
  heroTitle: { ...typography.hero, color: colors.inkStrong, marginTop: spacing.lg, maxWidth: 310 },
  heroMeta: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 22 },
  heroCta: { marginTop: spacing.lg },
  commitmentActions: { gap: spacing.sm, marginTop: spacing.lg },
  keptRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.accentSurface, marginTop: spacing.lg, paddingTop: spacing.sm },
  keptText: { ...typography.bodyBold, color: colors.ink },
  consistencyCard: { minHeight: 126, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  metricIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, marginBottom: 7 },
  metricValue: { ...typography.title, color: colors.inkStrong, textAlign: 'center' },
  metricLabel: { fontSize: 10, lineHeight: 13, color: colors.inkMuted, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  quickList: { paddingHorizontal: spacing.md, paddingVertical: 0 },
  quickAction: {
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCopy: { flex: 1 },
  quickTitle: { ...typography.bodyBold, color: colors.ink },
  quickBody: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
});
