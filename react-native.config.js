/**
 * React Native Firebase is not linked on iOS yet.
 *
 * Phone sign-in works on Android. On iOS the pod integration is unresolved: RNFB v26
 * resolves Firebase through SPM, which its own installer refuses under this project's
 * static linkage, and the CocoaPods route fails to compile because the Firebase umbrella
 * header cannot find FirebaseAuth-Swift.h. Switching to use_frameworks! - either linkage -
 * gets past Firebase and then fails to link React Native itself, on missing
 * facebook::react::Sealable symbols from the prebuilt React Core that RN 0.86 ships.
 *
 * Without this exclusion autolinking pulls those pods back in and breaks the iOS build for
 * everything else. Sign-in degrades to its "unavailable" path on iOS, the same as a build
 * with no Firebase config.
 *
 * See docs/phone-sign-in.md.
 */
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/auth': { platforms: { ios: null } },
  },
};
