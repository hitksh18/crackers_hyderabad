import { useRef, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../ProductCard';
import SectionHeading from '../ui/SectionHeading';
import { ProductCardSkeleton } from '../ui/Skeleton';
import useDragScroll from '../../hooks/useDragScroll';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Bounded horizontal product carousel.
 *
 * Each instance owns its own scroll container (railRef), so Featured
 * Products and Best Sellers scroll independently. Arrows call scrollBy on
 * that container only — they never touch window/document scrolling.
 *
 * Arrow state follows the container: left is disabled at the start, right
 * is disabled at the end, and both hide when everything already fits.
 */
const HomeProductRail = ({
  eyebrow,
  title,
  subtitle,
  products,
  loading,
  showAllLink,
  railLabel,
}) => {
  const railRef = useRef(null);
  const reduced = useReducedMotion();
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  useDragScroll(railRef);

  const updateBounds = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 2);
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    updateBounds();
    el.addEventListener('scroll', updateBounds, { passive: true });
    window.addEventListener('resize', updateBounds);
    // Re-check after layout settles (fonts/images can shift widths).
    const raf = requestAnimationFrame(updateBounds);
    return () => {
      el.removeEventListener('scroll', updateBounds);
      window.removeEventListener('resize', updateBounds);
      cancelAnimationFrame(raf);
    };
  }, [updateBounds, products, loading]);

  const scrollRail = (dir) => {
    const el = railRef.current;
    if (!el) return;
    // Move by exactly one card (card width + the gap between cards) so the
    // arrow buttons step cleanly between complete cards instead of relying
    // on the browser's native page scroll.
    let step = el.clientWidth * 0.75;
    const firstCard = el.querySelector('.rail-card');
    if (firstCard) {
      const gap = parseFloat(getComputedStyle(el).columnGap) || 16;
      step = firstCard.offsetWidth + gap;
    }
    el.scrollBy({ left: dir * step, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        align="left"
        action={
          scrollable ? (
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                disabled={!canLeft}
                aria-label={`Scroll ${railLabel} left`}
                className="arrow-btn"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                disabled={!canRight}
                aria-label={`Scroll ${railLabel} right`}
                className="arrow-btn"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          ) : null
        }
      />

      <div
        ref={railRef}
        role="region"
        aria-label={railLabel}
        className="rail"
      >
        {loading ? (
          <>
            <span className="sr-only">Loading {railLabel}</span>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rail-card">
                <ProductCardSkeleton compact />
              </div>
            ))}
          </>
        ) : (
          (products || []).map((product) => (
            <div key={product.id} className="rail-card">
              <ProductCard compact product={product} />
            </div>
          ))
        )}
      </div>

      {showAllLink && (
        <div className="mt-6 text-center">
          <Link to={showAllLink} className="btn-primary inline-flex px-8 py-3 text-sm">
            View All Products
            <ArrowRight className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
};

export default HomeProductRail;
