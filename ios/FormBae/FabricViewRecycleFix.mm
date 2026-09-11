#import <React/RCTViewComponentView.h>
#import <objc/runtime.h>

// Backport https://github.com/react/react-native/pull/57590 for RN 0.86.0.
// The app uses prebuilt React.framework, so patching node_modules would not
// change the running native code. Remove this adapter after upgrading to a
// React Native build containing 711a9a5.
@implementation RCTViewComponentView (FormBaeRecycleFix)

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Method original = class_getInstanceMethod(self, @selector(prepareForRecycle));
    Method replacement = class_getInstanceMethod(self, @selector(formbae_prepareForRecycle));
    method_exchangeImplementations(original, replacement);
  });
}

- (void)formbae_prepareForRecycle
{
  // This selector invokes the original implementation after the exchange.
  [self formbae_prepareForRecycle];
  // {} means a valid Flex layout, so the next Flex mount skips resetting
  // UIView.hidden. The empty sentinel forces all layout state to be applied.
  _layoutMetrics = facebook::react::EmptyLayoutMetrics;
}

@end
