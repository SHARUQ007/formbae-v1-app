/* global jest */

require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-vector-icons/Feather', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcon');
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (props) => React.createElement(View, props) };
});
jest.mock('react-native-config', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(() => Promise.resolve({ authorizationStatus: 1 })),
    createChannel: jest.fn(() => Promise.resolve('default')),
    displayNotification: jest.fn(() => Promise.resolve()),
    cancelNotification: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve()),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 },
  RepeatFrequency: { DAILY: 1, WEEKLY: 2 },
  TimestampTrigger: jest.fn(),
  TriggerType: { TIMESTAMP: 0 },
}));
jest.mock('react-native-razorpay', () => ({
  open: jest.fn(() => Promise.resolve({ razorpay_payment_id: 'test_payment' })),
  onExternalWalletSelection: jest.fn(),
}));
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(() => Promise.resolve({ didCancel: true })),
  launchImageLibrary: jest.fn(() => Promise.resolve({ didCancel: true })),
}));
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props) => React.createElement(View, props),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const initialMetrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const SafeAreaInsetsContext = React.createContext(initialMetrics.insets);
  const SafeAreaFrameContext = React.createContext(initialMetrics.frame);
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    useSafeAreaFrame: () => initialMetrics.frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    initialWindowMetrics: initialMetrics,
  };
});
