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
  sm: make(ios(2, 0.035, 7), 1),
  card: make(ios(8, 0.055, 18), 3),
  md: make(ios(12, 0.07, 24), 5),
  lg: make(ios(16, 0.1, 32), 8),
  accent: make(
    { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
    6,
  ),
};
