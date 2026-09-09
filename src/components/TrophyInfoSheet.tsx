import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { TrophySummary } from '../types/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ReportIllustration } from './ReportIllustration';
import { TrophyIllustration } from './TrophyIllustration';

const RULES = [
  { label: 'Workout completed', value: '+10', kind: 'training' },
  { label: 'Food logged', value: '+1', kind: 'diaryCapture' },
  { label: 'Missed workout', value: '−3', kind: 'coverageDays' },
  { label: '3 missed food logs', value: '−1', kind: 'diaryCapture' },
  { label: 'Keep your streak', value: 'Bonus', kind: 'streak' },
] as const;

type Score = Pick<TrophySummary, 'score' | 'safeZone' | 'nextMilestone' | 'pointsToNext'>;
export function TrophyInfoSheet({ visible, trophy, onClose }: { visible: boolean; trophy: Score; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const band = Math.max(1, trophy.nextMilestone - trophy.safeZone);
  const progress = Math.max(0, Math.min(1, (trophy.score - trophy.safeZone) / band));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12 }]}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>YOUR EVERYDAY EFFORT</Text>
            <Text style={styles.title} accessibilityRole="header">How trophies work</Text>
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close trophy information">
            <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}><Path d="m6 6 12 12M6 18 18 6" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" /></Svg>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeading}>
              <View style={styles.scoreCopy}>
                <Text style={styles.label}>Your score</Text>
                <View style={styles.scoreLine}><Text style={styles.score}>{trophy.score}</Text><Text style={styles.unit}>trophies</Text></View>
              </View>
              <TrophyIllustration size={compact ? 56 : 68} />
            </View>
            <View style={styles.milestones}>
              <View style={styles.milestone}><Text style={styles.label}>Current safe zone</Text><Text style={styles.milestoneValue}>{trophy.safeZone}</Text></View>
              <View style={[styles.milestone, styles.nextMilestone]}><Text style={styles.label}>Next safe zone</Text><Text style={styles.milestoneValue}>{trophy.nextMilestone}</Text></View>
            </View>
          </View>

          <Text style={styles.sectionTitle} accessibilityRole="header">How your score changes</Text>
          <View style={styles.rules}>
            {RULES.map((rule, index) => <View key={rule.label} style={[styles.rule, index > 0 && styles.ruleDivider]}>
              {rule.kind === 'streak' ? <TrophyIllustration kind="streak" size={36} /> : <ReportIllustration kind={rule.kind} size={36} />}
              <View style={styles.ruleCopy}>
                <Text style={styles.ruleTitle}>{rule.label}</Text>
                {compact ? <Text style={[styles.ruleValue, styles.compactValue, rule.value.startsWith('−') && styles.deduction]}>{rule.value}</Text> : null}
              </View>
              {!compact ? <Text style={[styles.ruleValue, rule.value.startsWith('−') && styles.deduction]}>{rule.value}</Text> : null}
            </View>)}
          </View>

          <View style={styles.safeZone}>
            <View style={styles.safeHeading}><TrophyIllustration kind="shield" size={36} /><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>Your next milestone</Text><Text style={styles.ruleDetail}>A safe zone every 25 trophies</Text></View></View>
            <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityLabel="Progress to next safe zone" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: `${trophy.pointsToNext} trophies to ${trophy.nextMilestone}` }}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.remaining}><Text style={styles.remainingNumber}>{trophy.pointsToNext}</Text> trophies to your next safe zone</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { maxHeight: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.panel, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { ...typography.overline, fontSize: 9, color: colors.inkMuted },
  title: { ...typography.title, fontSize: 20, color: colors.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  scoreCard: { padding: 16, backgroundColor: colors.bg, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  scoreHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreCopy: { flex: 1, minWidth: 0 },
  label: { ...typography.caption, color: colors.inkMuted },
  scoreLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 7 },
  score: { fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1, color: colors.gold },
  unit: { ...typography.caption, color: colors.inkMuted },
  milestones: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  milestone: { flex: 1, minWidth: 0, gap: 5 },
  nextMilestone: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: colors.border },
  milestoneValue: { ...typography.subtitle, color: colors.ink, fontVariant: ['tabular-nums'] },
  sectionTitle: { ...typography.label, color: colors.inkMuted, marginTop: 2 },
  rules: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, backgroundColor: colors.panelMuted },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  ruleDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  ruleCopy: { flex: 1, minWidth: 0, gap: 2 },
  ruleTitle: { ...typography.label, color: colors.ink },
  ruleDetail: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  ruleValue: { ...typography.title, fontSize: 21, color: colors.gold, fontVariant: ['tabular-nums'] },
  compactValue: { fontSize: 18, marginTop: 4 },
  deduction: { color: colors.inkMuted },
  safeZone: { padding: 14, borderRadius: 18, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  safeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.panelRaised, marginTop: 14 },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.gold },
  remaining: { ...typography.caption, color: colors.inkMuted, marginTop: 10 },
  remainingNumber: { color: colors.gold, fontWeight: '700' },
});
