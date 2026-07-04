import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, StyleSheet, View, RefreshControl, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from '../../components/Card';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { Avatar } from '../../components/Avatar';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchMessages, sendMessage } from '../../services/messageService';
import { fetchToday } from '../../services/workoutService';
import { formatMessageTime } from '../../utils/format';
import type { Message } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

export function TrainerScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const { data, loading, error, reload, refresh, refreshing, setData } = useAsync(async () => {
    const [msgs, today] = await Promise.all([fetchMessages(), fetchToday().catch(() => null)]);
    return {
      messages: [...msgs.messages].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
      planId: msgs.planId,
      trainerName: today?.assignedTrainer?.name || 'Your trainer',
      trainerExpertise: today?.assignedTrainer?.trainerDescription || '',
    };
  });

  const onSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(trimmed, data?.planId);
      setText('');
      if (res.message) {
        setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      } else {
        await reload();
      }
    } catch {
      await reload();
    } finally {
      setSending(false);
    }
  }, [text, sending, data?.planId, setData, reload]);

  useEffect(() => {
    if (data?.messages.length) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [data?.messages.length]);

  if (loading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading your conversation…" />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error || 'Could not load messages.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <View style={styles.header}>
          <Avatar name={data.trainerName} size={44} />
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {data.trainerName}
            </Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {data.trainerExpertise || 'Personal trainer'}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.threadContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        >
          {data.messages.length === 0 ? (
            <EmptyState icon="message-circle" title="No messages yet" message="Say hello to your trainer to get started." />
          ) : (
            data.messages.map((m: Message) => {
              const isUser = m.senderRole === 'user';
              return (
                <View key={m.messageId} style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
                  <View style={[styles.bubble, isUser ? styles.userBubble : styles.trainerBubble]}>
                    <Text style={[styles.msg, isUser && styles.msgUser]}>{m.text}</Text>
                    {m.createdAt ? (
                      <Text style={[styles.time, isUser && styles.timeUser]}>{formatMessageTime(m.createdAt)}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Write a message…"
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
      </ScreenContainer>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerText: { flex: 1 },
  headerName: { ...typography.subtitle, color: colors.ink },
  headerMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  thread: { flex: 1 },
  threadContent: { paddingVertical: spacing.md },
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
});
