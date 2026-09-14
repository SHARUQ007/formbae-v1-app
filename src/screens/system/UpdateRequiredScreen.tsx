import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { RequiredAppUpdate } from '../../services/appUpdateService';
import { colors } from '../../theme/colors';

export function UpdateRequiredScreen({ update, onCheckAgain }: { update: RequiredAppUpdate; onCheckAgain: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const openStore = async () => {
    setError('');
    try { await Linking.openURL(update.updateUrl); }
    catch { setError('The store could not be opened. Please update FormBae from your app store.'); }
  };
  const check = async () => {
    setChecking(true); setError('');
    try { await onCheckAgain(); }
    catch { setError('We couldn’t check the installed version. Try again in a moment.'); }
    finally { setChecking(false); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>FORMBAE UPDATE</Text>
        <View style={styles.artwork}>
          <Svg width="100%" height="100%" viewBox="0 0 260 220">
            <Circle cx="130" cy="108" r="92" fill="rgba(240,206,120,0.07)" stroke="rgba(240,206,120,0.20)" />
            <Rect x="82" y="29" width="96" height="164" rx="22" fill="#111217" stroke="#f0ce78" strokeWidth="2" />
            <Rect x="94" y="48" width="72" height="116" rx="13" fill="#1d1e24" />
            <Path d="M130 132V76M110 96l20-20 20 20" fill="none" stroke="#f0ce78" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M112 177h36" stroke="rgba(255,255,255,0.55)" strokeWidth="4" strokeLinecap="round" />
            <Circle cx="58" cy="67" r="5" fill="#f0ce78" /><Circle cx="199" cy="146" r="3" fill="#fff" opacity=".65" />
          </Svg>
        </View>
        <Text style={styles.title}>{update.title}</Text>
        <Text style={styles.message}>{update.message}</Text>
        <View style={styles.versionRow}>
          <View><Text style={styles.versionLabel}>Installed</Text><Text style={styles.versionValue}>{update.currentVersion}</Text></View>
          <PathArrow />
          <View style={styles.versionRight}><Text style={styles.versionLabel}>Required</Text><Text style={[styles.versionValue, styles.requiredVersion]}>{update.minimumVersion}</Text></View>
        </View>
      </View>
      <View style={styles.actions}>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton title="Update FormBae" onPress={openStore} />
        <Text onPress={check} accessibilityRole="button" style={styles.retry}>{checking ? 'Checking…' : 'I’ve updated · Check again'}</Text>
      </View>
    </View>
  );
}

function PathArrow() {
  return <Svg width={42} height={18} viewBox="0 0 42 18"><Path d="M2 9h36M31 3l7 6-7 6" fill="none" stroke={colors.inkSubtle} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', backgroundColor: colors.bg, paddingHorizontal: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.gold, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 2.2 },
  artwork: { width: 260, height: 220, marginTop: 12 },
  title: { maxWidth: 360, color: colors.ink, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  message: { maxWidth: 360, color: colors.inkMuted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  versionRow: { width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 16, marginTop: 28 },
  versionRight: { alignItems: 'flex-end' },
  versionLabel: { color: colors.inkSubtle, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  versionValue: { color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 4 },
  requiredVersion: { color: colors.gold },
  actions: { gap: 14, paddingTop: 16 },
  retry: { color: colors.inkMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  error: { color: colors.error, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
