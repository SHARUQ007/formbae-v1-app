import { ActivityIndicator, Dimensions, Text, View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { getYoutubeEmbedUrl } from '../utils/video';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const COMPACT_VIDEO_MAX_HEIGHT = Math.min(560, Math.round(Dimensions.get('window').height * 0.62));

function DirectExerciseVideo({ url, compact = false, style }: { url: string; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const embed = getYoutubeEmbedUrl(url);

  if (!embed) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video available for this exercise</Text>
      </View>
    );
  }

  const html = `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <style>
      html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    </style>
  </head>
  <body>
    <iframe
      src="${embed}"
      title="Workout technique video"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen>
    </iframe>
  </body>
</html>`;

  return (
    <View style={[styles.videoWrap, compact && styles.videoWrapCompact, style]}>
      <WebView
        source={{ html, baseUrl: 'https://formbae.in' }}
        style={styles.webview}
        originWhitelist={['https://*', 'http://*', 'about:blank']}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
        renderError={() => (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>Video could not load here</Text>
            <Text style={styles.retryText}>Swipe down for the next exercise.</Text>
          </View>
        )}
      />
    </View>
  );
}

export const ExerciseVideo = DirectExerciseVideo;

const styles = StyleSheet.create({
  placeholder: {
    height: 96,
    borderRadius: 26,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  placeholderText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  videoWrap: { width: '100%', aspectRatio: 9 / 16, borderRadius: 26, overflow: 'hidden', backgroundColor: '#000' },
  videoWrapCompact: { maxHeight: COMPACT_VIDEO_MAX_HEIGHT },
  webview: { flex: 1, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fallbackTitle: { ...typography.bodyBold, color: colors.white, textAlign: 'center', marginBottom: spacing.md },
  retryText: { ...typography.caption, color: colors.white, fontWeight: '800' },
});
