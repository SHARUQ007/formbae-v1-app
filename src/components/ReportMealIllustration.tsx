import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { ReportIllustration } from './ReportIllustration';
import type { ReportIllustrationKind } from '../utils/reportIllustrationCatalog';

const mealArt: Record<string, ReportIllustrationKind> = {
  breakfast: 'mealBreakfast', morning: 'mealBreakfast',
  lunch: 'mealLunch', afternoon: 'mealLunch',
  evening: 'mealEvening', snack: 'mealEvening',
  dinner: 'mealDinner', night: 'mealDinner',
};

export function ReportMealIllustration({ mealType, reportKey }: { mealType: string; reportKey: string }) {
  const key = mealType.trim().toLowerCase();
  const kind = Object.hasOwn(mealArt, key) ? mealArt[key] : 'coverageMeals';
  return <View style={styles.frame}>
    <ReportIllustration kind={kind} size={64} reportKey={reportKey} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: 76, height: 76, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.panelMuted },
});
