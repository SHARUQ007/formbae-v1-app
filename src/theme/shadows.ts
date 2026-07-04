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
  sm: make(ios(2, 0.06, 6), 2),
  card: make(ios(6, 0.08, 16), 3),
  md: make(ios(8, 0.1, 20), 5),
  lg: make(ios(14, 0.14, 30), 9),
  accent: make(
    { shadowColor: '#047857', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16 },
    6,
  ),
};
