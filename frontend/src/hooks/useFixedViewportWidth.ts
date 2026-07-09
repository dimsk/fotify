import { useEffect } from 'react';

const FALLBACK_TV_VIEWPORT_WIDTH = 1920;
const FALLBACK_TV_VIEWPORT_HEIGHT = 1080;

declare global {
  interface Window {
    FotifyDisplay?: {
      getWidth?: () => number;
      getHeight?: () => number;
      getDensity?: () => number;
    };
  }
}

/**
  * Fire TV's WebView doesn't reliably honor width=device-width on TV output.
  * It can fall back to a narrower default layout viewport and stretch it to
  * fill the panel, making everything render far larger than intended.
  *
  * The Android wrapper exposes the real display size via `FotifyDisplay`; the
  * slideshow then pins the viewport to that native resolution. This must stay
  * scoped to the slideshow:
 * real phones opening /photo/:id via the QR code need the normal
 * device-width viewport for a proper mobile layout, so this overrides the
 * meta tag only while mounted and restores the original on unmount.
 */
export function useFixedViewportWidth(): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    if (!meta) return;

    const root = document.documentElement;
    const body = document.body;
    const original = meta.content;
    const originalRootOverflow = root.style.overflow;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyMargin = body.style.margin;

    const { width, height } = getDisplayViewportSize();

    meta.content = [
      `width=${width}`,
      `height=${height}`,
      'initial-scale=1',
      'maximum-scale=1',
      'user-scalable=no',
      'viewport-fit=cover',
    ].join(', ');

    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.margin = '0';

    return () => {
      meta.content = original;
      root.style.overflow = originalRootOverflow;
      body.style.overflow = originalBodyOverflow;
      body.style.margin = originalBodyMargin;
    };
  }, []);
}

function getDisplayViewportSize(): { width: number; height: number } {
  const nativeWidth = Math.round(Number(window.FotifyDisplay?.getWidth?.() ?? 0));
  const nativeHeight = Math.round(Number(window.FotifyDisplay?.getHeight?.() ?? 0));

  if (isSaneTvSize(nativeWidth, nativeHeight)) {
    return normalizeLandscape(nativeWidth, nativeHeight);
  }

  const screenWidth = Math.round(Number(window.screen?.width ?? 0));
  const screenHeight = Math.round(Number(window.screen?.height ?? 0));
  if (isSaneTvSize(screenWidth, screenHeight)) {
    return normalizeLandscape(screenWidth, screenHeight);
  }

  return {
    width: FALLBACK_TV_VIEWPORT_WIDTH,
    height: FALLBACK_TV_VIEWPORT_HEIGHT,
  };
}

function isSaneTvSize(width: number, height: number): boolean {
  return width >= 720 && height >= 480 && width <= 7680 && height <= 4320;
}

function normalizeLandscape(width: number, height: number): { width: number; height: number } {
  return width >= height ? { width, height } : { width: height, height: width };
}
