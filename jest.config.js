module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jestSetup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-native-vector-icons|react-native-screens|react-native-safe-area-context)/)',
  ],
};
