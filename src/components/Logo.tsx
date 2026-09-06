import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const appIconSource = require('../assets/app-icon.png');

function appIconStyle(size: number, rounded = true) {
  return { width: size, height: size, borderRadius: rounded ? size * 0.225 : 0 };
}

/** Horizontal FormBae lockup using the exact shipped app icon. */
export function Logo({ height = 34, showTagline = true }: { height?: number; showTagline?: boolean }) {
  const markSize = Math.round(height * 1.35);
  const wordSize = Math.max(18, Math.round(height * 0.56));
  return (
    <View
      style={styles.logoRow}
      accessible
      accessibilityRole="image"
      accessibilityLabel="FormBae"
    >
      <Image
        source={appIconSource}
        resizeMode="cover"
        style={appIconStyle(markSize)}
        accessible={false}
        fadeDuration={0}
      />
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Text
          style={[styles.logoWord, { fontSize: wordSize, lineHeight: Math.round(wordSize * 1.16) }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          FormBae
        </Text>
        {showTagline ? (
          <Text
            style={[styles.logoTagline, { fontSize: Math.max(10, Math.round(height * 0.32)) }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            Train better form
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The exact app icon for square brand placements. */
export function LogoMark({ size = 64, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <Image
      source={appIconSource}
      resizeMode="cover"
      style={appIconStyle(size, rounded)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="FormBae"
      fadeDuration={0}
    />
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWord: { fontWeight: '700', color: colors.ink, letterSpacing: -0.35 },
  logoTagline: { color: colors.inkMuted, marginTop: 1 },
});
