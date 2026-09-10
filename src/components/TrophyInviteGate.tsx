import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  confirmTrophyInvite, dismissPendingTrophyInvite, fetchPendingTrophyInvite, previewTrophyInvite,
  readLocalInvite, saveLocalInvite, trophyInviteCodeFromUrl, publishInviteAccepted,
  type InvitePreview, type PendingInvite,
} from '../services/trophyInviteService';

type Props = {
  token: string | null; userId?: string; active: boolean; canViewLeaderboard: boolean;
  onViewLeaderboard: () => void; onSignIn: () => void;
};

export function TrophyInviteGate({ token, userId, active, canViewLeaderboard, onViewLeaderboard, onSignIn }: Props) {
  const [pending, setPending] = useState<PendingInvite | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [signInRequested, setSignInRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const latest = useRef({ token, userId, pending });
  latest.current = { token, userId, pending };
  const revision = useRef(0);
  const actionInFlight = useRef(false);

  const remember = useCallback((value: PendingInvite | null) => {
    revision.current += 1;
    latest.current.pending = value;
    setPending(value);
    setPreview(null);
    setError('');
    setSuccess(false);
    setSignInRequested(false);
    saveLocalInvite(value).catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    let receivedLink = false;
    const receive = (url: string) => {
      const code = trophyInviteCodeFromUrl(url);
      if (!code) return;
      receivedLink = true;
      // Duplicate OS deliveries should not replace an open confirmation.
      if (latest.current.pending?.code === code) return;
      remember({ code, savedAt: Date.now(), userId: latest.current.token ? latest.current.userId : undefined });
    };
    const listener = Linking.addEventListener('url', ({ url }) => receive(url));
    Promise.all([readLocalInvite().catch(() => null), Linking.getInitialURL().catch(() => null)])
      .then(([stored, url]) => {
        if (!mounted || receivedLink) return;
        if (url && trophyInviteCodeFromUrl(url)) receive(url);
        else if (stored) remember(stored);
      });
    return () => { mounted = false; listener.remove(); };
  }, [remember]);

  useEffect(() => {
    if (!pending || !userId || !token) return;
    if (pending.userId && pending.userId !== userId) remember(null);
    else if (!pending.userId) remember({ ...pending, userId });
  }, [pending, remember, token, userId]);

  useEffect(() => {
    if (!token || !userId) return;
    let alive = true;
    let fetching = false;
    const check = async () => {
      if (fetching || latest.current.pending) return;
      fetching = true;
      const version = revision.current;
      try {
        const result = await fetchPendingTrophyInvite(token, userId);
        if (alive && revision.current === version && !latest.current.pending && result.invite) {
          remember({ code: result.invite.code, savedAt: Date.now(), userId });
        }
      } catch { /* A failed background lookup must not block login. Retry on foreground. */ }
      finally { fetching = false; }
    };
    check();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { alive = false; listener.remove(); };
  }, [remember, token, userId]);

  useEffect(() => {
    setPreview(null);
    setError('');
    setSuccess(false);
    if (!token || !pending || !active || !userId || pending.userId !== userId) return;
    let alive = true;
    previewTrophyInvite(pending.code, token)
      .then(value => { if (alive) setPreview(value); })
      .catch(() => { if (alive) setError('We couldn’t open this invitation. Check your connection or ask your friend for a new link.'); });
    return () => { alive = false; };
  }, [active, pending, retry, token, userId]);

  const finish = async (join: boolean) => {
    if (!pending || !token || actionInFlight.current) return false;
    actionInFlight.current = true;
    setBusy(true);
    setError('');
    const code = pending.code;
    const version = revision.current;
    try {
      if (join) await confirmTrophyInvite(code, token);
      else await dismissPendingTrophyInvite(code, token, userId || '');
      if (latest.current.token !== token || revision.current !== version) return false;
      if (join) {
        await saveLocalInvite(null).catch(() => undefined);
        if (latest.current.token !== token || revision.current !== version) return false;
        publishInviteAccepted();
        setSuccess(true);
      } else remember(null);
      return true;
    } catch {
      if (latest.current.token === token && revision.current === version) {
        setError(join ? 'We couldn’t join yet. Please try again.' : 'We couldn’t dismiss this invitation. Please try again.');
      }
      return false;
    } finally { actionInFlight.current = false; setBusy(false); }
  };

  const close = () => {
    if (busy) return;
    if (success || !token) remember(null);
    else return finish(false);
  };
  const signedIn = Boolean(token && userId && pending?.userId === userId);
  const visible = active && Boolean(pending) && (signedIn || (!token && !signInRequested));
  const title = success ? 'You’re on each other’s leaderboard'
    : !signedIn ? 'Your friend invited you'
    : preview?.isOwnInvite ? 'This is your invite link'
    : preview?.alreadyConnected ? 'You’re already connected'
    : preview ? `Join ${preview.displayName} on FormBae?` : 'Your leaderboard invitation';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.icon}><Feather name={success ? 'check' : 'users'} size={30} color={colors.gold} /></View>
            <Text style={styles.overline}>BETTER TOGETHER</Text>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.body}>{success ? 'Keep showing up, earn trophies, and follow each other’s progress.'
              : !signedIn ? 'Sign in to review their invitation. You’ll confirm before either of you is added.'
              : preview?.isOwnInvite ? 'Share this link with a friend so they can join you.'
              : preview?.alreadyConnected ? 'You can find each other in your friends rankings.'
              : 'You’ll both appear on each other’s leaderboard and share your display name and trophy count. You can remove the connection anytime.'}</Text>
            {signedIn && !preview && !error && <ActivityIndicator color={colors.gold} accessibilityLabel="Loading invitation" />}
            {preview && !preview.isOwnInvite && !success && <View style={styles.friend}>
              <View style={styles.avatar}><Text style={styles.initial}>{preview.displayName.slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.friendName}>{preview.displayName}</Text>
              <Feather name="award" size={20} color={colors.gold} />
              <Text style={styles.trophies}>{preview.trophies}</Text>
            </View>}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {!signedIn ? <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => { setSignInRequested(true); onSignIn(); }}>
              <Text style={styles.primaryText}>Sign in to continue</Text>
            </TouchableOpacity> : success || preview?.alreadyConnected ? <TouchableOpacity accessibilityRole="button" style={styles.primary} disabled={busy} onPress={async () => {
              if (!success && !(await finish(false))) return;
              else remember(null);
              if (canViewLeaderboard) onViewLeaderboard();
            }}><Text style={styles.primaryText}>{canViewLeaderboard ? 'View leaderboard' : 'Continue setup'}</Text></TouchableOpacity>
              : !preview?.isOwnInvite && <TouchableOpacity accessibilityRole="button" disabled={busy || (!preview && !error)} style={[styles.primary, busy && styles.disabled]} onPress={() => preview ? finish(true) : setRetry(value => value + 1)}>
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>{error ? 'Try again' : 'Join leaderboard'}</Text>}
              </TouchableOpacity>}
            {!success && <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={close}>
              <Text style={styles.secondaryText}>{preview?.isOwnInvite ? 'Got it' : 'Not now'}</Text>
            </TouchableOpacity>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, padding: 24, justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: colors.panel, borderRadius: 28, borderWidth: 1, borderColor: colors.border },
  content: { padding: 24, gap: 16 },
  icon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  overline: { ...typography.overline, color: colors.gold },
  title: { ...typography.hero, color: colors.ink },
  body: { ...typography.body, color: colors.inkMuted },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.panelRaised },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.panel, justifyContent: 'center', alignItems: 'center' },
  initial: { ...typography.subtitle, color: colors.gold },
  friendName: { ...typography.subtitle, color: colors.ink, flex: 1 },
  trophies: { ...typography.title, color: colors.gold },
  error: { ...typography.body, color: colors.error },
  primary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', padding: 14 },
  primaryText: { ...typography.button, color: colors.onPrimary, textAlign: 'center' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.button, color: colors.inkMuted },
  disabled: { opacity: 0.6 },
});
