import { useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Card, ScreenContainer, SectionTitle } from '../../components/Card';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import type { ProgressStackParamList } from '../../navigation/types';
import {
  loadProgressBundleCached,
  loadTrophyLeaderboardCached,
  peekProgressBundleCached,
  peekTrophyLeaderboardCached,
} from '../../services/preloadService';
import { acceptTrophyInvite, fetchTrophyInvite } from '../../services/progressService';
import { useAuthStore } from '../../store/authStore';
import type { ProgressSummary, TrophyLeaderboard } from '../../types/api';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProgressStackParamList, 'TrophyDetails'>;

function leaderboardDisplayName(value?: string | null) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  const digits = name.replace(/\D/g, '');
  const phoneCharactersOnly = /^[\s+().\-*xX•\d]+$/.test(name);
  const maskedPhone = digits.length > 0 && /[*xX•]{2,}/.test(name);
  if (!name || name.includes('@') || (digits.length >= 4 && phoneCharactersOnly) || maskedPhone) return 'Member';
  return name;
}

type TrophyScreenData = {
  progress: ProgressSummary;
  leaderboard: TrophyLeaderboard;
  leaderboardAvailable: boolean;
  leaderboardError: string;
};

function buildTrophyScreenData(
  progress: ProgressSummary,
  leaderboard: TrophyLeaderboard | null,
  preferredName: string,
  leaderboardError = '',
): TrophyScreenData {
  const score = progress.trophies?.score ?? 0;
  if (!leaderboard) {
    return {
      progress,
      leaderboard: {
        leaders: [{ rank: 1, displayName: preferredName, score, isCurrentUser: true }],
        currentUser: { rank: 1, displayName: preferredName, score, isCurrentUser: true },
        participantCount: 1,
      },
      leaderboardAvailable: false,
      leaderboardError,
    };
  }
  return {
    progress,
    leaderboard: {
      ...leaderboard,
      leaders: leaderboard.leaders.map((row) => ({
        ...row,
        displayName:
          row.isCurrentUser && preferredName !== 'Member'
            ? preferredName
            : leaderboardDisplayName(row.displayName),
      })),
      currentUser: leaderboard.currentUser
        ? {
            ...leaderboard.currentUser,
            displayName:
              leaderboard.currentUser.isCurrentUser && preferredName !== 'Member'
                ? preferredName
                : leaderboardDisplayName(leaderboard.currentUser.displayName),
          }
        : leaderboard.currentUser,
    },
    leaderboardAvailable: true,
    leaderboardError: '',
  };
}

