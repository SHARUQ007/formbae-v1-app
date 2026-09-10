import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import {
  fetchConnection,
  removeConnection,
  type ConnectionDetails,
  type RemovalScope,
} from '../services/connectionService';
import { TrophyIllustration } from './TrophyIllustration';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';

export function ConnectionDetailsSheet({
  userId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    if (userId)
      fetchConnection(userId)
        .then(value => {
          if (active) setData(value);
        })
        .catch(() => {
          if (active)
            setError('Could not load this connection. It may have changed.');
        });
    return () => {
      active = false;
    };
  }, [userId, retry]);
  const close = () => {
    if (!busy) onClose();
  };
  const confirm = (scope: RemovalScope) => {
    if (!data || !userId || busy) return;
    const description =
      scope === 'leaderboard'
        ? 'You will leave each other’s leaderboard. Your Partner mode connection stays as it is.'
        : scope === 'partner'
        ? 'This ends Partner mode for both of you and deletes your shared task photos. Your leaderboard connection stays as it is.'
        : 'This ends Partner mode, deletes shared task photos, and removes you from each other’s leaderboard.';
    Alert.alert(`Remove ${data.displayName}?`, description, [
      { text: 'Keep connection', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await removeConnection(userId, scope);
            onChanged();
            onClose();
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not remove the connection. Try again.',
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };
  return (
    <Modal
      visible={Boolean(userId)}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 20 }]}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.heading}>Your connection</Text>
            <TouchableOpacity
              onPress={close}
              disabled={busy}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close connection details"
            >
              <Feather name="x" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 24 },
            ]}
          >
            {!data && !error ? (
              <ActivityIndicator
                color={colors.gold}
                accessibilityLabel="Loading connection details"
              />
            ) : null}
            {data ? (
              <>
                <View style={styles.identity}>
                  <View style={styles.avatar}>
                    <Text style={styles.initial}>
                      {data.displayName.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{data.displayName}</Text>
                    <Text style={styles.muted}>
                      {data.isPartner
                        ? 'Your accountability partner'
                        : 'Leaderboard friend'}
                    </Text>
                  </View>
                </View>
                <View style={styles.stats}>
                  <TrophyIllustration size={42} />
                  <View>
                    <Text style={styles.score}>{data.trophyCount}</Text>
                    <Text style={styles.muted}>trophies</Text>
                  </View>
                </View>
                <View style={styles.badges}>
                  {data.isPartner ? (
                    <Text style={styles.badge}>Partner mode · Connected</Text>
                  ) : null}
                  {data.onLeaderboard ? (
                    <Text style={styles.badge}>On your leaderboard</Text>
                  ) : null}
                </View>
                {data.isPartner ? (
                  <Text style={styles.muted}>
                    {data.sharedDays} shared days completed in the last 31 days
                    {data.connectedSince
                      ? ` · Connected since ${data.connectedSince.slice(0, 10)}`
                      : ''}
                  </Text>
                ) : null}
                <Text style={styles.section}>Manage connection</Text>
                {data.onLeaderboard ? (
                  <ManageRow
                    icon="award"
                    title="Remove from leaderboard"
                    detail="Stop appearing in each other’s rankings"
                    onPress={() => confirm('leaderboard')}
                    disabled={busy}
                  />
                ) : null}
                {data.isPartner ? (
                  <ManageRow
                    icon="user-minus"
                    title="End Partner mode"
                    detail="End shared tasks and delete shared photos"
                    onPress={() => confirm('partner')}
                    disabled={busy}
                  />
                ) : null}
                {data.isPartner && data.onLeaderboard ? (
                  <PrimaryButton
                    title="Remove from both"
                    variant="secondary"
                    onPress={() => confirm('both')}
                    loading={busy}
                  />
                ) : null}
              </>
            ) : null}
            {busy ? (
              <ActivityIndicator
                color={colors.gold}
                accessibilityLabel="Updating connection"
              />
            ) : null}
            {error ? (
              <View accessibilityLiveRegion="polite">
                <Text style={styles.muted}>{error}</Text>
                {!data ? (
                  <PrimaryButton
                    title="Try again"
                    onPress={() => setRetry(value => value + 1)}
                  />
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function ManageRow({
  icon,
  title,
  detail,
  onPress,
  disabled,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Feather name={icon} size={20} color={colors.inkMuted} />
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.inkMuted} />
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  heading: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  close: { padding: 12 },
  content: { paddingHorizontal: 22, gap: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: colors.gold, fontSize: 24, fontWeight: '700' },
  copy: { flex: 1, gap: 4 },
  name: { color: colors.ink, fontSize: 25, fontWeight: '700' },
  muted: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.panelRaised,
  },
  score: { color: colors.gold, fontSize: 30, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    color: colors.gold,
    backgroundColor: colors.panelRaised,
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
  },
  section: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
});
