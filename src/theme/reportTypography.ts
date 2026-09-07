import { Platform, type TextStyle } from 'react-native';

// Reports use platform-native families so typography is crisp immediately,
// without delaying first paint or increasing the mobile bundle with font files.
const editorialFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const interfaceFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' });
const dataFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const reportTypography = {
  display: {
    fontFamily: editorialFamily,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.55,
  } satisfies TextStyle,
  heading: {
    fontFamily: editorialFamily,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.2,
  } satisfies TextStyle,
  body: {
    fontFamily: interfaceFamily,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0.05,
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: interfaceFamily,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: 0,
  } satisfies TextStyle,
  label: {
    fontFamily: interfaceFamily,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 1.05,
  } satisfies TextStyle,
  data: {
    fontFamily: dataFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  dataLarge: {
    fontFamily: dataFamily,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
};
