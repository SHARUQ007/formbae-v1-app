import { Platform, ViewStyle } from 'react-native';

const ios = (height: number, opacity: number, radius: number): ViewStyle => ({
  shadowColor: '#050505',
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

const make = (iosStyle: ViewStyle, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({ ios: iosStyle, android: { elevation }, default: {} }) ?? {};

export const shadows = {
  none: make(ios(0, 0, 0), 0),
  sm: make(ios(2, 0.045, 8), 1),
  card: make(ios(8, 0.065, 20), 3),
  md: make(ios(12, 0.08, 26), 5),
  lg: make(ios(18, 0.12, 34), 8),
  accent: make(
    { shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18 },
    6,
  ),
};
