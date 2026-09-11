# iOS image loading

## Standalone device builds

Use `npm run ios:release -- --device "Sharuq’s iPhone"` for everyday testing
away from Metro. Release loads `main.jsbundle` and its image assets from the
installed app. Debug uses the Mac's Metro URL, so a running JS session can
outlive its image server: previously cached photos work while new photos fail
when Metro stops or the phone leaves the Mac's network.

A larger decoded-image cache or image placeholder does not remove that network
dependency. Keep Debug for development with Metro running; use Release to check
cold launch and bundled artwork without Metro. Remote trainer, article, and
user-uploaded photos still require their respective servers.

## Native view reuse

`FabricViewRecycleFix.mm` backports the layout reset from React Native PR
[57590](https://github.com/react/react-native/pull/57590) to the prebuilt React
framework used by this app's React Native 0.86.0 installation.

The affected `RCTViewComponentView.prepareForRecycle` resets `_layoutMetrics`
to `{}`, which is a valid Flex layout. A reused view can retain `hidden = YES`
because the next Flex layout appears unchanged. Resetting to `EmptyLayoutMetrics`
forces the next mount to apply visibility and the other layout-derived state.
Images inherit this view implementation. This is a native rendering fix, not a
change to image files, cache limits, or card dimensions.

The app-level Objective-C++ category calls the original recycle implementation
before restoring the empty sentinel. It is compiled into the app because editing
React Native source alone does not modify the prebuilt `React.framework`.
Remove this adapter when upgrading to a React Native build containing upstream
commit `711a9a5`.

Validation on a rebuilt app:

1. Open Accountability and check both workout and food photos.
2. Switch between Profile, Accountability, and Progress repeatedly; scroll the
   photo cards out of view and back.
3. Background and reopen the app, then repeat the tab switches.
4. Confirm text and photos remain visible, including after a cold launch.

Fast Refresh cannot install this fix: rebuild and install the iOS app.
