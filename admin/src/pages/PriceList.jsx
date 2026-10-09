import { useState, useMemo } from 'react';
import { Search, Package, Printer, RefreshCw } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { displayNameForCategory } from '../lib/categoryIcons';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import AdminHeader from '../components/admin/AdminHeader';
import { CATEGORY_VALUES, isProductInCategory, categoryDisplayName, productCategoryValues } from '../config/categories';
import { usePriceListData } from '../hooks/usePriceListData';

// Single source of truth — admin/src/config/categories.js (canonical order).
// State holds canonical stored values; labels render display names.
const categories = ['All', ...CATEGORY_VALUES];

/** Alias-aware membership — array form first, legacy single field second. */
const inCategory = (product, category) => {
  if (category === 'All') return true;
  return isProductInCategory(product, category);
};

/* Canonical rank for stable grouping: first matching canonical value wins,
   uncategorised sorts last, then by name. */
const rankOf = (product, rankByValue) => {
  const values = productCategoryValues(product);
  let best = rankByValue.size;
  for (const value of values) {
    const rank = rankByValue.get(value);
    if (rank !== undefined && rank < best) best = rank;
  }
  return best;
};

const PANEL = {
  background: 'var(--surface-card)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
};

const PriceSkeleton = () => (
  <span className="inline-block h-4 w-14 rounded" style={{ background: 'var(--surface-raised)' }} aria-hidden="true" />
);

const StockCell = ({ outOfStock }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: outOfStock ? 'var(--delta-down, #f2716b)' : 'var(--delta-up, #4fb483)' }}
    />
    <span style={{ color: outOfStock ? 'var(--delta-down, #f2716b)' : 'var(--delta-up, #4fb483)' }}>
      {outOfStock ? 'Out of Stock' : 'Available'}
    </span>
  </span>
);

const CategoryBadges = ({ product }) => {
  const values = productCategoryValues(product);
  if (values.length === 0) {
    return <span style={{ color: 'var(--text-subtle)' }}>—</span>;
  }
  const shown = values.slice(0, 2);
  const extra = values.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((value) => (
        <span key={value} className="badge badge-neutral">
          {displayNameForCategory(value)}
        </span>
      ))}
      {extra > 0 && (
        <span className="badge badge-neutral tabular">+{extra}</span>
      )}
    </span>
  );
};

const PriceRow = ({ product, showCategories, pricingLoading }) => (
  <tr
    className="border-t transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/15"
    style={{ borderColor: 'var(--hairline)' }}
  >
    <td
      className="max-w-0 truncate px-4 py-2 text-[13px] font-semibold"
      style={{ color: 'var(--text-strong)' }}
      title={product.name}
    >
      {product.name}
    </td>

    {showCategories && (
      <td className="px-4 py-2">
        <CategoryBadges product={product} />
      </td>
    )}

    <td className="price tabular whitespace-nowrap px-4 py-2 text-right text-[13px]" style={{ color: 'var(--text-body)' }}>
      {pricingLoading ? <PriceSkeleton /> : `₹${product.offlineMRP || product.price || 0}`}
    </td>

    <td className="price tabular whitespace-nowrap px-4 py-2 text-right text-[13px]">
      {pricingLoading ? (
        <PriceSkeleton />
      ) : product.offlineDiscountPrice ? (
        <span className="font-bold" style={{ color: 'var(--leaf-600)' }}>
          ₹{product.offlineDiscountPrice}
        </span>
      ) : (
        <span style={{ color: 'var(--text-subtle)' }}>—</span>
      )}
    </td>

    <td className="whitespace-nowrap px-4 py-2 text-right">
      <StockCell outOfStock={product.outOfStock} />
    </td>
  </tr>
);

