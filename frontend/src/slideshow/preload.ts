export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Preloads and fully decodes every url, bounded by timeoutMs so a slow or
 * stalled network never blocks the slideshow indefinitely. Returns whether
 * each url actually succeeded — callers should treat a timeout the same as
 * an outright failure (retry later) rather than rendering a possibly-broken
 * image, since we never want to show one mid-slideshow.
 */
export async function preloadAll(urls: string[], timeoutMs: number): Promise<boolean[]> {
  return Promise.race([
    Promise.all(urls.map((url) => preloadImage(url))),
    sleep(timeoutMs).then(() => urls.map(() => false)),
  ]);
}
