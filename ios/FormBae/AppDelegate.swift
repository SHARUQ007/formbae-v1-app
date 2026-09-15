import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseAuth
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase backs phone sign-in. Configured only when its plist is in the bundle:
    // FirebaseApp.configure() traps on a missing one, which would turn "nobody has made
    // the Firebase project yet" into a crash on every launch.
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()
    } else {
      NSLog("GoogleService-Info.plist is missing: Firebase phone sign-in will not work in this build.")
    }

    // The 1200–1440px editorial cards exceed RN's default 2MB decoded-image
    // entry limit. Keep them cacheable, with a bounded total memory budget.
    RCTSetImageCacheLimits(8 * 1024 * 1024, 48 * 1024 * 1024)

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "FormBae",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    // Firebase first. When phone sign-in falls back to reCAPTCHA it returns through this
    // callback, and handing the URL straight to RCTLinkingManager would swallow it - the
    // verification would then hang with no error.
    if Auth.auth().canHandle(url) { return true }
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  // Phone sign-in verifies the device with a silent push, which is what keeps the
  // reCAPTCHA sheet away on iOS. Without the token forwarded here every verification
  // falls back to the webview.
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Auth.auth().setAPNSToken(deviceToken, type: .unknown)
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification notification: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    if Auth.auth().canHandleNotification(notification) {
      completionHandler(.noData)
      return
    }
    completionHandler(.noData)
  }

  func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                   restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
