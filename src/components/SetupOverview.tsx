import { StableImage } from './StableImage';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { ScreenContainer } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';

export type SetupStep = { title: string; detail: string; icon: string; complete?: boolean; onChange?: () => void };

export function SetupOverview({ paid, steps, title, subtitle, action, onContinue, onLogout, busy, error }: {
  paid?: boolean; steps: SetupStep[]; title: string; subtitle: string; action: string;
  onContinue: () => void; onLogout: () => void; busy?: boolean; error?: string;
}) {
  return <ScreenContainer withBottomInset>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <StableImage source={require('../assets/editorial/accountability-plan.jpg')} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{paid ? 'YOUR MEMBERSHIP IS ACTIVE' : 'YOUR FIRST CHAPTER'}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <Text style={styles.section}>{paid ? 'Pick up where you left off' : 'A routine built around you'}</Text>
      <View style={styles.steps}>
        {steps.map((step, index) => <View key={step.title} style={[styles.step, index > 0 && styles.divider]}>
          <View style={[styles.icon, step.complete && styles.complete]}>
            <Feather name={step.complete ? 'check' : step.icon} size={21} color={colors.gold} />
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
      <Text style={styles.note}>{paid ? 'Your payment is already taken care of. We’ll keep your completed steps saved.' : 'Start with a few questions. Explore your assessment before choosing a membership.'}</Text>
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton title={action} icon="arrow-right" iconPosition="trailing" onPress={onContinue} loading={busy} style={styles.cta} />
    <PrimaryButton title="Use another account" variant="ghost" onPress={onLogout} disabled={busy} />
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  hero: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  art: { width: '100%', height: 150 },
  heroCopy: { padding: 20, gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: colors.gold },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.inkMuted },
  section: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 24, marginBottom: 12 },
  steps: { borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panelRaised, justifyContent: 'center', alignItems: 'center' },
  complete: { backgroundColor: colors.accentFill },
  copy: { flex: 1, gap: 4 },
  stepTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  changeButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 4 },
  changeText: { fontSize: 12, fontWeight: '700', color: colors.gold },
  number: { color: colors.inkSubtle, fontSize: 12 },
  note: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  cta: { backgroundColor: colors.gold, borderColor: colors.gold },
  error: { color: colors.error, fontSize: 14, lineHeight: 20, marginBottom: 12 },
});
