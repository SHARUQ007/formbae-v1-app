import { useState } from 'react';
import { ActivityIndicator, Dimensions, ImageBackground, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { getYoutubeEmbedUrl, getYoutubeThumbnailUrl } from '../utils/video';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const COMPACT_VIDEO_MAX_HEIGHT = Math.min(560, Math.round(Dimensions.get('window').height * 0.62));

export function ExerciseVideo({ url, compact = false }: { url: string; compact?: boolean }) {
  const embed = getYoutubeEmbedUrl(url);
  const thumbnail = getYoutubeThumbnailUrl(url);
  const [play, setPlay] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!embed) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video available for this exercise</Text>
      </View>
    );
  }

  if (!play || failed) {
    return (
      <ImageBackground source={thumbnail ? { uri: thumbnail } : undefined} style={[styles.poster, compact && styles.posterCompact]} imageStyle={styles.posterImage}>
        <View style={styles.scrim} />
        <View style={styles.playButton}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
        <Text style={styles.posterText}>{failed ? 'Video could not load here' : 'Tap to watch technique'}</Text>
        <View style={styles.posterActions}>
          <TouchableOpacity
            style={styles.posterAction}
            activeOpacity={0.85}
            onPress={() => {
              setFailed(false);
              setPlay(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Play technique video"
          >
            <Text style={styles.posterActionText}>{failed ? 'Try again' : 'Play'}</Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>
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
    <View style={[styles.videoWrap, compact && styles.videoWrapCompact]}>
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
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
      <TouchableOpacity style={styles.closeButton} onPress={() => setPlay(false)} accessibilityRole="button" accessibilityLabel="Close video">
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  placeholderText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  poster: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    backgroundColor: '#0f2417',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: spacing.md,
  },
  posterCompact: {
    maxHeight: COMPACT_VIDEO_MAX_HEIGHT,
  },
  posterImage: { borderRadius: radius.lg },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.48)' },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: colors.white, fontSize: 22, marginLeft: 4 },
  posterText: { ...typography.bodyBold, color: colors.white, marginTop: 12, textAlign: 'center' },
  posterActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  posterAction: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  posterActionText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  videoWrap: { width: '100%', aspectRatio: 9 / 16, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  videoWrapCompact: { maxHeight: COMPACT_VIDEO_MAX_HEIGHT },
  webview: { flex: 1, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.white, fontSize: 24, lineHeight: 28 },
});
