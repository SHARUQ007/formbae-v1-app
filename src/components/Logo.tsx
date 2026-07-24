import { View, Image, Text, StyleSheet, ImageStyle } from 'react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';

import markSource from '../assets/icon-mark.png';

/** Full horizontal wordmark (icon + "FormBae"). */
export function Logo({ height = 34 }: { height?: number }) {
  const markSize = Math.round(height * 1.35);
  return (
    <View style={styles.logoRow}>
      <Image source={markSource} resizeMode="contain" style={{ width: markSize, height: markSize, borderRadius: markSize * 0.22 }} />
      <View>
        <Text style={[styles.logoWord, { fontSize: Math.max(18, Math.round(height * 0.56)) }]}>FormBae</Text>
        <Text style={[styles.logoTagline, { fontSize: Math.max(10, Math.round(height * 0.32)) }]}>Train better form</Text>
      </View>
    </View>
  );
}

/** Square brand badge (icon mark on gradient), optionally with wordmark text below. */
export function LogoMark({ size = 64, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <Image
      source={markSource}
      style={[
        { width: size, height: size },
        rounded && { borderRadius: size * 0.22 },
        shadows.md as ImageStyle,
      ]}
    />
  );
}

/** Stacked lockup: badge + wordmark text, for splash / hero. */
export function BrandLockup({ size = 76 }: { size?: number }) {
  return (
    <View style={styles.lockup}>
      <LogoMark size={size} />
      <Text style={styles.word}>
        Form<Text style={styles.wordAccent}>Bae</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWord: { fontWeight: '800', color: colors.ink, letterSpacing: -0.2, lineHeight: 22 },
  logoTagline: { color: colors.inkMuted, marginTop: 1 },
  lockup: { alignItems: 'center', gap: 14 },
  word: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  wordAccent: { color: colors.accent },
});
