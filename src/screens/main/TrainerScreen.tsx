import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { sendMessage } from '../../services/messageService';
import { changeCoach } from '../../services/trainerService';
import { loadCoachBundleCached } from '../../services/preloadService';
import { useAuthStore } from '../../store/authStore';
import { getSiteUrl } from '../../constants/config';
import { formatMessageTime } from '../../utils/format';
import type { CoachOption, Message } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

type CoachTab = 'about' | 'chat' | 'change';

function photoUrl(value: string) {
  const url = value.trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${getSiteUrl()}${url}`;
  return url;
}

function formatPrice(value: string) {
  const amount = Number(String(value || '').replace(/,/g, '').trim());
  if (!Number.isFinite(amount) || amount <= 0) return 'Included';
  return `₹${amount.toLocaleString('en-IN')}/mo`;
}

function formatUnlockDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function TrainerScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<CoachTab>('about');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [changingId, setChangingId] = useState('');
  const { refreshStatus } = useAuthStore();

  const { data, loading, error, reload, refresh, refreshing, setData } = useAsync((mode) =>
    loadCoachBundleCached({ force: mode === 'refresh' }),
  );

  const currentCoach = data?.coachHub.currentTrainer ?? data?.coachHub.trainers[0] ?? null;
  const selectedCoach = useMemo(
    () => data?.coachHub.trainers.find((coach) => coach.trainerId === currentCoach?.trainerId) ?? currentCoach,
    [currentCoach, data?.coachHub.trainers],
  );

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(trimmed, data?.planId);
      setText('');
      if (res.message) {
        setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
        loadCoachBundleCached({ force: true }).catch(() => undefined);
      } else {
        await reload();
      }
    } catch {
      await reload();
    } finally {
      setSending(false);
    }
  }, [text, sending, data?.planId, setData, reload]);

  const confirmChangeCoach = useCallback(
    (coach: CoachOption) => {
      if (!data || coach.changeKind === 'none') return;
      if (coach.blockedUntil) {
        Alert.alert('Coach change locked', `${coach.reason} You can change again after ${formatUnlockDate(coach.blockedUntil)}.`);
        return;
      }
      if (coach.requiresUpgrade) {
        Alert.alert('Upgrade required', coach.reason);
        return;
      }
      Alert.alert('Change coach?', `Switch from ${currentCoach?.name || 'your current coach'} to ${coach.name}? Your workout history stays intact.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            setChangingId(coach.trainerId);
            try {
              await changeCoach(coach.trainerId);
              await refreshStatus().catch(() => undefined);
              await loadCoachBundleCached({ force: true }).catch(() => undefined);
              await reload();
              setTab('about');
            } catch (e) {
              Alert.alert('Could not change coach', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setChangingId('');
            }
          },
        },
      ]);
    },
    [currentCoach?.name, data, refreshStatus, reload],
  );

  useEffect(() => {
    if (tab === 'chat' && data?.messages.length) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [data?.messages.length, tab]);

  if (loading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading your coach..." />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error || 'Could not load your coach.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  if (!currentCoach) {
    return (
      <ScreenContainer>
        <EmptyState icon="user-plus" title="No coach assigned" message="Your coach will appear here once assigned." />
      </ScreenContainer>
    );
  }

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <CoachHero coach={currentCoach} />
        <View style={styles.tabs}>
          <TabButton label="About" icon="user" active={tab === 'about'} onPress={() => setTab('about')} />
          <TabButton label="Chat" icon="message-circle" active={tab === 'chat'} onPress={() => setTab('chat')} />
          <TabButton label="Change" icon="repeat" active={tab === 'change'} onPress={() => setTab('change')} />
        </View>

        {tab === 'about' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          >
            <CoachAbout coach={selectedCoach || currentCoach} onMessage={() => setTab('chat')} onChange={() => setTab('change')} />
          </ScrollView>
        ) : null}

        {tab === 'chat' ? (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.thread}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.threadContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
            >
              {data.messages.length === 0 ? (
                <EmptyState icon="message-circle" title="No messages yet" message="Say hello to your coach to get started." />
              ) : (
                data.messages.map((m: Message) => <MessageBubble key={m.messageId} message={m} />)
              )}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Write a message..."
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="sentences"
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendDisabled]}
                onPress={onSend}
                disabled={!text.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="send" size={20} color={colors.white} />}
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {tab === 'change' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          >
            <ChangeCoachHeader onBack={() => setTab('about')} />
            <View style={styles.coachList}>
              {data.coachHub.trainers.map((coach) => (
                <CoachOptionCard
                  key={coach.trainerId}
                  coach={coach}
                  current={coach.trainerId === currentCoach.trainerId}
                  changing={changingId === coach.trainerId}
                  onPress={() => confirmChangeCoach(coach)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </ScreenContainer>
    </KeyboardScreen>
  );
}

function CoachHero({ coach }: { coach: CoachOption }) {
  const image = photoUrl(coach.photoUrl);
  return (
    <View style={styles.hero}>
      {image ? <Image source={{ uri: image }} style={styles.heroImage} /> : <Avatar name={coach.name} size={72} />}
      <View style={styles.heroText}>
        <Text style={styles.kicker}>Your coach</Text>
        <Text style={styles.heroName} numberOfLines={1}>{coach.name}</Text>
        <Text style={styles.heroMeta} numberOfLines={1}>{coach.expertise || 'Personal trainer'}</Text>
      </View>
      <Badge label={coach.tier} tone="accent" icon="award" />
    </View>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabButton, active && styles.tabActive]} accessibilityRole="button">
      <Feather name={icon} size={16} color={active ? colors.white : colors.accentDark} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CoachAbout({ coach, onMessage, onChange }: { coach: CoachOption; onMessage: () => void; onChange: () => void }) {
  const bio = coach.detailedDescription || coach.description || 'Your coach will guide your training, review your progress, and keep the plan moving.';
  return (
    <>
      <Card style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>Coach profile</Text>
        <Text style={styles.aboutBody}>{bio}</Text>
        <View style={styles.quickGrid}>
          <InfoTile icon="tag" label="Type" value={coach.expertise || 'Personal trainer'} />
          <InfoTile icon="credit-card" label="Monthly" value={formatPrice(coach.monthlyFee)} />
          <InfoTile icon="globe" label="Languages" value={coach.languages.length ? coach.languages.join(', ') : 'Not specified'} />
        </View>
      </Card>

      <SectionTitle>What you can do</SectionTitle>
      <View style={styles.actionRow}>
        <PrimaryButton title="Message coach" icon="message-circle" onPress={onMessage} style={styles.actionButton} />
        <PrimaryButton title="Change coach" icon="repeat" variant="secondary" onPress={onChange} style={styles.actionButton} />
      </View>
    </>
  );
}

function ChangeCoachHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.changeHeader}>
      <TouchableOpacity onPress={onBack} style={styles.changeBackButton} accessibilityRole="button" accessibilityLabel="Back to coach profile">
        <Feather name="chevron-left" size={22} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.changeHeaderText}>
        <Text style={styles.changeTitle}>Pick your trainer</Text>
        <Text style={styles.changeSubtitle}>Choose from trainers currently shown to users.</Text>
      </View>
    </View>
  );
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <Feather name={icon} size={16} color={colors.accentDark} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.senderRole === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.trainerBubble]}>
        <Text style={[styles.msg, isUser && styles.msgUser]}>{message.text}</Text>
        {message.createdAt ? <Text style={[styles.time, isUser && styles.timeUser]}>{formatMessageTime(message.createdAt)}</Text> : null}
      </View>
    </View>
  );
}

