import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AccountabilityViewArt } from '../../components/AccountabilityViewArt';
import { ScreenContainer } from '../../components/Card';
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
import { subscribeToInviteAccepted } from '../../services/trophyInviteService';
import { subscribeToTrophySummary } from '../../services/trophyRealtime';
import { useAuthStore } from '../../store/authStore';
import type { ProgressSummary, TrophyLeaderboard } from '../../types/api';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { ConnectionDetailsSheet } from '../../components/ConnectionDetailsSheet';
import { TrophyInfoSheet } from '../../components/TrophyInfoSheet';
import { TrophyIllustration } from '../../components/TrophyIllustration';
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
  if (!leaderboard) {
    return {
      progress,
      leaderboard: {
        leaders: [],
        currentUser: null,
        participantCount: 0,
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

export function TrophyDetailsScreen({ navigation, route }: Props) {
  const { user, status } = useAuthStore();
  const tabBarHeight = useBottomTabBarHeight();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const currentUserName = leaderboardDisplayName(user?.name || status?.name);
  const [infoOpen, setInfoOpen] = useState(Boolean(route.params?.openInfo));
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
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
  const { data, loading, error, reload, refresh, refreshing, setData } = useAsync<TrophyScreenData>(async (mode) => {
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

  useEffect(() => subscribeToTrophySummary((trophies) => {
    setData((current) => {
      if (!current) return current;
      const updateRow = (row: TrophyLeaderboard['leaders'][number]) => row.isCurrentUser
        ? { ...row, score: trophies.score }
        : row;
      return {
        ...current,
        progress: { ...current.progress, trophies },
        leaderboard: {
          ...current.leaderboard,
          leaders: current.leaderboard.leaders.map(updateRow),
          currentUser: current.leaderboard.currentUser
            ? updateRow(current.leaderboard.currentUser)
            : current.leaderboard.currentUser,
        },
      };
    });
  }), [setData]);

  useEffect(() => subscribeToInviteAccepted(() => { refresh().catch(() => undefined); }), [refresh]);

  const hasFocused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (hasFocused.current) { refresh().catch(() => undefined); }
    hasFocused.current = true;
  }, [refresh]));

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
  const currentUser = data.leaderboard.currentUser || leaders.find(row => row.isCurrentUser);
  const milestoneProgress = Math.max(0, Math.min(1, (trophy.score - trophy.safeZone) / Math.max(1, trophy.nextMilestone - trophy.safeZone)));
  const currentOutsideTop = data.leaderboard.currentUser && !leaders.some((row) => row.isCurrentUser) ? data.leaderboard.currentUser : null;

  const invitationActions = (
      <View style={[styles.bottomDock, compact && styles.bottomDockCompact]}>
        <TouchableOpacity style={styles.joinCodeButton} onPress={() => setJoinOpen(true)} accessibilityRole="button" accessibilityLabel="Join leaderboard with a code">
          <Feather name="link" size={17} color={colors.ink} />
          <Text style={styles.joinCodeButtonText}>Join with code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inviteButton} onPress={shareInvite} disabled={sharing} accessibilityRole="button" accessibilityLabel="Invite friends">
          <Feather name="user-plus" size={17} color={colors.onPrimary} />
          <Text style={styles.inviteButtonText}>{sharing ? 'Opening…' : 'Invite friends'}</Text>
        </TouchableOpacity>
      </View>
  );

  return (
    <ScreenContainer style={{ paddingBottom: tabBarHeight + spacing.sm }}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
        contentContainerStyle={styles.scroll}
      >
        <TrophyHeader onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProgressMain')} onInfo={() => setInfoOpen(true)} />

        <View style={styles.scoreCard}>
          <View style={styles.scoreTop}>
            <TrophyIllustration size={56} />
            <View style={styles.scoreCopy}>
              <Text style={styles.scoreLabel}>YOUR TROPHIES</Text>
              <Text style={styles.scoreValue}>{trophy.score}</Text>
            </View>
            <View style={styles.rankSummary}>
              <Text style={styles.scoreLabel}>YOUR RANK</Text>
              <Text style={styles.rankValue}>{data.leaderboardAvailable && currentUser ? `#${currentUser.rank}` : '—'}</Text>
            </View>
          </View>
          <View style={styles.milestoneHead}>
            <Text style={styles.milestoneCopy}>{trophy.pointsToNext} to your next safe zone</Text>
            <Text style={styles.milestoneValue}>{trophy.nextMilestone}</Text>
          </View>
          <View style={styles.milestoneTrack} accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(milestoneProgress * 100), text: `${trophy.pointsToNext} trophies to the next safe zone` }}>
            <View style={[styles.milestoneFill, { width: `${milestoneProgress * 100}%` }]} />
          </View>
        </View>

        <View style={styles.leaderboardHead}>
          <Text style={styles.leaderboardTitle} accessibilityRole="header">Your friends</Text>
          <Text style={styles.participants}>{data.leaderboardAvailable ? `${participantCount} ${participantCount === 1 ? 'member' : 'members'}` : 'Rankings unavailable'}</Text>
        </View>
        {data.leaderboardAvailable && leaders.length ? <View style={styles.leaderboardCard}>
          <View style={styles.columnHead}>
            <Text style={[styles.columnLabel, styles.rankColumn]}>RANK</Text>
            <Text style={[styles.columnLabel, styles.memberColumn]}>MEMBER</Text>
            <Text style={styles.columnLabel}>TROPHIES</Text>
          </View>
          {leaders.map((row) => <LeaderboardRow key={row.userId || `${row.rank}-${row.displayName}`} {...row} compact={compact} onPress={!row.isCurrentUser && row.userId ? () => setSelectedFriend(row.userId!) : undefined} />)}
          {currentOutsideTop ? <><View style={styles.ellipsis}><Text style={styles.ellipsisText}>Your position</Text></View><LeaderboardRow {...currentOutsideTop} compact={compact} /></> : null}
        </View> : null}
        {!data.leaderboardAvailable ? (
          <TouchableOpacity style={styles.serviceNotice} onPress={refresh} accessibilityRole="button" accessibilityLabel="Retry leaderboard">
            <Feather name="refresh-cw" size={14} color={colors.gold} />
            <Text style={styles.serviceNoticeText}>{data.leaderboardError || 'Could not load leaderboard.'} Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      {invitationActions}

      <TrophyInfoSheet visible={infoOpen} trophy={trophy} onClose={() => setInfoOpen(false)} />
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><AccountabilityViewArt kind="partner" size={38} /></View>
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
      <ConnectionDetailsSheet userId={selectedFriend} onClose={() => setSelectedFriend(null)} onChanged={refresh}/>
    </ScreenContainer>
  );
}

function TrophyHeader({ onBack, onInfo }: { onBack: () => void; onInfo?: () => void }) {
  return <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to progress">
      <Feather name="chevron-left" size={24} color={colors.ink} />
    </TouchableOpacity>
    <View style={styles.headerCopy}><Text style={styles.title} accessibilityRole="header">Leaderboard</Text></View>
    {onInfo ? <TouchableOpacity style={styles.headerInfoButton} onPress={onInfo} accessibilityRole="button" accessibilityLabel="How trophies work"><Feather name="info" size={20} color={colors.inkMuted} /></TouchableOpacity> : null}
  </View>;
}

function LeaderboardRow({ rank, displayName, score, isCurrentUser, compact, onPress }: { onPress?: () => void; rank: number; displayName: string; score: number; isCurrentUser: boolean; compact: boolean }) {
  const name = leaderboardDisplayName(displayName);
  const medalColor = rank === 1 ? colors.gold : rank === 2 ? '#b9bec8' : '#bf865b';
  const initials = name.split(' ').slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  return <TouchableOpacity onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={[styles.leaderRow, isCurrentUser && styles.leaderRowCurrent]} accessible
    accessibilityLabel={`Rank ${rank}. ${name}${isCurrentUser ? '. You' : ''}. ${score} trophies${onPress ? ". View friend details" : ""}`}>
    {isCurrentUser ? <View style={styles.currentAccent} /> : null}
    <View style={[styles.rankSlot, rank <= 3 && styles.topRankSlot]}>
      <Text style={[styles.rankText, rank <= 3 && { color: medalColor }]}>{rank}</Text>
    </View>
    {!compact ? <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View> : null}
    <View style={styles.leaderIdentity}>
      <Text style={styles.leaderName} numberOfLines={2}>{name}</Text>
      {isCurrentUser ? <View style={styles.youBadge}><Text style={styles.youLabel}>You</Text></View> : null}
    </View>
    <View style={styles.leaderScoreGroup}>
      <TrophyIllustration size={24} />
      <Text style={[styles.leaderScore, isCurrentUser && styles.leaderScoreCurrent]}>{score}</Text>
    </View>
    {onPress ? <Feather name="chevron-right" size={16} color={colors.inkSubtle}/> : null}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  headerCopy: { flex: 1, minWidth: 0 },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  title: { ...typography.title, color: colors.ink },
  headerInfoButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  scoreCard: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 16, marginBottom: 24 },
  scoreTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  scoreCopy: { flexGrow: 1, flexShrink: 1, gap: 3 },
  scoreLabel: { ...typography.overline, fontSize: 9, letterSpacing: 1, color: colors.inkMuted },
  scoreValue: { fontSize: 38, lineHeight: 44, fontWeight: '800', color: colors.gold, fontVariant: ['tabular-nums'] },
  rankSummary: { gap: 3, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 16 },
  rankValue: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  milestoneHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 9 },
  milestoneCopy: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  milestoneValue: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  milestoneTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border },
  milestoneFill: { height: '100%', borderRadius: 3, backgroundColor: colors.gold },
  leaderboardHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  leaderboardTitle: { ...typography.subtitle, color: colors.ink, fontWeight: '700' },
  participants: { ...typography.caption, color: colors.inkMuted },
  inviteButton: { flex: 1, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  inviteButtonText: { ...typography.label, color: colors.onPrimary, fontWeight: '700', flexShrink: 1 },
  leaderboardCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.panel, borderColor: colors.border },
  columnHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  columnLabel: { ...typography.overline, fontSize: 8, letterSpacing: 0.9, color: colors.inkSubtle },
  rankColumn: { width: 32, textAlign: 'center' },
  memberColumn: { flex: 1 },
  leaderRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  leaderRowCurrent: { backgroundColor: colors.panelMuted },
  currentAccent: { position: 'absolute', left: 0, width: 2, top: 22, bottom: 22, borderRadius: 2, backgroundColor: colors.gold },
  rankSlot: { width: 32, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topRankSlot: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  rankText: { fontSize: 15, color: colors.inkMuted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  avatarText: { ...typography.caption, fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  leaderIdentity: { flex: 1, minWidth: 0, gap: 5 },
  leaderName: { ...typography.bodyBold, color: colors.ink },
  youBadge: { alignSelf: 'flex-start', borderRadius: 5, backgroundColor: colors.panelRaised, paddingHorizontal: 6, paddingVertical: 1 },
  youLabel: { ...typography.caption, fontSize: 9, lineHeight: 14, color: colors.inkMuted },
  leaderScore: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
  leaderScoreCurrent: { color: colors.gold },
  leaderScoreGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ellipsis: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  ellipsisText: { ...typography.caption, color: colors.inkSubtle },
  serviceNotice: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.panelRaised },
  serviceNoticeText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  bottomDock: { flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bottomDockCompact: { flexDirection: 'column' },
  joinCodeButton: { flex: 1, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  joinCodeButtonText: { ...typography.label, color: colors.ink, fontWeight: '600', flexShrink: 1 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  modalCard: { borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  modalIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelRaised, marginBottom: spacing.md },
  modalTitle: { minWidth: 0, flexShrink: 1, ...typography.title, color: colors.ink },
  modalCopy: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
  codeInput: { height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelMuted, color: colors.ink, textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 3, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { ...typography.bodyBold, color: colors.inkMuted },
  joinButton: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primaryAction, alignItems: 'center', justifyContent: 'center' },
  joinButtonText: { ...typography.bodyBold, color: colors.onPrimary },
  buttonDisabled: { opacity: 0.45 },
});
