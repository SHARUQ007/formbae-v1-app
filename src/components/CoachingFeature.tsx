import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { StableImage } from './StableImage';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

const COACH_DISCOVERY_ART = require('../assets/editorial/coach-discovery.jpg');

export function CoachingFeature({ onPress, showHeader = true }: { onPress: () => void; showHeader?: boolean }) {
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.2;
  const expandedHero = viewportWidth < 380;

  return (
    <View style={styles.coachingFeatureSection}>
      {showHeader ? <View style={[styles.coachingFeatureHeader, largeText && styles.coachingFeatureHeaderLargeText]}>
        <View style={styles.coachingFeatureHeaderCopy}>
          <Text style={styles.coachingFeatureTitle} accessibilityRole="header">Coaching</Text>
          <Text style={styles.coachingFeatureSubtitle}>Guidance that fits how you train</Text>
        </View>
        <TouchableOpacity
          onPress={onPress}
          style={styles.coachingFeatureSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all coaches"
        >
          <Text style={styles.coachingFeatureSeeAllText}>See all</Text>
          <Feather name="chevron-right" size={17} color={colors.ink} />
        </TouchableOpacity>
      </View> : null}

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={[
          styles.coachingFeatureHero,
          expandedHero && styles.coachingFeatureHeroExpanded,
          largeText && styles.coachingFeatureHeroLargeText,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Explore coaching options"
        accessibilityHint="Opens coach selection"
      >
        {largeText ? (
          <>
            <View style={styles.coachingFeatureImageStage}>
              <StableImage source={COACH_DISCOVERY_ART} style={styles.coachingFeatureImageFlow} resizeMode="cover" accessible={false} />
            </View>
            <View style={styles.coachingFeatureCopyFlow}>
              <Text style={styles.coachingFeatureKicker}>Meet your match</Text>
              <Text style={styles.coachingFeatureHeroTitle}>Train with the right support</Text>
              <View style={styles.coachingFeatureAction}>
                <Text style={styles.coachingFeatureActionText}>Explore coaches</Text>
                <Feather name="arrow-right" size={16} color={colors.onPrimary} />
              </View>
            </View>
          </>
        ) : (
          <>
            <StableImage source={COACH_DISCOVERY_ART} style={styles.coachingFeatureImage} resizeMode="cover" accessible={false} />
            <View style={[styles.coachingFeatureShade, expandedHero && styles.coachingFeatureShadeExpanded]} />
            <View style={[styles.coachingFeatureCopy, expandedHero && styles.coachingFeatureCopyExpanded]}>
              <Text style={styles.coachingFeatureKicker}>Meet your match</Text>
              <Text style={styles.coachingFeatureHeroTitle}>Train with the right support</Text>
              <View style={styles.coachingFeatureAction}>
                <Text style={styles.coachingFeatureActionText}>Explore coaches</Text>
                <Feather name="arrow-right" size={16} color={colors.onPrimary} />
              </View>
            </View>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  coachingFeatureSection: { marginTop: spacing.xl + spacing.sm },
  coachingFeatureHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  coachingFeatureHeaderLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  coachingFeatureHeaderCopy: { flex: 1, minWidth: 0 },
  coachingFeatureTitle: { ...typography.title, color: colors.ink },
  coachingFeatureSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  coachingFeatureSeeAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: spacing.sm },
  coachingFeatureSeeAllText: { ...typography.caption, color: colors.ink, fontWeight: '800' },
  coachingFeatureHero: { height: 218, overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel },
  coachingFeatureHeroExpanded: { height: 260 },
  coachingFeatureHeroLargeText: { height: 'auto' },
  coachingFeatureImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  coachingFeatureImageStage: { height: 180, overflow: 'hidden', backgroundColor: colors.panelMuted },
  coachingFeatureImageFlow: { width: '100%', height: '100%' },
  coachingFeatureShade: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '61%', backgroundColor: 'rgba(5,6,10,0.78)' },
  coachingFeatureShadeExpanded: { width: '78%' },
  coachingFeatureCopy: { width: '58%', height: '100%', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  coachingFeatureCopyExpanded: { width: '76%', paddingHorizontal: spacing.lg },
  coachingFeatureCopyFlow: { padding: spacing.lg, backgroundColor: colors.panel },
  coachingFeatureKicker: { ...typography.overline, color: colors.gold, textTransform: 'uppercase' },
  coachingFeatureHeroTitle: { fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.45, color: colors.inkStrong, marginTop: spacing.xs },
  coachingFeatureAction: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primaryAction, paddingHorizontal: spacing.md, marginTop: spacing.md },
  coachingFeatureActionText: { ...typography.caption, color: colors.onPrimary, fontWeight: '900' },
});