function CoachOptionCard({
  coach,
  current,
  changing,
  onPress,
}: {
  coach: CoachOption;
  current: boolean;
  changing: boolean;
  onPress: () => void;
}) {
  const image = photoUrl(coach.photoUrl);
  const disabled = current || changing;
  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} disabled={disabled} style={[styles.optionCard, current && styles.optionCurrent]}>
      <View style={styles.optionTop}>
        {image ? <Image source={{ uri: image }} style={styles.optionImage} /> : <Avatar name={coach.name} size={54} tone={current ? 'accent' : 'neutral'} />}
        <View style={styles.optionText}>
          <View style={styles.optionNameRow}>
            <Text style={styles.optionName} numberOfLines={1}>{coach.name}</Text>
            {current ? <Badge label="Current" tone="success" icon="check" /> : null}
          </View>
          <Text style={styles.optionMeta} numberOfLines={1}>{coach.expertise}</Text>
        </View>
      </View>
      <Text style={styles.optionDescription} numberOfLines={2}>{coach.description || coach.detailedDescription || 'Coach profile details will appear here.'}</Text>
      <View style={styles.optionFooter}>
        <Text style={styles.optionPrice}>{formatPrice(coach.monthlyFee)}</Text>
        <View style={[styles.selectPill, (!coach.canSelect || current) && styles.selectPillDisabled]}>
          {changing ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={[styles.selectText, (!coach.canSelect || current) && styles.selectTextDisabled]}>{current ? 'Selected' : coach.requiresUpgrade ? 'Upgrade' : 'Choose'}</Text>}
        </View>
      </View>
      {!coach.canSelect && !current ? <Text style={styles.optionReason}>{coach.blockedUntil ? `${coach.reason} Available ${formatUnlockDate(coach.blockedUntil)}.` : coach.reason}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.inkStrong,
    borderRadius: 28,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroImage: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.panelMuted },
  heroText: { flex: 1 },
  kicker: { ...typography.overline, color: colors.onAccentMuted, textTransform: 'uppercase' },
  heroName: { ...typography.title, color: colors.white, marginTop: 2 },
  heroMeta: { ...typography.caption, color: colors.onAccentMuted, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { ...typography.caption, color: colors.accentDark, fontWeight: '800' },
  tabTextActive: { color: colors.white },
  scroll: { paddingBottom: spacing.xl },
  aboutCard: { gap: spacing.md },
  aboutTitle: { ...typography.title, color: colors.ink },
  aboutBody: { ...typography.body, color: colors.inkMuted, lineHeight: 22 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoTile: {
    width: '48%',
    minHeight: 98,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accentSurface,
  },
  infoLabel: { ...typography.caption, color: colors.accentDarker, marginTop: 8 },
  infoValue: { ...typography.bodyBold, color: colors.ink, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  changeBackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeHeaderText: { flex: 1 },
  changeTitle: { ...typography.title, color: colors.ink },
  changeSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  thread: { flex: 1 },
  threadContent: { paddingBottom: spacing.md },
  bubbleRow: { marginTop: spacing.sm, flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  trainerBubble: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msg: { ...typography.body, color: colors.ink },
  msgUser: { color: colors.white },
  time: { ...typography.caption, fontSize: 10, color: colors.inkSubtle, marginTop: 4, alignSelf: 'flex-end' },
  timeUser: { color: 'rgba(255,255,255,0.75)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: 120,
    ...typography.body,
    fontSize: 16,
    color: colors.ink,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  coachList: { gap: spacing.sm },
  optionCard: {
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionCurrent: { borderColor: colors.accentSurface, backgroundColor: colors.accentLight },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionImage: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.panelMuted },
  optionText: { flex: 1 },
  optionNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionName: { ...typography.subtitle, color: colors.ink, flex: 1 },
  optionMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  optionDescription: { ...typography.body, color: colors.inkMuted, marginTop: spacing.sm },
  optionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  optionPrice: { ...typography.bodyBold, color: colors.ink },
  selectPill: { minWidth: 86, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: 9 },
  selectPillDisabled: { backgroundColor: colors.panelMuted },
  selectText: { ...typography.caption, color: colors.white, fontWeight: '800' },
  selectTextDisabled: { color: colors.inkMuted },
  optionReason: { ...typography.caption, color: colors.error, marginTop: spacing.sm },
});
