import { useState } from 'react';
import { ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { ScreenContainer, ScreenTitle, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { requestAccountDeletion } from '../../services/legalService';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';

export function DeleteAccountScreen() {
  const { logout } = useAuthStore();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This deactivates your account immediately and permanently deletes your personal data within 30 days. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: runDelete },
      ],
    );
  };

  const runDelete = async () => {
    setSubmitting(true);
    try {
      const res = await requestAccountDeletion(reason.trim() || undefined);
      Alert.alert('Account deletion requested', res.message, [{ text: 'OK', onPress: () => logout() }]);
    } catch (e) {
      Alert.alert('Could not process request', e instanceof Error ? e.message : 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <ScrollView>
          <ScreenTitle>Delete account</ScreenTitle>
          <Card>
            <Text style={styles.heading}>What happens when you delete</Text>
            <Bullet text="Your account is deactivated immediately and you are signed out." />
            <Bullet text="Your profile, questionnaire answers, progress logs, check-ins, and messages are permanently deleted within 30 days." />
            <Bullet text="Payment and invoice records may be retained where required by law or tax regulations." />
            <Bullet text="This action cannot be undone. You will need to sign up again to use FormBae." />
          </Card>

          <Card style={styles.reasonCard}>
            <Text style={styles.heading}>Anything we could have done better? (optional)</Text>
            <FormInput
              value={reason}
              onChangeText={setReason}
              placeholder="Your feedback helps us improve"
              multiline
              autoCapitalize="sentences"
            />
          </Card>

          <PrimaryButton title="Delete my account" onPress={confirmDelete} loading={submitting} style={styles.deleteBtn} />
          <Text style={styles.note}>Need help instead? Contact support from Profile → Legal & support.</Text>
        </ScrollView>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <Text style={styles.bullet}>
      {'\u2022'}  {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { fontWeight: '700', color: colors.ink, marginBottom: 10, fontSize: 15 },
  bullet: { color: colors.inkMuted, lineHeight: 22, marginBottom: 8 },
  reasonCard: { marginTop: 12 },
  deleteBtn: { marginTop: 16, backgroundColor: colors.error },
  note: { color: colors.inkMuted, fontSize: 13, textAlign: 'center', marginTop: 14 },
});
