import { Platform, ViewStyle } from 'react-native';

const ios = (height: number, opacity: number, radius: number): ViewStyle => ({
  shadowColor: '#000000',
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

const make = (iosStyle: ViewStyle, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({ ios: iosStyle, android: { elevation }, default: {} }) ?? {};

export const shadows = {
  none: make(ios(0, 0, 0), 0),
  sm: make(ios(2, 0.12, 8), 1),
  card: make(ios(6, 0.16, 16), 2),
  floatingNav: make(ios(-8, 0.28, 22), 10),
  md: make(ios(10, 0.20, 22), 4),
  lg: make(ios(14, 0.24, 28), 6),
  accent: make(
    { shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14 },
    4,
  ),
};
