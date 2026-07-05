import { Platform, ViewStyle } from 'react-native';

const ios = (height: number, opacity: number, radius: number): ViewStyle => ({
  shadowColor: '#0a1710',
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

const make = (iosStyle: ViewStyle, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({ ios: iosStyle, android: { elevation }, default: {} }) ?? {};

export const shadows = {
  none: make(ios(0, 0, 0), 0),
  sm: make(ios(2, 0.05, 8), 2),
  card: make(ios(10, 0.075, 22), 4),
  md: make(ios(14, 0.095, 28), 6),
  lg: make(ios(20, 0.14, 40), 10),
  accent: make(
    { shadowColor: '#047857', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16 },
    6,
  ),
};
