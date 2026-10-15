import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { collection } from 'firebase/firestore';
import { SearchX, ArrowRight, Tag } from 'lucide-react';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { buildBrandLookup, getProductBrandName } from '../lib/resolveBrand';
import {
  normalizeQuery,
  searchProducts,
  countMatches,
  SUGGESTION_LIMIT,
} from '../lib/productSearch';
import { normalizeImageUrl, logBrokenImageUrl } from '../lib/normalizeImageUrl';
import { inr } from '../lib/currency';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useCart } from '../context/CartContext';
import ImagePlaceholder from './ImagePlaceholder';

/**
 * Live suggestion dropdown for the header search.
 *
 * Rendered as an overlay ONLY — it never takes part in page layout:
 * - desktop (`floating`): absolutely positioned under the search bar, same
 *   width as the form, above page content but below modals;
 * - mobile (`floating={false}`): a static block inside the SearchOverlay
 *   panel, which already owns dismissal/scroll-lock.
 *
 * Data: reads the SAME `products` (+ `brands`) documents the Products page
 * downloads, through the shared cachedGetDocs cache — no new endpoints, no
 * duplicate in-flight reads, and NOTHING is fetched until the dropdown opens
 * with a non-empty query (the homepage hero and first paint stay untouched).
 * Ranking/filtering is the shared productSearch engine, so dropdown order
 * and the /products?q= listing always agree.
 *
 * Interaction: focus stays in the input at all times (row mousedown is
 * suppressed), ArrowDown/Up move, Enter picks the highlighted row (or falls
 * through to the form submit when nothing is highlighted), Escape closes the
 * dropdown first. Previous results stay visible across keystrokes/debounce
 * so the list never flashes or collapses while typing.
 */

const DEBOUNCE_MS = 200;
const SKELETON_GRACE_MS = 150;
const RESULT_CACHE_CAP = 30;

const categoryLabel = (product) => {
  if (Array.isArray(product?.categories)) {
    const first = product.categories.map((c) => String(c)).filter(Boolean)[0];
    if (first) return first;
  }
  return String(product?.category || '');
};

const priceOf = (product) => ({
  display: product?.discountPrice || product?.onlinePrice || product?.price || 0,
  mrp: product?.onlinePrice || 0,
  hasDiscount:
    !!product?.discountPrice &&
    !!product?.onlinePrice &&
    product.discountPrice < product.onlinePrice,
  offPct: product?.discountPrice && product?.onlinePrice && product.onlinePrice > 0
    ? Math.round(((product.onlinePrice - product.discountPrice) / product.onlinePrice) * 100)
    : 0,
});

/* Gold-highlight the raw query tokens inside the product name. Tokens that
   only match after normalization (punctuation, "&"→"and") are skipped rather
   than guessed at, so the highlight never misaligns with the text. */
const HighlightedName = ({ name, query }) => {
  const text = String(name || '');
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const lowered = text.toLowerCase();

  const ranges = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = lowered.indexOf(token, from);
      if (at < 0) break;
      if (!ranges.some((r) => at < r.end && at + token.length > r.start)) {
        ranges.push({ start: at, end: at + token.length });
      }
      from = at + token.length;
    }
  }
  if (ranges.length === 0) return <>{text}</>;
  ranges.sort((a, b) => a.start - b.start);

  const parts = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <span key={i} className="font-semibold" style={{ color: '#E9C46A' }}>
        {text.slice(r.start, r.end)}
      </span>
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};

const RowImage = ({ product }) => {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : normalizeImageUrl(product?.imageURL);
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-md)]"
      style={{ background: 'rgba(255, 255, 255, 0.06)' }}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="h-12 w-12 object-contain"
          onError={(e) => {
            logBrokenImageUrl(src);
            setFailed(true);
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span className="h-12 w-12 [&>div]:h-full">
          <ImagePlaceholder compact />
        </span>
      )}
    </span>
  );
};

