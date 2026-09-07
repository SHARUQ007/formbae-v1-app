import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const brandMarkSource = require('../assets/formbae-mark-transparent.png');
const brandWordFontFamily = Platform.select({
  ios: 'AvenirNext-DemiBold',
  android: 'sans-serif-medium',
  default: 'sans-serif',
});
const brandAccentFontFamily = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-black',
  default: 'sans-serif',
});
const brandTaglineFontFamily = Platform.select({
  ios: 'AvenirNext-Medium',
  android: 'sans-serif-medium',
  default: 'sans-serif',
});

function brandMarkStyle(size: number) {
  const horizontalTrim = Math.max(1, Math.round(size * 0.05));
  const verticalNudge = Math.max(1, Math.round(size * 0.06));

  return {
    width: size,
    height: size,
    marginLeft: -horizontalTrim,
    marginRight: -horizontalTrim,
    transform: [{ translateY: -verticalNudge }],
  };
}

/** Horizontal FormBae lockup derived from the approved app-icon mark. */
export function Logo({ height = 34, showTagline = true }: { height?: number; showTagline?: boolean }) {
  // The source mark contains intentional transparent breathing room. Its
  // frame is slightly larger so the visible runner balances the wordmark.
  const markSize = Math.round(height * 1.18);
  const wordSize = Math.max(18, Math.round(height * 0.64));
  const taglineSize = Math.max(10, Math.round(height * 0.31));
  return (
    <View
      style={styles.logoRow}
      accessible
      accessibilityRole="image"
      accessibilityLabel="FormBae"
    >
      <Image
        source={brandMarkSource}
        resizeMode="contain"
        style={brandMarkStyle(markSize)}
        accessible={false}
        fadeDuration={0}
      />
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Text
          style={[styles.logoWord, { fontSize: wordSize, lineHeight: Math.round(wordSize * 1.08) }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
        >
          Form<Text style={styles.logoWordAccent}>Bae</Text>
        </Text>
        {showTagline ? (
          <Text
            style={[styles.logoTagline, { fontSize: taglineSize, lineHeight: Math.round(taglineSize * 1.25) }]}
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

/** Transparent mark for compact brand placements; the OS app icon is unchanged. */
export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <Image
      source={brandMarkSource}
      resizeMode="contain"
      style={brandMarkStyle(size)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="FormBae"
      fadeDuration={0}
    />
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logoWord: {
    fontFamily: brandWordFontFamily,
    color: colors.inkStrong,
    letterSpacing: -0.65,
    includeFontPadding: false,
  },
  logoWordAccent: {
    fontFamily: brandAccentFontFamily,
    color: colors.accent,
  },
  logoTagline: {
    fontFamily: brandTaglineFontFamily,
    color: colors.inkMuted,
    letterSpacing: 0.08,
    includeFontPadding: false,
    marginTop: 2,
  },
});
