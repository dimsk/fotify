import { useEffect } from 'react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

function isFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as FullscreenElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
  } catch {
    // Ignore: browser refused (no user-activation on this event, or unsupported).
  }
}

/**
 * Browsers block auto-entering fullscreen on page load without a user
 * gesture, so instead we arm a one-time listener that requests fullscreen
 * on the very first click/keypress anywhere on the page — in practice a
 * single tap away rather than requiring a dedicated "fullscreen" button.
 */
export function useAutoFullscreen(): void {
  useEffect(() => {
    if (isFullscreen()) return;

    const onFirstInteraction = () => {
      if (!isFullscreen()) {
        void enterFullscreen();
      }
      window.removeEventListener('click', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };

    window.addEventListener('click', onFirstInteraction);
    window.addEventListener('keydown', onFirstInteraction);

    return () => {
      window.removeEventListener('click', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };
  }, []);
}
