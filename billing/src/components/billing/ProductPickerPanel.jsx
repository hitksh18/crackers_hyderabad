import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, PackageSearch } from 'lucide-react';
import { revealVariants } from '../../lib/motion';
import { REGISTER_PANEL } from './surfaces';
import { displayNameForCategory } from '../../lib/categoryIcons';

const CATEGORIES = [
  'Rockets',
  'Sparkles',
  'Ground Chakkars',
  'Sky Shots',
  'Gift Boxes',
  'Flower Pots',
  'Bombs',
  'Garlands',
  'Kids Special',
  'Guns, Rolls & Pop Pop',
  'Threads and Novelties',
];

const SORT_OPTIONS = [
  { key: 'name', label: 'Name A–Z' },
  { key: 'price-asc', label: 'Price: low → high' },
  { key: 'price-desc', label: 'Price: high → low' },
];

const unitPriceOf = (product) =>
  product.offlineDiscountPrice || product.offlineMRP || product.offlinePrice || product.onlinePrice || 0;

const mrpOf = (product) => product.offlineMRP || product.offlinePrice || product.onlinePrice || 0;

const SKELETON_COUNT = 12;

/**
 * Product workspace of the counter POS: header with count, horizontally
 * scrollable category pills, and a dense tile grid.
 *
 * Pure picker — owns no product state and no pricing rules. Clicking a tile
 * adds it to the bill immediately; the parent owns cart logic.
 */
const ProductPickerPanel = ({
  products,
  loading,
  searchQuery,
  onAdd,
  reduced,
  totalCount,
}) => {
  const [category, setCategory] = useState('All');
  const [sortKey, setSortKey] = useState('name');
  const [addedId, setAddedId] = useState(null);

  const filtered = products.filter((product) => {
    if (category === 'All') return true;
    const cats = product.categories && product.categories.length ? product.categories : [product.category];
    return cats.includes(category);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'price-asc') return unitPriceOf(a) - unitPriceOf(b);
    if (sortKey === 'price-desc') return unitPriceOf(b) - unitPriceOf(a);
    return (a.name || '').localeCompare(b.name || '');
  });

  const handleAdd = (product) => {
    onAdd(product);
    setAddedId(product.id);
    window.setTimeout(() => {
      setAddedId((current) => (current === product.id ? null : current));
    }, 600);
  };

  return (
    <motion.section
      aria-labelledby="catalogue-heading"
      initial="hidden"
      animate="visible"
      variants={revealVariants(reduced, 14)}
      className="flex h-full min-h-0 flex-col"
      style={REGISTER_PANEL}
    >
      {/* Workspace header: section title + live count */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <h2
          id="catalogue-heading"
          className="text-base font-bold tracking-tight"
          style={{ color: 'var(--text-strong)', fontSize: '1rem' }}
        >
          Products
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${sorted.length} / ${totalCount}`}
          </span>
          <label htmlFor="product-sort" className="sr-only">
            Sort products
          </label>
          <select
            id="product-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="h-8 rounded-[7px] border border-[color:var(--hairline)] bg-[color:var(--surface-sunken)] pl-2 pr-6 text-xs font-semibold"
            style={{ color: 'var(--text-body)' }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category pills: one compact scrollable row */}
      <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--hairline)' }}>
        <div
          className="pos-cat-row flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Filter by category"
        >
          {['All', ...CATEGORIES].map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={`pos-chip h-8 shrink-0 whitespace-nowrap px-3 text-[0.6875rem] font-bold uppercase tracking-wider ${active ? 'pos-chip-active' : ''}`}
              >
                {cat}
              </button>
            );
          })}
        </div>
        {searchQuery.trim() && (
          <p className="tabular mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--text-muted)' }}>
            {sorted.length} match{sorted.length === 1 ? '' : 'es'} for “{searchQuery.trim()}”
          </p>
        )}
      </div>

      {/* Product grid: dense POS tiles, independent scroll */}
      <div className="pos-pane min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading products"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 min-[1300px]:grid-cols-5 min-[1800px]:grid-cols-6"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} className="pos-skeleton flex flex-col" aria-hidden="true">
                <div className="aspect-square w-full" style={{ background: 'var(--surface-sunken)' }} />
                <div className="flex flex-col gap-2 p-2.5">
                  <div className="h-3.5 w-4/5 rounded" style={{ background: 'var(--hairline-strong)' }} />
                  <div className="h-3 w-3/5 rounded" style={{ background: 'var(--hairline)' }} />
                  <div className="mt-1 flex items-center justify-between">
                    <div className="h-4 w-14 rounded" style={{ background: 'var(--hairline-strong)' }} />
                    <div className="h-7 w-7 rounded-[7px]" style={{ background: 'var(--hairline)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <PackageSearch className="h-7 w-7" style={{ color: 'var(--text-subtle)' }} strokeWidth={1.6} aria-hidden="true" />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
              No products found
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Try a different name, category, SKU or barcode
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 min-[1300px]:grid-cols-5 min-[1800px]:grid-cols-6">
            {sorted.map((product) => {
              const price = unitPriceOf(product);
              const mrp = mrpOf(product);
              const hasDiscount = product.offlineDiscountPrice && product.offlineDiscountPrice < mrp;
              const cats = product.categories && product.categories.length ? product.categories : [product.category];
              const catLabel = cats.map(displayNameForCategory).filter(Boolean).join(', ');
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleAdd(product)}
                  disabled={product.outOfStock}
                  aria-label={product.outOfStock ? `${product.name} — out of stock` : `Add ${product.name} to bill`}
                  className={`pos-product-card flex h-full min-w-0 flex-col text-left ${product.outOfStock ? 'is-dim cursor-not-allowed' : ''} ${addedId === product.id ? 'is-added' : ''}`}
                >
                  <span className="pos-tile-img">
                    {product.imageURL ? (
                      <img src={product.imageURL} alt="" loading="lazy" draggable={false} />
                    ) : (
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-[7px] text-xs font-bold"
                        style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)', color: 'var(--text-subtle)' }}
                      >
                        {catLabel?.slice(0, 1) || '?'}
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col p-2.5">
                    <span className="pos-tile-name product-name">{product.name}</span>
                    {catLabel && <span className="pos-tile-cat mt-0.5">{catLabel}</span>}
                    <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="min-w-0">
                        <span className="pos-tile-price price tabular block truncate">
                          ₹{Number(price).toLocaleString('en-IN')}
                        </span>
                        {hasDiscount && (
                          <span className="tabular block text-[0.6875rem] line-through" style={{ color: 'var(--text-subtle)' }}>
                            ₹{Number(mrp).toLocaleString('en-IN')}
                          </span>
                        )}
                        {product.outOfStock && (
                          <span className="badge badge-crimson mt-1">Out of stock</span>
                        )}
                      </span>
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px]"
                        style={{ background: 'rgba(232, 90, 36, 0.14)', color: 'var(--ember-500)' }}
                        aria-hidden="true"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default ProductPickerPanel;
