import { useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, type ImageProps, type ImageBackgroundProps } from 'react-native';
import { observeAppEvent } from '../services/monitoringService';
import { cachedBundledImage, invalidateBundledImage } from '../services/bundledImageCache';

function useStableImageProps({ source, defaultSource, fadeDuration = 0, onError, onLoadStart, onLoad }: Pick<ImageProps, 'source' | 'defaultSource' | 'fadeDuration' | 'onError' | 'onLoadStart' | 'onLoad'>) {
  const started = useRef(0);
  const kind = typeof source === 'number' ? 'bundled' : source && !Array.isArray(source) && 'headers' in source ? 'protected' : 'remote';
  const [failedLocal, setFailedLocal] = useState<ImageProps['source']>();
  // Do not swap a visible URI when an unrelated background prefetch finishes.
  const cached = useMemo(() => cachedBundledImage(source), [source]);
  const local = cached !== source && failedLocal !== source;
  const placeholder = defaultSource ?? (typeof source === 'number' ? source : undefined);
  return {
    source: local ? cached : source,
    fadeDuration,
    onLoadStart: () => { started.current = Date.now(); onLoadStart?.(); },
    onLoad: (event: Parameters<NonNullable<ImageProps['onLoad']>>[0]) => {
      observeAppEvent('image_load', kind, started.current ? Date.now() - started.current : 0, 'ok');
      onLoad?.(event);
    },
    defaultSource: (typeof placeholder === 'number' && failedLocal !== placeholder
      ? cachedBundledImage(placeholder) : placeholder) as ImageProps['defaultSource'],
    onError: (event: Parameters<NonNullable<ImageProps['onError']>>[0]) => {
      observeAppEvent('image_error', kind, started.current ? Date.now() - started.current : 0, 'error');
      if (local) {
        invalidateBundledImage(source);
        setFailedLocal(source);
      } else onError?.(event);
    },
  };
}

export function StableImage(props: ImageProps) {
  return <Image {...props} {...useStableImageProps(props)} />;
}

export function StableImageBackground(props: ImageBackgroundProps) {
  return <ImageBackground {...props} {...useStableImageProps(props)} />;
}
