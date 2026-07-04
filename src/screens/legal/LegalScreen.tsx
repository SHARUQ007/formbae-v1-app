import { ScrollView, Text, StyleSheet, TouchableOpacity, View, Linking, Alert } from 'react-native';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchLegal } from '../../services/legalService';
import { colors } from '../../theme/colors';

async function openUrl(url: string) {
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) throw new Error('cannot open');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open link', url);
  }
}

export function LegalScreen() {
  const { data, loading, error, reload } = useAsync(() => fetchLegal());

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenTitle>Legal & support</ScreenTitle>
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ScreenTitle>Legal & support</ScreenTitle>
        <ErrorState message={error || 'Could not load legal links.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const links: Array<{ label: string; url: string }> = [
    { label: 'Privacy Policy', url: data.privacyPolicyUrl },
    { label: 'Terms of Use', url: data.termsUrl },
    { label: 'Refund Policy', url: data.refundPolicyUrl },
    { label: 'Help & Support', url: data.supportUrl },
  ];

  return (
    <ScreenContainer>
      <ScrollView>
        <ScreenTitle>Legal & support</ScreenTitle>
        <Card>
          {links.map((link, index) => (
            <TouchableOpacity
              key={link.label}
              style={[styles.linkRow, index < links.length - 1 && styles.linkDivider]}
              onPress={() => openUrl(link.url)}
              accessibilityRole="link"
              accessibilityLabel={`Open ${link.label}`}
            >
              <Text style={styles.linkLabel}>{link.label}</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => openUrl(`mailto:${data.supportEmail}`)}
            accessibilityRole="link"
            accessibilityLabel={`Email support at ${data.supportEmail}`}
          >
            <Text style={styles.linkLabel}>Email support</Text>
            <Text style={styles.email}>{data.supportEmail}</Text>
          </TouchableOpacity>
        </Card>

        <Card style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Health & fitness disclaimer</Text>
          <Text style={styles.disclaimerText}>{data.fitnessDisclaimer}</Text>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>FormBae · Made for your fitness journey</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, minHeight: 48 },
  linkDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  linkLabel: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  chevron: { fontSize: 22, color: colors.inkMuted },
  email: { color: colors.accent },
  disclaimerCard: { marginTop: 12, backgroundColor: colors.accentLight },
  disclaimerTitle: { fontWeight: '700', color: colors.ink, marginBottom: 6 },
  disclaimerText: { color: colors.inkMuted, lineHeight: 21 },
  footer: { alignItems: 'center', marginTop: 24 },
  footerText: { color: colors.inkMuted, fontSize: 13 },
});
