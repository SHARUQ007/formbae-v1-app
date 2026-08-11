import { useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Circle } from 'react-native-svg';
import { Card, ScreenContainer, SectionTitle } from '../../components/Card';
import { ErrorState, LoadingState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import type { ProgressStackParamList } from '../../navigation/types';
import { loadProgressBundleCached } from '../../services/preloadService';
import { acceptTrophyInvite, fetchTrophyInvite, fetchTrophyLeaderboard } from '../../services/progressService';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ProgressStackParamList, 'TrophyDetails'>;

export function TrophyDetailsScreen({ navigation }: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [sharing, setSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const { data, loading, error, reload, refresh, refreshing } = useAsync(async (mode) => {
    const bundle = await loadProgressBundleCached({ force: mode === 'refresh' });
    try {
      const leaderboard = await fetchTrophyLeaderboard();
      return { progress: bundle.progress, leaderboard, leaderboardAvailable: true };
    } catch {
      const score = bundle.progress.trophies?.score ?? 0;
      return {
        progress: bundle.progress,
        leaderboard: {
          leaders: [{ rank: 1, displayName: 'You', score, isCurrentUser: true }],
          currentUser: { rank: 1, displayName: 'You', score, isCurrentUser: true },
          participantCount: 1,
        },
        leaderboardAvailable: false,
      };
    }
  });

  const shareInvite = async () => {
    if (sharing) return;
    if (!data?.leaderboardAvailable) {
      Alert.alert('Invites are temporarily unavailable', 'The leaderboard service is being updated. Please try again shortly.');
      return;
    }
    setSharing(true);
    try {
      const invite = await fetchTrophyInvite();
      await Share.share({
        title: 'Join my FormBae leaderboard',
        message: `Join my FormBae trophy leaderboard. Use code ${invite.code}\n${invite.shareUrl}`,
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
    if (!data?.leaderboardAvailable) {
      setJoinOpen(false);
      Alert.alert('Joining is temporarily unavailable', 'The leaderboard service is being updated. Please try again shortly.');
      return;
    }
    setJoining(true);
    try {
      await acceptTrophyInvite(code);
      setJoinOpen(false);
      setInviteCode('');
      await refresh();
      Alert.alert('You’re connected', 'Their scores now appear in your friends leaderboard.');
    } catch (joinError) {
      Alert.alert('Could not join', joinError instanceof Error ? joinError.message : 'Check the code and try again.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <ScreenContainer withBottomInset><TrophyHeader onBack={() => navigation.goBack()} /><LoadingState message="Loading trophies..." /></ScreenContainer>;
  }
  if (error || !data?.progress.trophies) {
    return <ScreenContainer withBottomInset><TrophyHeader onBack={() => navigation.goBack()} /><ErrorState message={error || 'Trophy details are unavailable.'} onRetry={reload} /></ScreenContainer>;
  }

  const trophy = data.progress.trophies;
  const bandSize = Math.max(1, trophy.nextMilestone - trophy.safeZone);
  const progress = Math.max(0, Math.min(1, (trophy.score - trophy.safeZone) / bandSize));
  const leaders = data.leaderboard.leaders;
  const participantCount = data.leaderboard.participantCount;
  const currentOutsideTop = data.leaderboard.currentUser && !leaders.some((row) => row.isCurrentUser) ? data.leaderboard.currentUser : null;

  return (
    <ScreenContainer withBottomInset>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
        contentContainerStyle={styles.scroll}
      >
        <TrophyHeader onBack={() => navigation.goBack()} />

        <Card style={styles.hero}>
          <LargeTrophyRing value={progress} />
          <Text style={styles.score}>{trophy.score}</Text>
          <Text style={styles.scoreLabel}>trophies</Text>
          <Text style={styles.milestone}>{trophy.pointsToNext} to trophy {trophy.nextMilestone}</Text>
          <View style={styles.safeZone}><MaterialCommunityIcon name="shield-check" size={16} color={colors.success} /><Text style={styles.safeZoneText}>Safe zone {trophy.safeZone}</Text></View>
        </Card>

        <SectionTitle>What built your score</SectionTitle>
        <View style={styles.breakdownGrid}>
          <BreakdownStat icon="activity" label="Workouts" count={`${trophy.workoutCount}`} points={trophy.breakdown.workouts} />
          <BreakdownStat icon="star" label="Star points" count={`${trophy.starCount}`} points={trophy.breakdown.stars} />
          <BreakdownStat icon="zap" label="Current streak" count={`${trophy.currentStreak}d`} points={trophy.breakdown.streakMomentum} />
          <BreakdownStat icon="shield" label="Streak best" count={`${data.progress.bestStreak}d`} points={trophy.breakdown.streakAchievement} />
        </View>

        <Card style={styles.ruleCard}>
          <MaterialCommunityIcon name="information-outline" size={20} color={colors.gold} />
          <Text style={styles.ruleText}>Workouts earn 5, food-memory stars earn 1, and active streaks add momentum. Your score can move within a band, but never below a safe zone you have reached.</Text>
        </Card>

        <View style={styles.leaderboardHead}>
          <View>
            <SectionTitle style={styles.leaderboardTitle}>Friends leaderboard</SectionTitle>
            <Text style={styles.participants}>{participantCount} {participantCount === 1 ? 'member' : 'members'}</Text>
          </View>
          <TouchableOpacity style={styles.inviteButton} onPress={shareInvite} disabled={sharing} accessibilityRole="button" accessibilityLabel="Invite friends">
            <Feather name="user-plus" size={17} color={colors.onPrimary} />
            <Text style={styles.inviteButtonText}>{sharing ? 'Opening…' : 'Invite'}</Text>
          </TouchableOpacity>
        </View>
        <Card style={styles.leaderboardCard}>
          {leaders.length ? leaders.map((row) => <LeaderboardRow key={`${row.rank}-${row.displayName}`} {...row} />) : <Text style={styles.emptyText}>Invite friends to start your leaderboard.</Text>}
          {currentOutsideTop ? <><View style={styles.ellipsis}><Text style={styles.ellipsisText}>•••</Text></View><LeaderboardRow {...currentOutsideTop} /></> : null}
        </Card>
        {!data.leaderboardAvailable ? <View style={styles.serviceNotice}><Feather name="info" size={14} color={colors.inkMuted} /><Text style={styles.serviceNoticeText}>Friends leaderboard is being updated. Your trophy details are still available.</Text></View> : null}
        <View style={styles.leaderboardFooter}>
          <Text style={styles.privacy}>Only first names and last initials are shown.</Text>
          <TouchableOpacity onPress={() => setJoinOpen(true)} accessibilityRole="button">
            <Text style={styles.joinLink}>Have a code? Join</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Feather name="users" size={23} color={colors.gold} /></View>
            <Text style={styles.modalTitle}>Join a friend’s leaderboard</Text>
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

function TrophyHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to progress">
        <Feather name="chevron-left" size={24} color={colors.ink} />
      </TouchableOpacity>
      <View><Text style={styles.eyebrow}>Rewards</Text><Text style={styles.title}>Your trophies</Text></View>
    </View>
  );
}

function LargeTrophyRing({ value }: { value: number }) {
  const size = 142;
  const stroke = 10;
  const center = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, value)) * circumference;
  return (
    <View style={[styles.largeRing, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={colors.borderStrong} strokeWidth={stroke} fill="none" />
        <Circle cx={center} cy={center} r={r} stroke={colors.gold} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} transform={`rotate(-90 ${center} ${center})`} />
      </Svg>
      <View style={styles.ringCenter}><MaterialCommunityIcon name="trophy" size={52} color={colors.gold} /></View>
    </View>
  );
}

function BreakdownStat({ icon, label, count, points }: { icon: string; label: string; count: string; points: number }) {
  return (
    <View style={styles.breakdownStat}>
      <Feather name={icon} size={18} color={colors.gold} />
      <Text style={styles.breakdownCount}>{count}</Text>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownPoints}>{points >= 0 ? '+' : ''}{points} trophies</Text>
    </View>
  );
}

function LeaderboardRow({ rank, displayName, score, isCurrentUser }: { rank: number; displayName: string; score: number; isCurrentUser: boolean }) {
  const medalColor = rank === 1 ? colors.gold : rank === 2 ? '#b9bec8' : '#bf865b';
  return (
    <View style={[styles.leaderRow, isCurrentUser && styles.leaderRowCurrent]}>
      <View style={styles.rankSlot}>{rank <= 3 ? <MaterialCommunityIcon name="medal" size={21} color={medalColor} /> : <Text style={styles.rankText}>{rank}</Text>}</View>
      <View style={styles.avatar}><Text style={styles.avatarText}>{displayName === 'You' ? 'Y' : displayName.charAt(0).toUpperCase()}</Text></View>
      <Text style={[styles.leaderName, isCurrentUser && styles.leaderNameCurrent]}>{displayName}</Text>
      <MaterialCommunityIcon name="trophy" size={16} color={colors.gold} />
      <Text style={styles.leaderScore}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  eyebrow: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  title: { ...typography.title, color: colors.ink, marginTop: 2 },
  hero: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.borderStrong, paddingVertical: spacing.lg },
  largeRing: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panelMuted, borderWidth: 1, borderColor: colors.border },
  score: { fontSize: 48, lineHeight: 53, fontWeight: '900', color: colors.ink, letterSpacing: -1.2, marginTop: spacing.sm },
  scoreLabel: { ...typography.overline, color: colors.inkMuted, textTransform: 'uppercase' },
  milestone: { ...typography.bodyBold, color: colors.gold, marginTop: spacing.sm },
  safeZone: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  safeZoneText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  breakdownStat: { width: '47.5%', flexGrow: 1, minHeight: 130, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: spacing.md },
  breakdownCount: { ...typography.title, color: colors.ink, marginTop: spacing.sm },
  breakdownLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  breakdownPoints: { fontSize: 10, lineHeight: 14, color: colors.gold, fontWeight: '800', marginTop: spacing.xs },
  ruleCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.panelMuted, borderColor: colors.border },
  ruleText: { ...typography.caption, flex: 1, color: colors.inkMuted, lineHeight: 19 },
  leaderboardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  leaderboardTitle: { marginTop: 0, marginBottom: 0 },
  participants: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
  inviteButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primaryAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
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
  leaderboardFooter: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  serviceNotice: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  serviceNoticeText: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  privacy: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
  joinLink: { ...typography.caption, color: colors.gold, fontWeight: '800', paddingVertical: spacing.xs },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  modalCard: { borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
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
