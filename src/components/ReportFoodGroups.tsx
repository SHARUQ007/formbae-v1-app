import { colors } from '../theme/colors';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ReportIllustration } from './ReportIllustration';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';

type FoodGroup = { key?: string; label?: string; status?: string; observedFoods?: unknown[] };
const foodKinds: Record<string, ReportIllustrationKind> = {
  vegetables: 'vegetables', fruit: 'fruit', pulses: 'pulses', protein: 'protein',
  wholeGrains: 'wholeGrains', dairy: 'dairy', nutsSeeds: 'nutsSeeds',
};

export function ReportFoodGroups({ groups, reportKey, dietPreference }: { groups: FoodGroup[]; reportKey: string; dietPreference?: string }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.4;
  return <View style={styles.section} testID="report-food-groups">
    <Text style={styles.title} accessibilityRole="header">Foods named in your diary</Text>
    <Text style={styles.intro}>Named foods, not portions or complete intake.</Text>
    <View style={styles.list}>
      {groups.map((group, index) => {
        const seen = new Set<string>();
        const foods = (Array.isArray(group.observedFoods) ? group.observedFoods : []).filter((food): food is string => {
          if (typeof food !== 'string' || !food.trim() || seen.has(food.trim().toLocaleLowerCase())) return false;
          seen.add(food.trim().toLocaleLowerCase());
          return true;
        }).map(food => food.trim());
        const label = group.key === 'wholeGrains' ? 'Grain foods described' : group.label || 'Food group';
        const qualifier = group.key === 'wholeGrains' && foods.some(food => /multi.?grain|roti|bread|rice|pasta/i.test(food) && !/whole.?grain|whole.?wheat|brown rice/i.test(food))
          ? 'Whole-grain content is unconfirmed for foods without ingredient details.'
          : group.key === 'fruit' && foods.length > 0 && foods.every(food => /juice/i.test(food))
            ? 'Juice is named here; whole fruit is not described.' : '';
        const status = foods.length ? 'Named in diary' : group.status === 'notSeen' ? 'Not described' : 'Not enough detail';
        const kind = Object.hasOwn(foodKinds, group.key || '') ? foodKinds[group.key!] : 'coverageMeals';
        return <View key={`${group.key}-${index}`} style={styles.row} accessible
          accessibilityLabel={`${label}. ${status}.${foods.length ? ` ${foods.join(', ')}.` : ''}${qualifier ? ` ${qualifier}` : ''}`}>
          {kind ? <View style={[styles.illustration, compact && styles.illustrationCompact, !foods.length && styles.illustrationMuted]}>
            <ReportIllustration kind={kind} size={compact ? 48 : 68} reportKey={reportKey} dietPreference={dietPreference} />
          </View> : null}
          <View style={styles.copy}>
            <View style={styles.headingRow}>
              <Text style={styles.label}>{label}</Text>
              {foods.length && !compact ? <Text style={styles.count} accessible={false}>{foods.length} named</Text> : null}
            </View>
            {foods.length ? <View style={styles.tags}>{foods.map(food => <View key={food.toLocaleLowerCase()} style={styles.tag}>
              <Text style={styles.food}>{food}</Text>
            </View>)}</View> : <Text style={styles.empty}>{status}</Text>}
            {qualifier ? <Text style={styles.qualifier}>{qualifier}</Text> : null}
          </View>
        </View>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '700', color: colors.ink },
  intro: { fontSize: 13, lineHeight: 20, color: colors.inkMuted, marginTop: 6, marginBottom: 20 },
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  illustration: { width: 76, height: 80, backgroundColor: colors.panel, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  illustrationCompact: { width: 52, height: 58, borderRadius: 12 },
  illustrationMuted: { opacity: 0.5, backgroundColor: colors.panel },
  copy: { flex: 1, minWidth: 0, paddingTop: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  label: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.ink },
  count: { fontSize: 12, lineHeight: 23, color: colors.inkMuted, fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.panelMuted },
  food: { fontSize: 13, lineHeight: 19, color: colors.ink },
  empty: { fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  qualifier: { fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 10 },
});
