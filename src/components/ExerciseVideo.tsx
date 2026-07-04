import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { getYoutubeEmbedUrl } from '../utils/video';
import { colors } from '../theme/colors';

export function ExerciseVideo({ url }: { url: string }) {
  const embed = getYoutubeEmbedUrl(url);
  const [play, setPlay] = useState(false);

  if (!embed) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video available for this exercise</Text>
      </View>
    );
  }

  if (!play) {
    return (
      <TouchableOpacity style={styles.poster} activeOpacity={0.85} onPress={() => setPlay(true)}>
        <View style={styles.playButton}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
        <Text style={styles.posterText}>Tap to watch technique</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.videoWrap}>
      <WebView
        source={{ uri: embed }}
        style={styles.webview}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: colors.inkMuted },
  poster: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#0f2417',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: colors.white, fontSize: 22, marginLeft: 4 },
  posterText: { color: colors.white, marginTop: 12 },
  videoWrap: { height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
});
