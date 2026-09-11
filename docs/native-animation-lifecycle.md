# Native animation listener lifecycle

React Native 0.86.0 can log `Sending onAnimatedValueUpdate with no listeners
registered` on iOS when native observation outlives its event subscription.
`AnimatedValue` starts native observation before registering the event receiver,
and removes the receiver before stopping observation. The iOS native module
queues observation changes on the UI thread; changing only the JavaScript call
order does not finish an already queued stop.

`patches/react-native+0.86.0.patch` registers the receiver first. On iOS, removal
stops forwarding events immediately, queues the native stop, and releases the
receiver after a queued `getValue` callback acknowledges that stop. The read is
queued before `AnimatedNode.__detach` drops the node. Repeated subscriptions own
separate receivers, so delayed cleanup cannot remove a replacement subscription.
Android retains immediate receiver cleanup without the additional read.

This is a JavaScript patch, compatible with the prebuilt iOS React Native core.
The existing `postinstall` script applies it with patch-package. Reload the app
after updating; native pods do not need rebuilding for this change. Review and
remove or update the patch when upgrading React Native.

Workout celebrations, completion overlays, the meal-save toast and the shared
success animation also stop their animation sequences on replacement or
unmount. A set-save result arriving after its modal closes cannot start a new
celebration. Cancelled animations do not run completion UI callbacks.

Regression checks:

```
npm test -- --runInBand NativeAnimatedSubscription MotionAnimation WorkoutDetailScreen
```

The native subscription tests use the installed React Native JavaScript with
simulated UI-thread operation batches. They cover an early first frame, an
in-flight frame during removal, multiple listeners, rapid resubscription,
repeated detach cycles and Android cleanup. This verifies ordering and cleanup;
it does not replace device testing. On iOS, cold launch, quickly switch tabs,
leave a workout during its celebration, and save a meal then leave the tab.
Check that animation updates remain warning-free and completion actions still
work.
