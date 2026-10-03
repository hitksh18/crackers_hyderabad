import { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../ProductCard';

const RESUME_DELAY = 4000;
const SPEED = 25;

/**
 * Horizontal product rail.
 *
 * Two modes, both driven by the same markup so the page never needs a second
 * carousel implementation:
 *
 * - `autoScroll` (default) — continuous auto-scrolling marquee. Items are
 *   rendered twice for a seamless loop and drift resumes a few seconds after
 *   the pointer leaves. Used where browsing, not comparing, is the goal.
 * - `autoScroll={false}` — a real carousel. Items render once, the track is a
 *   scroll-snap container driven by touch swipe and by arrows that page through
 *   it, and the arrows disable at each end so they never scroll into nothing.
 *
 * `compact` swaps in the tighter ProductCard variant.
 */
const ProductRail = ({
  headingId,
  eyebrow,
  title,
  items,
  reduced,
  compact = false,
  autoScroll = true,
  className = 'mt-14',
}) => {
  const railRef = useRef(null);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const lastTimeRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      lastTimeRef.current = null;
    }, RESUME_DELAY);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el || reduced || !autoScroll || !items || items.length < 2) return;

    const animate = (time) => {
      if (pausedRef.current) {
        lastTimeRef.current = null;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = time;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      el.scrollLeft += SPEED * (delta / 1000);

      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft -= half;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [items, reduced, autoScroll]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    el.addEventListener('pointerdown', pause);
    el.addEventListener('pointerup', scheduleResume);
    el.addEventListener('pointercancel', scheduleResume);
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', scheduleResume);

    return () => {
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('pointerup', scheduleResume);
      el.removeEventListener('pointercancel', scheduleResume);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', scheduleResume);
    };
  }, [pause, scheduleResume]);

  /* Carousel mode only: mirror the scroll position into state so the arrows
     can disable themselves at either end of the track. */
  useEffect(() => {
    const el = railRef.current;
    if (!el || autoScroll) return undefined;

    const sync = () => {
      setAtStart(el.scrollLeft <= 2);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };

    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    return () => {
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [autoScroll, items]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const scrollRail = (dir) => {
    const el = railRef.current;
    if (!el) return;
    pause();
    // Carousel mode pages by a full viewport of cards; the marquee keeps its
    // original card-by-card step.
    const step = autoScroll ? 320 : Math.max(240, el.clientWidth * 0.9);
    el.scrollBy({ left: dir * step, behavior: reduced ? 'auto' : 'smooth' });
    scheduleResume();
  };

  const showItems = items && items.length > 0 ? items : [];
  const loopItems = autoScroll ? [...showItems, ...showItems] : showItems;
  const scrollable = showItems.length > 1;

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="section-eyebrow">{eyebrow}</span>
          <h2 id={headingId} className="section-title mt-2">{title}</h2>
        </div>
        <div className="pd-rail-arrows flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => scrollRail(-1)}
            aria-label={`Scroll ${title} left`}
            className="arrow-btn"
            disabled={!autoScroll && (atStart || !scrollable)}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollRail(1)}
            aria-label={`Scroll ${title} right`}
            className="arrow-btn"
            disabled={!autoScroll && (atEnd || !scrollable)}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={railRef} className="rail pd-rail">
        {loopItems.map((item, index) => (
          <div key={`${item.id}-${index >= showItems.length ? 'dup' : 'orig'}`} className="pd-rail-item">
            <ProductCard product={item} compact={compact} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductRail;