import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function GymSetupDetails({ initial, onSave, busy }: { initial: Record<string, unknown>; onSave: (details: Record<string, string>) => void; busy: boolean }) {
  const [membership, setMembership] = useState(String(initial.gymMembership || ''));
  const [provider, setProvider] = useState(String(initial.gymMembershipProvider || ''));
  const [started, setStarted] = useState(String(initial.gymMembershipStart || ''));
  const [expires, setExpires] = useState(String(initial.gymMembershipExpiry || ''));
  const [error, setError] = useState('');
  const save = () => {
    const validDate = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
    if (!membership) { setError('Select your membership status.'); return; }
    if (!validDate(started) || !validDate(expires)) { setError('Enter dates as YYYY-MM-DD.'); return; }
    if (started && expires && expires < started) { setError('Expiry must be on or after the start date.'); return; }
    setError('');
    onSave({ gymMembership: membership, gymMembershipProvider: provider.trim(), gymMembershipStart: started, gymMembershipExpiry: expires });
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Gym subscription</Text>
    <View style={styles.options}>{['Active', 'Day pass', 'Not joined'].map(value => <TouchableOpacity key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: membership === value, disabled: busy }} onPress={() => setMembership(membership === value ? '' : value)} style={[styles.option, membership === value && styles.selected]}><Text style={styles.text}>{value}</Text></TouchableOpacity>)}</View>
    <TextInput accessibilityLabel="Membership plan or provider" placeholder="Plan or provider (optional)" placeholderTextColor={colors.inkSubtle} value={provider} onChangeText={setProvider} maxLength={80} editable={!busy} style={styles.input} />
    <Text style={styles.caption}>Start date (optional)</Text>
    <TextInput accessibilityLabel="Gym membership start date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSubtle} value={started} onChangeText={setStarted} maxLength={10} editable={!busy} style={styles.input} />
    <Text style={styles.caption}>Expiry date (optional)</Text>
    <TextInput accessibilityLabel="Gym membership expiry date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkSubtle} value={expires} onChangeText={setExpires} maxLength={10} editable={!busy} style={styles.input} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton title="Save details" loading={busy} onPress={save} />
  </View>;
}
const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.error },
  card: { padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.panel, marginBottom: 16 },
  title: { ...typography.bodyBold, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, selected: { borderColor: colors.goldMuted, backgroundColor: colors.accentFill },
  text: { ...typography.caption, color: colors.ink }, input: { ...typography.body, color: colors.ink, backgroundColor: colors.panelMuted, borderRadius: 10, padding: 12, minHeight: 48 },
});