const PriceTableHead = ({ showCategories }) => (
  <thead>
    <tr style={{ background: 'var(--surface-sunken)' }}>
      <th className="label-caps px-4 py-2.5 text-left">Product Name</th>
      {showCategories && <th className="label-caps px-4 py-2.5 text-left">Category</th>}
      <th className="label-caps whitespace-nowrap px-4 py-2.5 text-right">Offline MRP</th>
      <th className="label-caps whitespace-nowrap px-4 py-2.5 text-right">Sale Price</th>
      <th className="label-caps whitespace-nowrap px-4 py-2.5 text-right">Status</th>
    </tr>
  </thead>
);

const PriceList = () => {
  const {
    products,
    productsLoading,
    pricingLoading,
    productsError,
    pricingError,
    refresh,
  } = usePriceListData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');

  const rankByValue = useMemo(
    () => new Map(CATEGORY_VALUES.map((value, i) => [value, i])),
    []
  );

  /* One pass: per-category counts for the filter strip. */
  const categoryCounts = useMemo(() => {
    const counts = new Map(categories.map((cat) => [cat, 0]));
    for (const product of products) {
      counts.set('All', (counts.get('All') || 0) + 1);
      for (const cat of CATEGORY_VALUES) {
        if (isProductInCategory(product, cat)) {
          counts.set(cat, (counts.get(cat) || 0) + 1);
        }
      }
    }
    return counts;
  }, [products]);

  const query = searchQuery.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    const list = products.filter((product) => {
      if (!inCategory(product, selectedCategory)) return false;
      if (statusFilter === 'available' && product.outOfStock) return false;
      if (statusFilter === 'out' && !product.outOfStock) return false;
      if (query && !(product.name || '').toLowerCase().includes(query)) return false;
      return true;
    });
    /* Stable catalogue order: canonical category group, then name. */
    return [...list].sort(
      (a, b) => rankOf(a, rankByValue) - rankOf(b, rankByValue)
        || String(a.name || '').localeCompare(String(b.name || ''))
    );
  }, [products, selectedCategory, statusFilter, query, rankByValue]);

  const showCategories = selectedCategory === 'All';
  const isFiltered = Boolean(query) || selectedCategory !== 'All' || statusFilter !== 'all';
  const busy = productsLoading || pricingLoading;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusFilter('all');
  };

  const filterSummary = [
    query ? `"${searchQuery.trim()}"` : null,
    selectedCategory !== 'All' ? categoryDisplayName(selectedCategory) : null,
    statusFilter === 'available' ? 'Available' : statusFilter === 'out' ? 'Out of Stock' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="admin-page" style={{ background: 'var(--surface-page)' }}>
      <AdminHeader
        title="Price List"
        backFallback="/dashboard"
        controls={(
          <>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="ax-btn no-print"
              title="Refresh product and pricing data"
            >
              <RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="ax-btn no-print"
            >
              <Printer aria-hidden="true" />
              <span className="hidden sm:inline">Print price list</span>
              <span className="sm:hidden">Print</span>
            </button>
          </>
        )}
      />
      <div className="pricelist-print-area">
        <div className="shell py-6 md:py-8">
          {/* Print-only masthead. Screen users already have the page header. */}
          <div className="pl-print-head">
            <p className="pl-print-brand">Crackers Hyderabad</p>
            <p className="pl-print-meta">
              Price List
              {filterSummary ? ` — ${filterSummary}` : ''} · {filteredProducts.length} products · {new Date().toLocaleDateString()}
            </p>
          </div>

          <p className="tabular no-print mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Wholesale pricing and catalogue overview
            {!productsLoading && (
              <> · Showing {filteredProducts.length} of {products.length} products</>
            )}
          </p>

          {/* ---- Toolbar (screen only) -------------------------------------- */}
          <div className="no-print mt-4 rounded-[var(--r-lg)] border p-3" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
            {productsLoading ? (
              <div className="flex flex-col gap-2 sm:flex-row" aria-hidden="true">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 sm:w-44" />
                <Skeleton className="h-10 sm:w-36" />
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <label htmlFor="pricelist-search" className="sr-only">
                    Search products by name
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: 'var(--text-subtle)' }}
                    aria-hidden="true"
                  />
                  <input
                    id="pricelist-search"
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-premium w-full pl-10 text-sm"
                  />
                </div>
                <label className="sr-only" htmlFor="pricelist-category">Category</label>
                <select
                  id="pricelist-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-premium h-10 text-sm sm:w-44"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All categories' : categoryDisplayName(cat)}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="pricelist-status">Status</label>
                <select
                  id="pricelist-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-premium h-10 text-sm sm:w-36"
                >
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>
            )}
          </div>

          {/* ---- Category strip (screen only) -------------------------------- */}
          <div className="no-print mt-3" role="group" aria-label="Filter by category">
            {productsLoading ? (
              <div className="flex gap-2 overflow-hidden" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-28 shrink-0" rounded="var(--r-pill)" />
                ))}
              </div>
            ) : (
              <div className="scroll-x-pills -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {categories.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCategory(cat)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-[color:var(--hairline-strong)] bg-[color:var(--surface-card)] text-[color:var(--text-body)] hover:border-primary-400'
                      }`}
                    >
                      {cat === 'All' ? 'All' : categoryDisplayName(cat)}
                      <span className={`tabular text-xs font-bold ${active ? 'opacity-80' : 'opacity-70'}`}>
                        {categoryCounts.get(cat) || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ---- Pricing warning (non-blocking) ------------------------------- */}
          {!pricingLoading && pricingError && !productsLoading && (
            <div
              className="no-print mt-3 flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: 'var(--gold-500)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
              role="status"
            >
              <span>Trade pricing unavailable — showing catalogue prices.</span>
              <button type="button" onClick={refresh} className="underline" style={{ color: 'var(--gold-500)' }}>
                Retry pricing
              </button>
            </div>
          )}

          {/* ---- Table -------------------------------------------------------- */}
          <div className="mt-3" style={PANEL}>
            {productsLoading ? (
              <div className="p-4">
                <TableSkeleton rows={10} cols={showCategories ? 5 : 4} label="Loading price list" />
              </div>
            ) : productsError ? (
              <EmptyState
                icon={Package}
                title="Unable to load price list"
                description="The product catalogue could not be loaded."
                tone="alert"
                className="m-4"
                action={(
                  <button type="button" onClick={refresh} className="ax-btn">
                    <RefreshCw aria-hidden="true" /> Retry
                  </button>
                )}
              />
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No products found"
                description={isFiltered ? 'Nothing matches the current search and filters.' : 'The catalogue is empty.'}
                className="m-4"
                action={isFiltered ? (
                  <button type="button" onClick={clearFilters} className="ax-btn">
                    Clear filters
                  </button>
                ) : null}
              />
            ) : (
              <div className="scroll-x">
                <table className="pl-table w-full min-w-[40rem] border-collapse">
                  <PriceTableHead showCategories={showCategories} />
                  <tbody>
                    {filteredProducts.map((product) => (
                      <PriceRow
                        key={product.id}
                        product={product}
                        showCategories={showCategories}
                        pricingLoading={pricingLoading}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .pl-print-head { display: none; }
        .scroll-x-pills { scrollbar-width: thin; }

        @media print {
          @page { margin: 12mm; }

          body * { visibility: hidden !important; }

          .pricelist-print-area,
          .pricelist-print-area * { visibility: visible !important; }

          .pricelist-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          .pl-print-head {
            display: block;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #000000;
          }

          .pl-print-brand {
            font-size: 18px;
            font-weight: 700;
            margin: 0;
          }

          .pl-print-meta {
            font-size: 11px;
            margin: 2px 0 0 0;
          }

          .pl-table { font-size: 11px; min-width: 0 !important; }
          .pl-table th,
          .pl-table td { padding: 5px 6px !important; }
          .pl-table thead { display: table-header-group; }
          .pl-table tr { break-inside: avoid; }
          .pl-table .badge { border: 0 !important; background: transparent !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default PriceList;
