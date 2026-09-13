import { StableImage } from './StableImage';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SetupCompletedMark, SetupContinueArrow, SetupStepArtwork, type SetupArtworkKind } from './SetupStepArtwork';
import { ScreenContainer } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';

export type SetupStep = { title: string; detail: string; artwork: SetupArtworkKind; complete?: boolean; onChange?: () => void };

export function SetupOverview({ paid, steps, title, subtitle, action, onContinue, onLogout, busy, error }: {
  paid?: boolean; steps: SetupStep[]; title: string; subtitle: string; action: string;
  onContinue: () => void; onLogout: () => void; busy?: boolean; error?: string;
}) {
  const { height } = useWindowDimensions();
  const imageHeight = Math.min(180, Math.max(100, height * 0.18));

  return <ScreenContainer withBottomInset>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.artFrame, { height: imageHeight }]}>
          <StableImage source={require('../assets/editorial/accountability-plan.jpg')} style={styles.art} resizeMode="contain" accessible={false} accessibilityIgnoresInvertColors />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{paid ? 'YOUR MEMBERSHIP IS ACTIVE' : 'YOUR FIRST CHAPTER'}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <Text style={styles.section}>{paid ? 'Pick up where you left off' : 'A routine built around you'}</Text>
      <View style={styles.steps}>
        {steps.map((step, index) => <View key={step.title} style={[styles.step, index > 0 && styles.divider]}>
          <View style={styles.artwork}>
            <SetupStepArtwork kind={step.artwork} />
            {step.complete ? <View style={styles.completedMark}><SetupCompletedMark /></View> : null}
          </View>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.detail}>{step.complete ? 'Complete' : step.detail}</Text>
          </View>
          {step.onChange ? <TouchableOpacity onPress={step.onChange} disabled={busy} accessibilityRole="button" accessibilityLabel={`Change ${step.title.toLowerCase()}`} style={styles.changeButton}>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity> : <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>}
        </View>)}
      </View>
      {paid ? <Text style={styles.note}>Your payment is already taken care of. We’ll keep your completed steps saved.</Text> : null}
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton title={action} iconArtwork={<SetupContinueArrow />} iconPosition="trailing" onPress={onContinue} loading={busy} style={styles.cta} />
    <PrimaryButton title="Use another account" variant="ghost" size="sm" onPress={onLogout} disabled={busy} />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: 12 },
  hero: { flexGrow: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  // Keep native image dimensions out of layout; contain preserves the full photo.
  artFrame: { flexGrow: 1, width: '100%', overflow: 'hidden', backgroundColor: '#080807' },
  art: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  heroCopy: { padding: 14, gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: colors.gold },
  title: { fontSize: 26, lineHeight: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  section: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 14, marginBottom: 8 },
  steps: { borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  artwork: { width: 46, height: 46, flexShrink: 0, justifyContent: 'center', alignItems: 'center' },
  completedMark: { position: 'absolute', right: -2, bottom: -2 },
  copy: { flex: 1, gap: 3 },
  stepTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  changeButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 4 },
  changeText: { fontSize: 12, fontWeight: '700', color: colors.gold },
  number: { color: colors.inkSubtle, fontSize: 12 },
  note: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
  error: { color: colors.error, fontSize: 14, lineHeight: 20, marginBottom: 12 },
});
