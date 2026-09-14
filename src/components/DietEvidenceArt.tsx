import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

/**
 * A diary filling up with meal notes: what the report is waiting for. Sized to whatever
 * space is left, so the page has no dead area under the evidence card.
 */
export function DietEvidenceArt({ filled = 0 }: { filled?: number }) {
  // Three notes on the page; they ink in as the evidence score climbs.
  const written = Math.max(0, Math.min(3, Math.round(filled * 3)));
  const noteOpacity = (index: number) => (index < written ? 1 : 0.28);

  return (
    <View style={styles.wrap} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 260 200" preserveAspectRatio="xMidYMid meet">
        <G opacity={0.9}>
          {/* the page */}
          <Rect x="46" y="18" width="130" height="158" rx="14" fill={colors.panel} stroke={colors.border} strokeWidth="2" />
          <Path d="M70 18v158" stroke={colors.border} strokeWidth="1.5" strokeDasharray="4 6" />
          <Circle cx="58" cy="34" r="2.4" fill={colors.goldMuted} />
          <Circle cx="58" cy="50" r="2.4" fill={colors.goldMuted} />

          {/* meal notes, inking in */}
          <G opacity={noteOpacity(0)}>
            <Rect x="84" y="40" width="74" height="8" rx="4" fill={colors.accent} />
            <Rect x="84" y="54" width="46" height="6" rx="3" fill={colors.goldMuted} />
          </G>
          <G opacity={noteOpacity(1)}>
            <Rect x="84" y="80" width="62" height="8" rx="4" fill={colors.accent} />
            <Rect x="84" y="94" width="52" height="6" rx="3" fill={colors.goldMuted} />
          </G>
          <G opacity={noteOpacity(2)}>
            <Rect x="84" y="120" width="70" height="8" rx="4" fill={colors.accent} />
            <Rect x="84" y="134" width="38" height="6" rx="3" fill={colors.goldMuted} />
          </G>

          {/* a plate, because these are meals */}
          <Circle cx="206" cy="72" r="30" fill={colors.panelRaised} stroke={colors.goldMuted} strokeWidth="2" />
          <Circle cx="206" cy="72" r="18" fill="none" stroke={colors.border} strokeWidth="1.5" />
          <Path d="M206 54a18 18 0 0 1 0 36z" fill={colors.accentLight} />

          {/* and the pen doing the work */}
          <G>
            <Path d="M196 150l30-30 10 10-30 30-13 3z" fill={colors.panelRaised} stroke={colors.accent} strokeWidth="2" strokeLinejoin="round" />
            <Path d="M226 120l10 10" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" />
            <Path d="M193 163l7-2-5-5z" fill={colors.accent} />
          </G>

          <Path d="M34 96l1.8 4 4 1.8-4 1.8-1.8 4-1.8-4-4-1.8 4-1.8L34 96z" fill={colors.goldMuted} />
          <Circle cx="228" cy="170" r="2.5" fill={colors.goldMuted} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 150, alignSelf: 'stretch', marginTop: 8 },
});
