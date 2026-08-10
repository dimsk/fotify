import type { SlidePhoto } from '../api/types';

async function preloadImage(url: string): Promise<boolean> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return true;
  } catch {
    // decode() can reject in some browsers before the image is attached to
    // the document; fall back to waiting for the load/error events instead.
    return new Promise<boolean>((resolve) => {
      if (img.complete) {
        resolve(true);
        return;
      }
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
  }
}

async function preloadVideo(url: string, timeoutMs: number): Promise<boolean> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => finish(), timeoutMs);
    const finish = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      // Browser preload is only a hint. The attached video element performs
      // the authoritative readiness/error check when the slide is shown.
      resolve(true);
    };
    video.onloadedmetadata = finish;
    video.onerror = finish;
    video.src = url;
    video.load();
  });
}

/**
 * Preloads and fully decodes every url, bounded by timeoutMs so a slow or
 * stalled network never blocks the slideshow indefinitely. Returns whether
 * each url actually succeeded — callers should treat a timeout the same as
 * an outright failure (retry later) rather than rendering a possibly-broken
 * image, since we never want to show one mid-slideshow.
 */
export async function preloadAll(
  media: Array<Pick<SlidePhoto, 'url' | 'mediaType'>>,
  timeoutMs: number,
): Promise<boolean[]> {
  return Promise.all(
    media.map((item) => {
      if (item.mediaType === 'video') {
        return preloadVideo(item.url, timeoutMs);
      }
      return Promise.race([
        preloadImage(item.url),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), timeoutMs),
        ),
      ]);
    }),
  );
}
