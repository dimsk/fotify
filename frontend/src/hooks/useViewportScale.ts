import { useEffect } from 'react';

/**
 * Applies native CSS `zoom` to the document root while mounted, so the page
 * renders as if the browser itself were zoomed to `scale` (e.g. 0.9 = 90%)
 * — the same mechanism as pressing Ctrl/Cmd "-", not a `transform: scale()`
 * on a wrapper box. Because it zooms the actual root (not a sub-tree), the
 * viewport that fixed/absolute elements and vw/vh units resolve against is
 * recalculated too, so there's nothing left over to show as scrollbars or
 * letterboxing — unlike the meta-viewport-width trick, this also works in
 * plain desktop browsers, not just mobile/TV rendering engines.
 */
export function useViewportScale(scale: number): void {
  useEffect(() => {
    if (scale === 1) return;
    const root = document.documentElement;
    root.style.setProperty('zoom', String(scale));

    return () => {
      root.style.removeProperty('zoom');
    };
  }, [scale]);
}
