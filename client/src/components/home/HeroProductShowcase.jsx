import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { productPath } from '../../lib/productLinks';
import { normalizeImageUrl, logBrokenImageUrl } from '../../lib/normalizeImageUrl';

/* One product visible ~4s; premium fade + upward settle + 96%→100% scale (~800ms). */
const DWELL_MS = 4000;
const TRANSITION_MS = 800;

/* Image resolution — the SAME fields the working product cards use
   (imageURL primary, imageURL2 fallback, both via normalizeImageUrl, exactly
   like ProductCard / ProductDetail's gallery). No other image fields exist
   on the product model; nothing invented here. */
const showcaseImageSrc = (p) =>
  normalizeImageUrl(p?.imageURL) || normalizeImageUrl(p?.imageURL2) || null;

const hasShowcaseImage = (p) => showcaseImageSrc(p) !== null;

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const productKey = (p) => p?.id || p?.slug || p?.name || '';

/**
 * HeroProductShowcase — frameless editorial product display for the hero's
 * right column. No frame, no arch, no card, no border, no ornaments: one
 * large product floats over a whisper of warm light and a soft ground
 * shadow, with its name, price and a tiny discount annotation beneath.
 *
 * - Exactly ONE product is visible at any time (stacked slides, luxury
 *   fade + rise + settle). The fixed stage never changes size between
 *   products — tall, wide, square and transparent images all fit via
 *   max-bounds + contain, so there is no layout jump.
 * - Eligible products are the full valid catalogue (usable image via the
 *   same imageURL/imageURL2 resolution the product cards use). The session
 *   order is shuffled ONCE per catalogue load and cycled — never reshuffled
 *   per tick, never refetched, and no total is ever displayed.
 * - Products whose image fails to load are skipped permanently for the
 *   session (marked invalid, never retried, no render loop) so the stage
 *   never shows a blank display.
 * - Renders immediately with a stable placeholder; products hydrate
 *   progressively and never block the hero text or any other section.
 * - The next image is preloaded for a flicker-free transition.
 * - Auto-advance pauses on hover, focus, touch or hidden tab; disabled
 *   entirely for reduced-motion users (arrow keys still work).
 * - Products link to the existing /product/:slug route via productPath().
 */
