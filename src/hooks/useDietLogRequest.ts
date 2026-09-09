import { useLayoutEffect, useRef } from 'react';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';

// Native modals need an attached, focused presenter, including on lazy mount.
export function useDietLogRequest(
  navigation: BottomTabNavigationProp<MainTabParamList, 'Diet'>,
  requestId: number | null,
  openEditor: () => void,
) {
  const openRef = useRef(openEditor);
  const handledRef = useRef<number | null>(null);
  useLayoutEffect(() => { openRef.current = openEditor; });

  useLayoutEffect(() => {
    if (requestId === null || handledRef.current === requestId) return;
    let frame: number | undefined;
    let transitioning = false;
    let disposed = false;
    const cancel = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    };
    const schedule = () => {
      cancel();
      if (!navigation.isFocused() || transitioning || disposed) return;
      // Let the native screen attach before presenting the food-entry modal.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (disposed || transitioning || !navigation.isFocused() || handledRef.current === requestId) return;
          handledRef.current = requestId;
          openRef.current();
        });
      });
    };
    const unsubscribe = [
      navigation.addListener('focus', schedule),
      navigation.addListener('blur', cancel),
      navigation.addListener('transitionStart', () => { transitioning = true; cancel(); }),
      navigation.addListener('transitionEnd', () => { transitioning = false; schedule(); }),
    ];
    schedule();
    return () => {
      disposed = true;
      cancel();
      unsubscribe.forEach(remove => remove());
    };
  }, [navigation, requestId]);
}
