import { useState } from 'react';
import { ScrollView, Text, StyleSheet, View, Alert } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer, Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { requestAccountDeletion } from '../../services/legalService';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';

export function DeleteAccountScreen() {
  const { logout } = useAuthStore();
  const tabBarHeight = useBottomTabBarHeight();
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

  // Each consequence carries its own icon so the list reads at a glance.
  const points = [
    { icon: 'log-out', text: 'Your account is deactivated immediately and you are signed out.' },
    { icon: 'trash-2', text: 'Your profile, questionnaire answers, progress logs, check-ins and messages are permanently deleted within 30 days.' },
    { icon: 'file-text', text: 'Payment and invoice records may be retained where required by law or tax regulations.' },
    { icon: 'alert-circle', text: 'This action cannot be undone. You will need to sign up again to use FormBae.' },
  ];

  return (
    <KeyboardScreen>
      <ScreenContainer>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        >
          <Card variant="outline" style={styles.warnCard}>
            <View style={styles.warnHeader}>
              <View style={styles.warnIcon}>
                <Feather name="alert-triangle" size={20} color={colors.error} />
              </View>
              <Text style={styles.warnTitle}>What happens when you delete</Text>
            </View>
            {points.map((point) => (
              <View key={point.text} style={styles.point}>
                <View style={styles.pointIcon}>
                  <Feather name={point.icon} size={15} color={colors.error} />
                </View>
                <Text style={styles.pointText}>{point.text}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.reasonCard}>
            <Text style={styles.heading}>Anything we could have done better?</Text>
            <Text style={styles.optional}>Optional — your feedback helps us improve.</Text>
            <FormInput value={reason} onChangeText={setReason} placeholder="Share your feedback" multiline autoCapitalize="sentences" />
          </Card>

          <PrimaryButton title="Delete my account" icon="trash-2" variant="danger" onPress={confirmDelete} loading={submitting} style={styles.deleteBtn} />
          <Text style={styles.note}>Need help instead? Contact support from Profile → Legal &amp; support.</Text>
        </ScrollView>
      </ScreenContainer>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },

  warnCard: { borderColor: '#f6caca' },
  warnHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  warnIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.errorLight, alignItems: 'center', justifyContent: 'center' },
  warnTitle: { ...typography.subtitle, color: colors.ink, flex: 1 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  pointIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorLight,
    flexShrink: 0,
  },
  pointText: { ...typography.body, color: colors.inkMuted, flex: 1, lineHeight: 22, paddingTop: 3 },
  reasonCard: { marginTop: spacing.md },
  heading: { ...typography.bodyBold, color: colors.ink },
  optional: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm, marginTop: 2 },
  deleteBtn: { marginTop: spacing.lg },
  note: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.md },
});