export function TrophyDetailsScreen({ navigation }: Props) {
  const { user, status } = useAuthStore();
  const currentUserName = leaderboardDisplayName(user?.name || status?.name);
  const [infoOpen, setInfoOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [sharing, setSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const warmBundle = peekProgressBundleCached();
  const warmLeaderboard = peekTrophyLeaderboardCached();
  const warmName = leaderboardDisplayName(
    currentUserName !== 'Member' ? currentUserName : warmBundle?.userName,
  );
  const initialData = warmBundle
    ? buildTrophyScreenData(warmBundle.progress, warmLeaderboard, warmName, 'Updating leaderboard…')
    : null;
  const { data, loading, error, reload, refresh, refreshing } = useAsync<TrophyScreenData>(async (mode) => {
    // Start both independent requests together. Previously the leaderboard
    // waited for a forced progress refresh, doubling the visible wait.
    const force = mode === 'refresh';
    const [bundleResult, leaderboardResult] = await Promise.allSettled([
      loadProgressBundleCached({ force }),
      loadTrophyLeaderboardCached({ force }),
    ] as const);
    if (bundleResult.status === 'rejected') throw bundleResult.reason;
    const bundle = bundleResult.value;
    const preferredName = leaderboardDisplayName(
      currentUserName !== 'Member' ? currentUserName : bundle.userName,
    );
    const leaderboard = leaderboardResult.status === 'fulfilled' ? leaderboardResult.value : null;
    const leaderboardError = leaderboardResult.status === 'rejected'
      ? leaderboardResult.reason instanceof Error
        ? leaderboardResult.reason.message
        : 'Could not load leaderboard.'
      : '';
    return buildTrophyScreenData(bundle.progress, leaderboard, preferredName, leaderboardError);
  }, [], { initialData });

  const shareInvite = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const invite = await fetchTrophyInvite();
      await Share.share({
        title: 'Join my FormBae Leaderboard',
        message: `I’m building my workout streak on FormBae — join my Leaderboard and let’s keep each other consistent. 🏆\n\nTrack your workouts, earn trophies, and turn showing up into a friendly challenge.\n\nYour invite code: ${invite.code}\n${invite.shareUrl}`,
      });
    } catch (shareError) {
      Alert.alert('Could not share invite', shareError instanceof Error ? shareError.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const joinLeaderboard = async () => {
    const code = inviteCode.trim();
    if (!code || joining) return;
    setJoining(true);
    try {
      await acceptTrophyInvite(code);
      setJoinOpen(false);
      setInviteCode('');
      await refresh();
      Alert.alert('You’re connected', 'Your friend connection has been saved.');
    } catch (joinError) {
      Alert.alert('Could not join', joinError instanceof Error ? joinError.message : 'Check the code and try again.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <ScreenContainer withBottomInset><TrophyHeader onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProgressMain')} /><LoadingState message="Loading trophies..." /></ScreenContainer>;
  }
  if (error || !data?.progress.trophies) {
    return <ScreenContainer withBottomInset><TrophyHeader onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProgressMain')} /><ErrorState message={error || 'Trophy details are unavailable.'} onRetry={reload} /></ScreenContainer>;
  }

  const trophy = data.progress.trophies;
  const leaders = data.leaderboard.leaders;
  const participantCount = data.leaderboard.participantCount;
  const currentOutsideTop = data.leaderboard.currentUser && !leaders.some((row) => row.isCurrentUser) ? data.leaderboard.currentUser : null;
  const safeZoneBand = Math.max(1, trophy.nextMilestone - trophy.safeZone);
  const safeZoneProgress = Math.max(0, Math.min(1, (trophy.score - trophy.safeZone) / safeZoneBand));

  return (
    <ScreenContainer withBottomInset>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
        contentContainerStyle={styles.scroll}
      >
        <TrophyHeader onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProgressMain')} onInfo={() => setInfoOpen(true)} score={trophy.score} />

        <View style={styles.leaderboardHead}>
          <View>
            <SectionTitle style={styles.leaderboardTitle}>Your friends</SectionTitle>
            <Text style={styles.participants}>{participantCount} {participantCount === 1 ? 'member' : 'members'}</Text>
          </View>
        </View>
        <Card style={styles.leaderboardCard}>
          {leaders.length ? leaders.map((row) => <LeaderboardRow key={`${row.rank}-${row.displayName}`} {...row} />) : <Text style={styles.emptyText}>Invite friends to start your leaderboard.</Text>}
          {currentOutsideTop ? <><View style={styles.ellipsis}><Text style={styles.ellipsisText}>•••</Text></View><LeaderboardRow {...currentOutsideTop} /></> : null}
        </Card>
        {!data.leaderboardAvailable ? (
          <TouchableOpacity style={styles.serviceNotice} onPress={refresh} accessibilityRole="button" accessibilityLabel="Retry leaderboard">
            <Feather name="refresh-cw" size={14} color={colors.gold} />
            <Text style={styles.serviceNoticeText}>{data.leaderboardError || 'Could not load leaderboard.'} Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <View style={styles.bottomDock}>
        <TouchableOpacity style={styles.joinCodeButton} onPress={() => setJoinOpen(true)} accessibilityRole="button" accessibilityLabel="Join leaderboard with a code">
          <Feather name="link" size={17} color={colors.ink} />
          <Text style={styles.joinCodeButtonText}>Join with code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inviteButton} onPress={shareInvite} disabled={sharing} accessibilityRole="button" accessibilityLabel="Invite friends">
          <Feather name="user-plus" size={17} color={colors.onPrimary} />
          <Text style={styles.inviteButtonText}>{sharing ? 'Opening…' : 'Invite friends'}</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={infoOpen} transparent animationType="slide" onRequestClose={() => setInfoOpen(false)}>
        <View style={styles.infoModalBackdrop}>
          <ScrollView style={styles.infoModalCard} contentContainerStyle={styles.infoModalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <View style={styles.infoModalHead}>
              <View style={styles.infoModalTitleRow}>
                <View style={styles.infoModalTitleIcon}><MaterialCommunityIcon name="trophy-outline" size={21} color={colors.gold} /></View>
                <Text style={styles.modalTitle}>How trophies work</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setInfoOpen(false)} accessibilityRole="button" accessibilityLabel="Close trophy information">
                <Feather name="x" size={21} color={colors.ink} />
              </TouchableOpacity>
            </View>
            <View style={styles.infoScoreRow}>
              <View style={styles.infoScoreMedallion}><MaterialCommunityIcon name="trophy" size={30} color={colors.gold} /></View>
              <View style={styles.infoScoreCopy}><Text style={styles.infoScoreLabel}>YOUR SCORE</Text><Text style={styles.infoScoreValue}>{trophy.score}<Text style={styles.infoScoreUnit}> trophies</Text></Text></View>
              <View style={styles.infoSafeZone}><MaterialCommunityIcon name="shield-check" size={18} color={colors.success} /><Text style={styles.infoSafeZoneText}>Safe zone {trophy.safeZone}</Text></View>
            </View>
            <View style={styles.rulesGrid}>
              <TrophyRule
                icon="dumbbell"
                title="1 workout completed"
                value="+5"
              />
              <TrophyRule
                icon="notebook-edit-outline"
                title="3 food logs"
                value="+2"
              />
              <TrophyRule
                icon="calendar-check-outline"
                title="Missed workout"
                value="−2"
              />
              <TrophyRule
                icon="notebook-remove-outline"
                title="3 missed food logs"
                value="−1"
              />
              <TrophyRule
                icon="fire"
                title="Streak"
                value="Bonus"
                wide
              />
            </View>
            <View style={styles.safeZoneCard}>
              <View style={styles.safeZoneRule}><MaterialCommunityIcon name="shield-check-outline" size={21} color={colors.success} /><Text style={styles.safeZoneRuleText}>Safe zone every 25 trophies</Text></View>
              <View style={styles.safeZoneTrack}><View style={[styles.safeZoneTrackFill, { width: `${safeZoneProgress * 100}%` }]} /></View>
              <Text style={styles.nextSafeZoneText}>{trophy.pointsToNext} to next safe zone</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Feather name="users" size={23} color={colors.gold} /></View>
            <Text style={styles.modalTitle}>Join a leaderboard</Text>
            <Text style={styles.modalCopy}>Enter the invite code they shared with you.</Text>
            <TextInput
              value={inviteCode}
              onChangeText={(value) => setInviteCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="INVITE CODE"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              style={styles.codeInput}
              accessibilityLabel="Invite code"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setJoinOpen(false)} disabled={joining}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.joinButton, (!inviteCode.trim() || joining) && styles.buttonDisabled]} onPress={joinLeaderboard} disabled={!inviteCode.trim() || joining}><Text style={styles.joinButtonText}>{joining ? 'Joining…' : 'Join'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function TrophyHeader({ onBack, onInfo, score }: { onBack: () => void; onInfo?: () => void; score?: number }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to progress">
        <Feather name="chevron-left" size={24} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>Rewards</Text><Text style={styles.title}>Leaderboard</Text></View>
      {onInfo ? <TouchableOpacity style={styles.headerInfoButton} onPress={onInfo} accessibilityRole="button" accessibilityLabel="How trophies work"><MaterialCommunityIcon name="information-outline" size={20} color={colors.gold} /><Text style={styles.headerInfoText}>Info</Text></TouchableOpacity> : null}
      {score !== undefined ? <View style={styles.headerTrophies} accessibilityLabel={`${score} trophies`}><MaterialCommunityIcon name="trophy" size={29} color={colors.gold} /><Text style={styles.headerTrophyValue}>{score}</Text></View> : null}
    </View>
  );
}

function TrophyRule({ icon, title, value, wide = false }: { icon: string; title: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.trophyRule, wide && styles.trophyRuleWide]}>
      <View style={styles.trophyRuleIcon}><MaterialCommunityIcon name={icon} size={22} color={colors.gold} /></View>
      <View style={styles.trophyRuleValueRow}>
        <Text style={styles.trophyRuleValue}>{value}</Text>
        <MaterialCommunityIcon name="trophy" size={16} color={colors.gold} />
      </View>
      <Text style={styles.trophyRuleTitle}>{title}</Text>
    </View>
  );
}

function LeaderboardRow({ rank, displayName, score, isCurrentUser }: { rank: number; displayName: string; score: number; isCurrentUser: boolean }) {
  const name = leaderboardDisplayName(displayName);
  const medalColor = rank === 1 ? colors.gold : rank === 2 ? '#b9bec8' : '#bf865b';
  return (
    <View style={[styles.leaderRow, isCurrentUser && styles.leaderRowCurrent]}>
      <View style={styles.rankSlot}>{rank <= 3 ? <MaterialCommunityIcon name="medal" size={21} color={medalColor} /> : <Text style={styles.rankText}>{rank}</Text>}</View>
      <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
      <Text style={[styles.leaderName, isCurrentUser && styles.leaderNameCurrent]} numberOfLines={1}>{name}</Text>
      <MaterialCommunityIcon name="trophy" size={16} color={colors.gold} />
      <Text style={styles.leaderScore}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  eyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  title: { ...typography.title, color: colors.ink, marginTop: 2 },
  headerInfoButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.goldMuted },
  headerInfoText: { ...typography.caption, color: colors.gold, fontWeight: '900' },
  headerTrophies: { minWidth: 72, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: spacing.md },
  headerTrophyValue: { fontSize: 24, lineHeight: 29, color: colors.ink, fontWeight: '900' },
  leaderboardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  leaderboardTitle: { marginTop: 0, marginBottom: 0 },
  participants: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  inviteButton: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primaryAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  inviteButtonText: { ...typography.caption, color: colors.onPrimary, fontWeight: '900' },
  leaderboardCard: { padding: 0, overflow: 'hidden', backgroundColor: colors.panel, borderColor: colors.border },
  leaderRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  leaderRowCurrent: { backgroundColor: colors.accentLight },
  rankSlot: { width: 28, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 15, color: colors.inkMuted, fontWeight: '800' },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised },
  avatarText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  leaderName: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  leaderNameCurrent: { color: colors.gold },
  leaderScore: { ...typography.bodyBold, color: colors.ink, minWidth: 30, textAlign: 'right' },
  ellipsis: { height: 28, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  ellipsisText: { color: colors.inkSubtle, letterSpacing: 3 },
  emptyText: { ...typography.body, color: colors.inkMuted, padding: spacing.lg, textAlign: 'center' },
  serviceNotice: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentLight },
  serviceNoticeText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  bottomDock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.panel, padding: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs },
  joinCodeButton: { flex: 1, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  joinCodeButtonText: { ...typography.caption, color: colors.ink, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  modalCard: { borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  infoModalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', paddingHorizontal: spacing.sm },
  infoModalCard: { maxHeight: '92%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong, ...shadows.lg },
  infoModalContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginBottom: spacing.xs },
  infoModalHead: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  infoModalTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoModalTitleIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  modalClose: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  infoScoreRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentSurface, backgroundColor: colors.panelWarm, padding: spacing.md },
  infoScoreMedallion: { width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentSurface },
  infoScoreCopy: { flex: 1, minWidth: 0 },
  infoScoreValue: { fontSize: 32, lineHeight: 37, color: colors.ink, fontWeight: '900', letterSpacing: -0.5 },
  infoScoreUnit: { fontSize: 12, lineHeight: 16, color: colors.inkMuted, fontWeight: '700', letterSpacing: 0 },
  infoScoreLabel: { ...typography.overline, color: colors.gold, fontWeight: '800' },
  infoSafeZone: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.successLight, paddingHorizontal: 9, paddingVertical: 7 },
  infoSafeZoneText: { fontSize: 10, lineHeight: 13, color: colors.success, fontWeight: '900' },
  rulesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trophyRule: { width: '47.5%', minHeight: 132, flexGrow: 1, alignItems: 'flex-start', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelMuted, padding: spacing.md },
  trophyRuleWide: { width: '100%', minHeight: 112 },
  trophyRuleIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  trophyRuleValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto' },
  trophyRuleValue: { fontSize: 23, lineHeight: 28, color: colors.ink, fontWeight: '900' },
  trophyRuleTitle: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', marginTop: 2 },
  safeZoneCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(131,214,164,0.28)', backgroundColor: colors.successLight, padding: spacing.md },
  safeZoneRule: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  safeZoneRuleText: { ...typography.bodyBold, color: colors.ink, flex: 1 },
  safeZoneTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.panelRaised, overflow: 'hidden', marginTop: spacing.md },
  safeZoneTrackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.success },
  nextSafeZoneText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', marginTop: spacing.sm },
  modalIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, marginBottom: spacing.md },
  modalTitle: { ...typography.title, color: colors.ink },
  modalCopy: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  codeInput: { height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 3, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { ...typography.bodyBold, color: colors.inkMuted },
  joinButton: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primaryAction, alignItems: 'center', justifyContent: 'center' },
  joinButtonText: { ...typography.bodyBold, color: colors.onPrimary },
  buttonDisabled: { opacity: 0.45 },
});
