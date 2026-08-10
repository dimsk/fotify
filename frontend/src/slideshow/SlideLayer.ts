// The largest slide the app ever renders is a 12-photo named collage layout
// (diamondGridDense/editorialMasonry); every layer always mounts this many
// fixed cells (extras hidden via display:none for smaller slides) so the
// "fixed DOM pool, never re-mounted" principle holds for collages too, not
// just single/triple.
export const MAX_SLIDE_CELLS = 12;

export interface SlideLayerHandle {
  container: HTMLDivElement;
  cells: HTMLElement[];
  images: HTMLImageElement[];
  videos: HTMLVideoElement[];
  media: Array<HTMLImageElement | HTMLVideoElement>;
  captions: HTMLElement[];
}

export function getLayerHandle(container: HTMLDivElement | null): SlideLayerHandle | null {
  if (!container) return null;
  const cells = Array.from(container.children) as HTMLElement[];
  const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  const videos = Array.from(container.querySelectorAll('video')) as HTMLVideoElement[];
  const media = [...images, ...videos];
  const captions = Array.from(container.querySelectorAll('[data-caption]')) as HTMLElement[];
  return { container, cells, images, videos, media, captions };
}
