import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* The browser's default scroll restoration re-applies the saved position
   after a reload — after React has already painted the top — which is why
   a refresh on "/" could land mid-page. The storefront always decides
   scroll itself, so lock restoration to manual before the first paint. */
const lockManualRestoration = () => {
  try {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  } catch {
    /* Older browsers: nothing to lock. */
  }
};

lockManualRestoration();

const scrollToTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
};

/* Intentional anchor navigation (e.g. /#wholesale). The target section is
   code-split below the fold, so it may not exist on the first frame — poll
   for it with rAF (bounded, cancelled on unmount/navigation) instead of
   assuming it is there or delaying with a timer. */
const scrollToHash = (hash, isCancelled) => {
  let frame = 0;
  const maxFrames = 120;
  const tick = () => {
    if (isCancelled()) return;
    frame += 1;
    let el = null;
    try {
      el = document.querySelector(hash);
    } catch {
      return; // Not a valid selector — give up quietly.
    }
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    if (frame < maxFrames) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    let prev;
    try {
      prev = window.history.scrollRestoration;
    } catch {
      prev = undefined;
    }
    lockManualRestoration();
    let cancelled = false;
    // A bare "#" carries no target — treat it as a plain landing.
    if (hash && hash.length > 1) scrollToHash(hash, () => cancelled);
    else scrollToTop();
    return () => {
      cancelled = true;
      try {
        if (prev && 'scrollRestoration' in window.history) {
          window.history.scrollRestoration = prev;
        }
      } catch {
        /* Ignore — page is going away. */
      }
    };
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
