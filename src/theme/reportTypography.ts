import { Platform, type TextStyle } from 'react-native';

// Reports use platform-native families so typography is crisp immediately,
// without delaying first paint or increasing the mobile bundle with font files.
const editorialFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
const interfaceFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' });
const dataFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const reportTypography = {
  display: {
    fontFamily: editorialFamily,
    fontSize: 27,
    lineHeight: 35,
    fontWeight: '600',
    letterSpacing: -0.35,
  } satisfies TextStyle,
  heading: {
    fontFamily: editorialFamily,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.1,
  } satisfies TextStyle,
  body: {
    fontFamily: interfaceFamily,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '400',
    letterSpacing: 0.05,
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: interfaceFamily,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: 0,
  } satisfies TextStyle,
  label: {
    fontFamily: interfaceFamily,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
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
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.35,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
};
