import { useEffect } from 'react';

const TV_VIEWPORT_WIDTH = 1920;

/**
  * Fire TV's Silk browser doesn't reliably honor width=device-width on the
  * TV's actual 1080p output — it falls back to a narrower default layout
  * viewport and stretches it to fill the screen, making everything render
  * far larger than intended. Pinning width=1920 (Fire TV's documented
  * reference resolution) fixes that, but must stay scoped to the slideshow:
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

    meta.content = `width=${TV_VIEWPORT_WIDTH}, initial-scale=1, user-scalable=no`;

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