const SearchSuggestions = ({
  query,
  open,
  onOpenChange,
  onPick,
  onViewAll,
  inputRef,
  listboxId = 'site-search-suggestions',
  floating = true,
  /* Hero mode: compact "TOP RESULTS" heading plus an inline Add to Cart
     action per row. Adding never navigates and never closes the panel. */
  title = null,
  showAddToCart = false,
}) => {
  const reduced = useReducedMotion();
  const { addToCart } = useCart();
  const wrapRef = useRef(null);
  const [catalogue, setCatalogue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const resultCache = useRef(new Map());
  const settledRef = useRef({ results: [], total: 0, q: '' });

  const normalized = useMemo(() => normalizeQuery(query), [query]);
  const visible = Boolean(open) && normalized.length > 0;

  /* Debounce keystrokes — the engine scans a precomputed index, but the
     debounce keeps renders (and the first catalogue fetch) calm. */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(normalized), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [normalized]);

  /* Lazy catalogue: fetched once, only while the dropdown is visible with a
     query. Failures resolve to [] so the UI falls through to the clean
     no-results state — never an error banner. */
  useEffect(() => {
    if (!visible || catalogue !== null || loading) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      cachedGetDocs(collection(db, 'products'), 'products'),
      cachedGetDocs(collection(db, 'brands'), 'brands').catch(() => []),
    ])
      .then(([products, brands]) => {
        if (cancelled) return;
        resultCache.current.clear();
        setCatalogue({
          products: Array.isArray(products) ? products : [],
          lookup: buildBrandLookup(Array.isArray(brands) ? brands : []),
        });
      })
      .catch(() => {
        if (cancelled) return;
        resultCache.current.clear();
        setCatalogue({ products: [], lookup: buildBrandLookup([]) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, catalogue, loading]);

  /* Skeleton only when the first fetch outlives a short grace period —
     warm-cache keystrokes never flash a loader. */
  useEffect(() => {
    if (!loading || catalogue !== null) {
      setShowSkeleton(false);
      return undefined;
    }
    const t = setTimeout(() => setShowSkeleton(true), SKELETON_GRACE_MS);
    return () => clearTimeout(t);
  }, [loading, catalogue]);

  const fresh = useMemo(() => {
    if (!debounced || !catalogue) return { results: [], total: 0 };
    const key = debounced;
    const hit = resultCache.current.get(key);
    if (hit) return hit;
    const results = searchProducts(catalogue.products, debounced, SUGGESTION_LIMIT, catalogue.lookup);
    const total = countMatches(catalogue.products, debounced, catalogue.lookup);
    const value = { results, total };
    resultCache.current.set(key, value);
    if (resultCache.current.size > RESULT_CACHE_CAP) {
      const oldest = resultCache.current.keys().next().value;
      resultCache.current.delete(oldest);
    }
    return value;
  }, [debounced, catalogue]);

  /* Keep the previous settled results on screen until the new query settles
     — the list updates in place instead of flashing empty between keys. */
  const settled = debounced === normalized;
  if (settled && normalized) settledRef.current = { ...fresh, q: normalized };
  const shown = settled ? { ...fresh, q: normalized } : settledRef.current;

  /* Reset the highlight whenever the visible list changes identity. */
  useEffect(() => {
    setActiveIndex(-1);
  }, [debounced, catalogue]);

  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);

  /* Keyboard lives on the input so focus never leaves it. Native listener
     (not React synthetic) so Escape can stop propagation before the mobile
     overlay's document-level handler closes the whole sheet. */
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== 'Escape') return;
      if (!visible) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      const rows = shown.results;
      if (event.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < rows.length) {
          event.preventDefault();
          onPick?.(rows[activeIndex]);
        }
        return;
      }
      event.preventDefault();
      if (rows.length === 0) return;
      if (activeIndex < 0) {
        setActiveIndex(event.key === 'ArrowDown' ? 0 : rows.length - 1);
      } else {
        const next = event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1;
        setActiveIndex((next + rows.length) % rows.length);
      }
    };
    input.addEventListener('keydown', onKeyDown);
    return () => input.removeEventListener('keydown', onKeyDown);
  }, [inputRef, visible, shown.results, activeIndex, onPick, close]);

  /* Outside click closes (floating/desktop only — the mobile panel owns its
     own dismissal). Never preventDefault: the click must land normally. */
  useEffect(() => {
    if (!floating || !visible) return undefined;
    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [floating, visible, close]);

  if (!visible) return null;

  const showLoader = loading && catalogue === null && showSkeleton;
  const showEmpty = !loading && catalogue !== null && settled && shown.results.length === 0;

  const body = (
    <>
      {showLoader ? (
        <div className="px-2 py-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 px-2 py-2.5">
              <span className="h-12 w-12 shrink-0 rounded-[var(--r-md)]" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 block h-3.5 w-3/4 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
                <span className="block h-3 w-1/3 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
              </span>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center gap-1.5 px-6 py-7 text-center">
          <SearchX className="h-6 w-6" style={{ color: 'rgba(247, 241, 231, 0.4)' }} aria-hidden="true" />
          <p className="text-sm font-semibold" style={{ color: '#F7F1E7' }}>
            No products found for &ldquo;{query.trim()}&rdquo;
          </p>
          <p className="text-xs" style={{ color: 'rgba(247, 241, 231, 0.6)' }}>
            Try another search — a number (&ldquo;40&rdquo;), a brand, or fewer words.
          </p>
        </div>
      ) : (
        <>
          <p className="label-caps px-4 pb-1 pt-3" style={{ color: '#D2A64F' }} aria-live="polite">
            {title ?? (
              <>Top {shown.results.length} of {shown.total} match{shown.total === 1 ? '' : 'es'} for &ldquo;{query.trim()}&rdquo;</>
            )}
          </p>
          <ul role="listbox" id={listboxId} aria-label="Product suggestions" className="px-2 pb-1">
            {shown.results.map((product, i) => {
              const price = priceOf(product);
              const brand = getProductBrandName(product, catalogue?.lookup);
              const category = categoryLabel(product);
              const active = i === activeIndex;
              const soldOut = product?.outOfStock === true;
              return (
                <li
                  key={product.id}
                  role="option"
                  id={`${listboxId}-opt-${i}`}
                  aria-selected={active}
                >
                  <div
                    onClick={() => onPick?.(product)}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex min-h-[64px] w-full cursor-pointer items-center gap-3 rounded-[var(--r-md)] px-2 py-2 text-left transition-colors hover:bg-white/[0.07]${active ? ' bg-white/[0.07]' : ''}`}
                  >
                    <RowImage product={product} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" style={{ color: '#F7F1E7' }}>
                        <HighlightedName name={product.name} query={normalized} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs" style={{ color: 'rgba(247, 241, 231, 0.62)' }}>
                        {[brand, category].filter(Boolean).join('  •  ') || 'Firecrackers'}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <span className="font-bold tabular" style={{ color: '#FFFFFF' }}>
                          {inr(price.display)}
                        </span>
                        {price.hasDiscount && (
                          <>
                            <s style={{ color: 'rgba(247, 241, 231, 0.45)' }}>{inr(price.mrp)}</s>
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold"
                              style={{ background: 'rgba(22, 163, 74, 0.12)', color: '#15803d' }}
                            >
                              <Tag className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
                              {price.offPct}% OFF
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                    {showAddToCart && (
                      <button
                        type="button"
                        disabled={soldOut}
                        aria-label={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!soldOut) addToCart(product);
                        }}
                        className="btn-primary min-h-[36px] shrink-0 px-3 text-xs"
                      >
                        {soldOut ? 'Out of stock' : 'Add to Cart'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-2 pb-2 pt-1">
            <button
              type="button"
              onClick={() => onViewAll?.()}
              onMouseDown={(e) => e.preventDefault()}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[var(--r-md)] text-sm font-semibold transition-colors hover:bg-white/[0.06]"
              style={{ color: '#D2A64F' }}
            >
              <span>View all results for &ldquo;{query.trim()}&rdquo;</span>
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </>
  );

  const panelClass = floating
    ? 'absolute inset-x-0 top-full z-overlay mt-2'
    : 'relative mt-1';

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: reduced ? 0 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.001 : 0.16 }}
      className={panelClass}
    >
      <div
        className="overflow-hidden border shadow-lg"
        style={{
          background: '#1B1512',
          borderColor: 'rgba(210, 166, 79, 0.35)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55), 0 0 24px rgba(210, 166, 79, 0.10)',
        }}
      >
        <div aria-hidden="true" className="h-[2px]" style={{ background: 'var(--grad-gold)' }} />
        {body}
      </div>
    </motion.div>
  );
};

export default SearchSuggestions;