const HeroProductShowcase = ({ products, loading = false, artworkAnimation }) => {
  const reduced = useReducedMotion();
  /* Product stays completely static: no rotation, no float, no sway, no
     continuous motion. The saved heroArtworkAnimation config is intentionally
     ignored here — only the decorative background artwork (.fx-orbit) rotates.
     Slide changes keep their subtle fade + rise entrance (.hs-slide), then
     remain still. */
  void artworkAnimation;
  const pool = useMemo(
    () => (Array.isArray(products) ? products.filter(Boolean) : []),
    [products]
  );
  /* Only products with a resolvable image may enter the carousel. */
  const eligible = useMemo(() => pool.filter(hasShowcaseImage), [pool]);
  const showSkeleton = loading || eligible.length === 0;

  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [, setLoadedTick] = useState(0);
  const pausedRef = useRef(false);
  const posRef = useRef(0);
  const orderRef = useRef([]);
  const invalidRef = useRef(new Set());
  const loadedRef = useRef(new Set());
  posRef.current = pos;
  orderRef.current = order;

  /* Shuffle ONCE per catalogue load — never per render, never per tick. */
  useEffect(() => {
    const valid = pool.filter(
      (p) => hasShowcaseImage(p) && !invalidRef.current.has(productKey(p))
    );
    setOrder(shuffled(valid));
    setPos(0);
  }, [products, pool]);

  /* An image counts as loaded the moment its bytes arrive — the slide then
     re-renders and the image fades in over the stable stage. */
  const markLoaded = (product) => {
    const key = productKey(product);
    if (!loadedRef.current.has(key)) {
      loadedRef.current.add(key);
      setLoadedTick((t) => t + 1);
    }
  };

  /* Preload the upcoming image ahead of time; a preload failure skips that
     product exactly like a rendered failure (no blank display, no retry). */
  useEffect(() => {
    if (order.length <= 1 || typeof Image === 'undefined') return;
    const upcoming = order[(pos + 1) % order.length];
    const key = productKey(upcoming);
    const src = showcaseImageSrc(upcoming);
    if (!src || invalidRef.current.has(key) || loadedRef.current.has(key)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => markLoaded(upcoming);
    img.onerror = () => handleImageError(upcoming);
    img.src = src;
  }, [order, pos]);

  /* Auto-advance starts only once products exist (never delays the hero).
     The current product stays visible until the next image has loaded —
     the stage never goes blank and never jumps. */
  useEffect(() => {
    if (reduced || order.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      const current = orderRef.current;
      if (current.length <= 1) return;
      const upcoming = current[(posRef.current + 1) % current.length];
      if (!loadedRef.current.has(productKey(upcoming))) return;
      setPos((posRef.current + 1) % current.length);
    }, DWELL_MS);
    return () => window.clearInterval(timer);
  }, [reduced, order.length]);

  /* A failed image skips its product permanently for this session: the
     product is dropped from the order (never retried) and the carousel
     moves on — no blank display, no render loop. */
  const handleImageError = (product) => {
    const key = productKey(product);
    logBrokenImageUrl(showcaseImageSrc(product));
    if (invalidRef.current.has(key)) return;
    invalidRef.current.add(key);
    const current = orderRef.current;
    const next = current.filter((p) => productKey(p) !== key);
    orderRef.current = next;
    setOrder(next);
    setPos((prev) => (next.length === 0 ? 0 : prev % next.length));
  };

  const stepBy = (delta) => {
    const current = orderRef.current;
    if (current.length === 0) return;
    const wrapped =
      ((posRef.current + delta) % current.length + current.length) % current.length;
    setPos(wrapped);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepBy(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepBy(-1);
    }
  };

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  const active = order[pos] || null;

  return (
    <div
      className="hs-showcase"
      role="region"
      aria-label="Featured product showcase"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onPointerDown={pause}
      onPointerUp={resume}
      onPointerCancel={resume}
    >
      {showSkeleton || order.length === 0 ? (
        <>
          <span className="sr-only">Loading featured product</span>
          <div className="hs-stage" aria-hidden="true">
            <div className="hs-slide is-active">
              <div className="hs-product-zone">
                <span className="hs-glow" />
                <span className="hs-skel-product" />
                <span className="hs-ground" />
              </div>
              <div className="hs-product-meta">
                <span className="hs-skel-line hs-skel-line-a" />
                <span className="hs-skel-line hs-skel-line-b" />
              </div>
            </div>
          </div>
          <div className="hs-progress" aria-hidden="true" />
        </>
      ) : (
        <>
          {/* Stacked slides in one fixed stage: only .is-active is visible, so
              exactly one product shows and the hero never changes size. Image
              and info live in the SAME slide, so they always change
              together. The stage itself is STATIC — no continuous motion;
              slides keep only their subtle fade + rise entrance on product
              change, then remain still. */}
          <div
            className="hs-stage"
            aria-live={reduced ? 'polite' : 'off'}
            aria-atomic="true"
          >
              {order.map((p, i) => {
                const isActive = i === pos;
                const src = showcaseImageSrc(p);
                const imgReady = loadedRef.current.has(productKey(p));
              return (
                <div
                  key={productKey(p)}
                  className={`hs-slide${isActive ? ' is-active' : ''}`}
                  aria-hidden={isActive ? undefined : 'true'}
                  style={{ '--hs-t': `${TRANSITION_MS}ms` }}
                >
                  <Link
                    to={productPath(p)}
                    aria-label={p?.name}
                    tabIndex={isActive ? undefined : -1}
                    className="hs-slide-link"
                  >
                    <span className="hs-product-zone">
                      <span className="hs-glow" aria-hidden="true" />
                      {src ? (
                          <img
                            className={`hs-product-image${imgReady ? ' is-loaded' : ''}`}
                            src={src}
                            alt={p?.name}
                            loading={isActive ? 'eager' : 'lazy'}
                            decoding="async"
                            width={640}
                            height={480}
                            fetchPriority={isActive ? 'high' : 'low'}
                            draggable={false}
                            onLoad={() => markLoaded(p)}
                            onError={() => handleImageError(p)}
                          />
                        ) : (
                        <span className="hs-img-fallback" aria-hidden="true">
                          {(p?.name || 'C').slice(0, 1)}
                        </span>
                      )}
                      <span className="hs-ground" aria-hidden="true" />
                    </span>
                      <span className="hs-product-meta">
                        <span className="hs-product-name line-clamp-2">{p?.name}</span>
                      </span>
                  </Link>
                </div>
              );
            })}
          </div>
          {/* Thin dwell progress — animates over each display period and
              restarts with the product. No numbers, no total, ever. */}
          <div className="hs-progress" aria-hidden="true">
            <span key={pos} style={{ animationDuration: `${DWELL_MS}ms` }} />
          </div>
          {/* Screen-reader announcement of the visible product. */}
          <span className="sr-only" aria-live="polite">
            {active ? active.name : ''}
          </span>
        </>
      )}
    </div>
  );
};

export default memo(HeroProductShowcase);
