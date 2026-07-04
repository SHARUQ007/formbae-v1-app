import { ScrollView, Text, StyleSheet, View, Linking, Alert } from 'react-native';
import { ScreenContainer, Card, SectionTitle } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { Divider } from '../../components/Divider';
import { LoadingState, ErrorState } from '../../components/States';
import { useAsync } from '../../hooks/useAsync';
import { fetchLegal } from '../../services/legalService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer>
        <ErrorState message={error || 'Could not load legal links.'} onRetry={reload} />
      </ScreenContainer>
    );
  }

  const links: Array<{ label: string; url: string; icon: string }> = [
    { label: 'Privacy Policy', url: data.privacyPolicyUrl, icon: 'shield' },
    { label: 'Terms of Use', url: data.termsUrl, icon: 'file-text' },
    { label: 'Refund Policy', url: data.refundPolicyUrl, icon: 'credit-card' },
    { label: 'Help & Support', url: data.supportUrl, icon: 'help-circle' },
  ];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionTitle>Documents</SectionTitle>
        <Card>
          {links.map((link, index) => (
            <View key={link.label}>
              {index > 0 ? <Divider inset={54} /> : null}
              <ListRow icon={link.icon} label={link.label} onPress={() => openUrl(link.url)} />
            </View>
          ))}
        </Card>

        <SectionTitle>Contact</SectionTitle>
        <Card>
          <ListRow icon="mail" label="Email support" value={data.supportEmail} onPress={() => openUrl(`mailto:${data.supportEmail}`)} showChevron={false} />
        </Card>

        <Card variant="accent" style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Health & fitness disclaimer</Text>
          <Text style={styles.disclaimerText}>{data.fitnessDisclaimer}</Text>
        </Card>

        <Text style={styles.footer}>FormBae · Made for your fitness journey</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  disclaimerCard: { marginTop: spacing.lg },
  disclaimerTitle: { ...typography.bodyBold, color: colors.accentDarker, marginBottom: 6 },
  disclaimerText: { ...typography.body, color: colors.accentDarker },
  footer: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.lg },
});
