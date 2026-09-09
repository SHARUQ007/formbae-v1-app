import { SvgXml } from 'react-native-svg';
import { REPORT_ILLUSTRATIONS, type ReportIllustrationKind } from '../utils/reportIllustrationCatalog';
import { reportVariant } from '../utils/reportVisuals';
import { allowsNonVegetarianArtwork } from '../utils/reportDietPreference';

/** Original, contextual illustrations. The adjacent copy carries their meaning. */
export function ReportIllustration({ kind, size = 48, reportKey = '', slot = 0, dietPreference }: {
  kind: ReportIllustrationKind;
  size?: number;
  reportKey?: string;
  slot?: number;
  dietPreference?: string;
}) {
  const knownKind = Object.hasOwn(REPORT_ILLUSTRATIONS, kind) ? kind : 'reportFocus';
  const resolvedKind = knownKind === 'protein' && !allowsNonVegetarianArtwork(dietPreference) ? 'proteinPlant' : knownKind;
  const variants = REPORT_ILLUSTRATIONS[resolvedKind];
  return <SvgXml xml={variants[reportVariant(reportKey, variants.length, slot)]}
    width={size} height={size} accessible={false} testID={`report-illustration-${resolvedKind}`} />;
}
