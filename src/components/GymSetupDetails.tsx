import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { GymStartDatePicker } from './GymStartDatePicker';
import { formatMembershipDate, membershipExpiry, parseMembershipDate, parseMembershipMonths, savedMembershipMonths } from '../utils/gymMembership';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const DURATIONS = ['1', '3', '6', '12'];

export function GymSetupDetails({ initial, onSave, busy }: { initial: Record<string, unknown>; onSave: (details: Record<string, string>) => void; busy: boolean }) {
  const [membership, setMembership] = useState(String(initial.gymMembership || ''));
  const [provider, setProvider] = useState(String(initial.gymMembershipProvider || ''));
  const [started, setStarted] = useState(String(initial.gymMembershipStart || ''));
  const [months, setMonths] = useState(() => savedMembershipMonths(initial));
  const [custom, setCustom] = useState(() => Boolean(months && !DURATIONS.includes(months)));
  const [datesEdited, setDatesEdited] = useState(false);
  const [error, setError] = useState('');
  const joined = membership !== 'Not joined' && Boolean(membership);
  const dayPass = membership === 'Day pass';
  const duration = parseMembershipMonths(months);
  const oldExpiry = String(initial.gymMembershipExpiry || '');
  const preservedExpiry = !datesEdited && parseMembershipDate(oldExpiry) ? oldExpiry : '';
  const expires = !joined ? '' : dayPass ? started : duration ? membershipExpiry(started, duration) : preservedExpiry;
  const save = () => {
    if (busy) return;
    if (!membership) { setError('Select your membership status.'); return; }
    if (joined && !parseMembershipDate(started)) { setError('Choose your start date.'); return; }
    if (joined && !dayPass && !duration && !preservedExpiry) { setError('Choose a duration from 1 to 120 months.'); return; }
    if (joined && expires < started) { setError('Choose your subscription duration.'); return; }
    setError('');
    onSave({ gymMembership: membership, gymMembershipProvider: provider.trim(), gymMembershipStart: joined ? started : '', gymMembershipMonths: joined && !dayPass && duration ? String(duration) : '', gymMembershipExpiry: expires });
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Gym subscription</Text>
    <View style={styles.options}>{['Active', 'Day pass', 'Not joined'].map(value => <TouchableOpacity key={value} disabled={busy} accessibilityLabel={value} accessibilityRole="radio" accessibilityState={{ selected: membership === value, disabled: busy }} onPress={() => { setMembership(value); setError(''); }} style={[styles.option, membership === value && styles.selected]}><Text style={styles.text}>{value}</Text></TouchableOpacity>)}</View>
    {joined ? <>
      <TextInput accessibilityLabel="Membership plan or provider" placeholder="Plan or provider (optional)" placeholderTextColor={colors.inkSubtle} value={provider} onChangeText={setProvider} maxLength={80} editable={!busy} style={styles.input} />
      <View style={styles.fieldGroup}>
        <Text style={styles.caption}>{dayPass ? 'Visit date' : 'Start date'}</Text>
        <GymStartDatePicker value={started} label={dayPass ? 'Visit date' : 'Start date'} onChange={value => { if (value !== started) setDatesEdited(true); setStarted(value); setError(''); }} disabled={busy} />
      </View>
      {!dayPass ? <View style={styles.fieldGroup}>
        <Text style={styles.caption}>Duration</Text>
        <View style={styles.options}>{[...DURATIONS, 'Custom'].map(value => {
          const selected = value === 'Custom' ? custom : !custom && months === value;
          const label = value === 'Custom' ? value : `${value} ${value === '1' ? 'month' : 'months'}`;
          return <TouchableOpacity key={value} disabled={busy} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, disabled: busy }} onPress={() => { if (selected) return; setCustom(value === 'Custom'); setMonths(value === 'Custom' ? '' : value); setDatesEdited(true); setError(''); }} style={[styles.duration, selected && styles.selected]}><Text style={[styles.text, selected && styles.selectedText]}>{label}</Text></TouchableOpacity>;
        })}</View>
        {custom ? <View style={styles.customField}><TextInput accessibilityLabel="Subscription duration in months" placeholder="Number of months" placeholderTextColor={colors.inkSubtle} value={months} onChangeText={value => { setMonths(value); setDatesEdited(true); setError(''); }} keyboardType="number-pad" maxLength={3} editable={!busy} style={styles.monthInput} /><Text style={styles.caption}>months</Text></View> : null}
        {expires ? <Text style={styles.expiry}>Ends {formatMembershipDate(expires)}</Text> : null}
      </View> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton title="Save details" loading={busy} onPress={save} />
  </View>;
}
const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.error },
  card: { padding: 16, gap: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.panel, marginBottom: 16 },
  title: { ...typography.bodyBold, color: colors.ink }, caption: { ...typography.caption, color: colors.inkMuted }, fieldGroup: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, selected: { borderColor: colors.goldMuted, backgroundColor: colors.accentFill },
  text: { ...typography.caption, color: colors.ink }, input: { ...typography.body, color: colors.ink, backgroundColor: colors.panelMuted, borderRadius: 10, padding: 12, minHeight: 48 },
  duration: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, selectedText: { color: colors.gold }, expiry: { ...typography.caption, color: colors.inkMuted, paddingTop: 2 },
  customField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, backgroundColor: colors.panelMuted, borderRadius: 10 }, monthInput: { ...typography.body, color: colors.ink, flex: 1, minHeight: 48, padding: 12 },
});
