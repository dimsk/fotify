import { useEffect, useRef } from 'react';
import { SlideshowEngine } from './SlideshowEngine';
import { getLayerHandle } from './SlideLayer';
import { getEffectOverlayHandle } from './EffectOverlay';

export function useSlideshowEngine(
  layerARef: React.RefObject<HTMLDivElement | null>,
  layerBRef: React.RefObject<HTMLDivElement | null>,
  overlayRef: React.RefObject<HTMLDivElement | null>,
) {
  const engineRef = useRef<SlideshowEngine | null>(null);

  useEffect(() => {
    const layerA = getLayerHandle(layerARef.current);
    const layerB = getLayerHandle(layerBRef.current);
    const overlay = getEffectOverlayHandle(overlayRef.current);
    if (!layerA || !layerB || !overlay) return;

    const engine = new SlideshowEngine([layerA, layerB], overlay);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
