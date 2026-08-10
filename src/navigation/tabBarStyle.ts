import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';

export const appTabBarStyle = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  bottom: 0,
  minHeight: 76,
  marginHorizontal: 18,
  marginBottom: 12,
  borderRadius: 22,
  borderTopWidth: 1,
  borderTopColor: colors.borderStrong,
  borderRightColor: colors.border,
  borderBottomColor: colors.border,
  borderLeftColor: colors.border,
  borderWidth: 1,
  backgroundColor: colors.panel,
  paddingTop: 8,
  paddingBottom: 9,
  ...shadows.floatingNav,
};

export const hiddenTabBarStyle = { display: 'none' as const };
