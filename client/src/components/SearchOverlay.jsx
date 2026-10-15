import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, ArrowRight } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { sheetVariants } from '../lib/motion';
import SearchSuggestions from './SearchSuggestions';

/**
 * Focused search surface for viewports below `lg`.
 *
 * The query state and the submit handler live in Navbar — this component
 * only presents them, so the `/products?q=` navigation stays in one place.
 *
 * When `enableSuggestions` is true (every route except /products, where the
 * grid filters live instead), the same suggestion dropdown as the desktop
 * header renders inside the panel, with Add to Cart per row.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MOBILE_LISTBOX_ID = 'mobile-search-suggestions';

const SearchOverlay = ({
  onClose,
  value,
  onChange,
  onSubmit,
  onPickProduct,
  onViewAll,
  enableSuggestions = true,
  showAddToCart = false,
}) => {
  const withSuggestions = enableSuggestions && typeof onPickProduct === 'function';
  const [suggestOpen, setSuggestOpen] = useState(false);
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  /* Body scroll lock + focus handoff, unwound on close. */
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  /* Escape closes; Tab is trapped inside the panel. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const hasQuery = value.trim().length > 0;

  return (
    <motion.div
      className="fixed inset-0 z-modal lg:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.001 : 0.18 }}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26, 23, 20, 0.55)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        variants={sheetVariants(reduced)}
        initial="hidden"
        animate="visible"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        className="glass-strong relative"
        style={{ borderRadius: '0 0 var(--r-xl) var(--r-xl)' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: 'var(--grad-gold)', opacity: 0.7 }}
        />

        <form onSubmit={onSubmit} role="search" className="shell flex flex-col gap-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="label-caps">Search the catalogue</p>
            <button type="button" onClick={onClose} className="arrow-btn shrink-0" aria-label="Close search">
              <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <label htmlFor="mobile-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <input
              id="mobile-search"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                onChange(e);
                if (withSuggestions) setSuggestOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (withSuggestions && value.trim().length > 0) setSuggestOpen(true);
              }}
              placeholder="Search crackers, gift boxes and more..."
              autoComplete="off"
              aria-label="Search products"
              role={withSuggestions ? 'combobox' : undefined}
              aria-expanded={withSuggestions ? suggestOpen && hasQuery : undefined}
              aria-controls={withSuggestions ? MOBILE_LISTBOX_ID : undefined}
              aria-autocomplete={withSuggestions ? 'list' : undefined}
              className={`input-premium is-glass pl-11 text-base${value ? ' pr-10' : ' pr-4'}`}
              style={{ borderRadius: 'var(--r-pill)' }}
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange({ target: { value: '' } });
                  if (withSuggestions) setSuggestOpen(false);
                  inputRef.current?.focus();
                }}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--text-subtle)' }}
              >
                <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>

          {withSuggestions && (
            <SearchSuggestions
              query={value}
              open={suggestOpen}
              onOpenChange={setSuggestOpen}
              onPick={onPickProduct}
              onViewAll={onViewAll}
              inputRef={inputRef}
              listboxId={MOBILE_LISTBOX_ID}
              floating={false}
              showAddToCart={showAddToCart}
            />
          )}

          <button type="submit" className="btn-primary w-full" disabled={!hasQuery}>
            <span>Search products</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>

          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Results open in the full product catalogue.
          </p>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default SearchOverlay;
