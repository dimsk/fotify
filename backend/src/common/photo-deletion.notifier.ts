import { Subject } from 'rxjs';

/**
 * Emitted whenever Photo rows are deleted (source removed, a rescan pruning
 * a file that vanished from disk, or a changed file's old row being
 * superseded). SlideshowStateService subscribes to this to purge any
 * now-stale Photo references from its in-memory lookahead buffer — without
 * this, a buffered slide could still point at a since-deleted photo and get
 * served/shown before the buffer naturally cycled past it, producing a
 * broken image mid-slideshow.
 */
export const photoDeletions$ = new Subject<number[]>();

export function notifyPhotosDeleted(photoIds: number[]): void {
  if (photoIds.length > 0) {
    photoDeletions$.next(photoIds);
  }
}
