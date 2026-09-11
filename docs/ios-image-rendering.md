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

## Shared image path

`StableImage` and `StableImageBackground` disable image fades on the main tab
cards and shared report/diary components. They use the existing startup image
queue, rather than a second tab-level warmup.

For Debug require() assets, the startup queue now downloads the packager's
content-hashed asset into `CachesDirectoryPath/bundled-artwork-v1` before native
prefetch. Repeat launches reuse that file. Density is part of the filename;
changed artwork gets a new content hash. Previous revisions are pruned at startup
when the directory exceeds 20 MiB. The current bundled raster library adds only
a few MiB. This cache is only for bundled artwork: authenticated photos and
external article URLs keep their original request headers and cache semantics.

Mounted images retain their source even if background prefetch finishes later.
A missing or invalid cached file falls back to the original bundled source and
is removed so a future preload can repair it. Release assets already live inside
the application and bypass disk copying. First-time Debug loads still need Metro;
this does not eliminate first-download latency for remote photos.
