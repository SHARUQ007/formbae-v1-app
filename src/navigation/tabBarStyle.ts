import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';

export const appTabBarStyle = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  bottom: 0,
  height: 70,
  marginHorizontal: 16,
  marginBottom: 12,
  borderRadius: 26,
  borderTopWidth: 0,
  borderColor: colors.border,
  borderWidth: 1,
  backgroundColor: colors.white,
  paddingTop: 7,
  paddingBottom: 8,
  ...shadows.md,
};

export const hiddenTabBarStyle = { display: 'none' as const };
