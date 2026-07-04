import { View, Image, Text, StyleSheet, ImageStyle } from 'react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';

import markSource from '../assets/icon-mark.png';
import logoSource from '../assets/logo.png';

/** Full horizontal wordmark (icon + "FormBae"). */
export function Logo({ height = 34 }: { height?: number }) {
  return <Image source={logoSource} resizeMode="contain" style={{ height, width: height * 3 }} />;
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
  lockup: { alignItems: 'center', gap: 14 },
  word: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  wordAccent: { color: colors.accent },
});
