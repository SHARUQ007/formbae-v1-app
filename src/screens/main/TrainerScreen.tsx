import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, StyleSheet, View, RefreshControl } from 'react-native';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { FormInput } from '../../components/FormInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchMessages, sendMessage } from '../../services/messageService';
import { fetchToday } from '../../services/workoutService';
import { formatMessageTime } from '../../utils/format';
import type { Message } from '../../types/api';
import { colors } from '../../theme/colors';

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
        <ScreenTitle>Your trainer</ScreenTitle>
        <LoadingState message="Loading your conversation…" />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ScreenTitle>Your trainer</ScreenTitle>
        <ErrorState message={error || 'Could not load messages.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <ScreenTitle>{data.trainerName}</ScreenTitle>
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <Card>
            <Text style={styles.subtitle}>
              {data.trainerExpertise || 'Send a question or update. Your trainer will reply here in the app.'}
            </Text>
          </Card>
          {data.messages.length === 0 ? (
            <EmptyState title="No messages yet" message="Say hello to your trainer to get started." />
          ) : (
            data.messages.map((m: Message) => {
              const isUser = m.senderRole === 'user';
              return (
                <View key={m.messageId} style={[styles.bubbleRow, isUser ? styles.rowRight : styles.rowLeft]}>
                  <View style={[styles.bubble, isUser ? styles.userBubble : styles.trainerBubble]}>
                    <Text style={[styles.role, isUser && styles.roleUser]}>{isUser ? 'You' : data.trainerName}</Text>
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
          <FormInput value={text} onChangeText={setText} placeholder="Write a message…" autoCapitalize="sentences" />
          <PrimaryButton title="Send message" onPress={onSend} loading={sending} />
        </View>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  thread: { flex: 1 },
  subtitle: { color: colors.inkMuted, lineHeight: 21 },
  bubbleRow: { marginTop: 10, flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: 16, padding: 12 },
  userBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  trainerBubble: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  role: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 4 },
  roleUser: { color: 'rgba(255,255,255,0.85)' },
  msg: { color: colors.ink, lineHeight: 21 },
  msgUser: { color: colors.white },
  time: { fontSize: 11, color: colors.inkMuted, marginTop: 6 },
  timeUser: { color: 'rgba(255,255,255,0.75)' },
  composer: { paddingTop: 8 },
});
