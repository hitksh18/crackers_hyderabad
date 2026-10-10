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
      className="pl-dot h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: outOfStock ? 'var(--delta-down, #f2716b)' : 'var(--delta-up, #4fb483)' }}
    />
    <span className={outOfStock ? 'pl-oos' : 'pl-avail'} style={{ color: outOfStock ? 'var(--delta-down, #f2716b)' : 'var(--delta-up, #4fb483)' }}>
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

/* Indian currency display only — values are untouched. Integers render
   without decimals (₹1,493); genuine paise keep up to 2 trimmed decimals. */
const formatINR = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const PriceRow = ({ product, showCategories, pricingLoading }) => (
  <tr
    className="pl-row border-t transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/15"
    style={{ borderColor: 'var(--hairline)' }}
  >
    {/* Full product name — wraps to 2–3 lines, never truncated. */}
    <td
      className="pl-name px-4 py-2.5 align-top text-[13px] font-semibold"
      style={{ color: 'var(--text-strong)', lineHeight: 1.4 }}
      title={product.name}
    >
      {product.name}
    </td>

    {showCategories && (
      <td className="pl-cat px-4 py-2.5 align-top">
        <CategoryBadges product={product} />
      </td>
    )}

    <td className="price tabular whitespace-nowrap px-4 py-2.5 text-right align-top text-[13px]" style={{ color: 'var(--text-body)' }}>
      {pricingLoading ? <PriceSkeleton /> : formatINR(product.offlineMRP || product.price || 0)}
    </td>

    <td className="price tabular whitespace-nowrap px-4 py-2.5 text-right align-top text-[13px]">
      {pricingLoading ? (
        <PriceSkeleton />
      ) : product.offlineDiscountPrice ? (
        <span className="font-bold" style={{ color: 'var(--leaf-600)' }}>
          {formatINR(product.offlineDiscountPrice)}
        </span>
      ) : (
        <span style={{ color: 'var(--text-subtle)' }}>—</span>
      )}
    </td>

    <td className="pl-status whitespace-nowrap px-4 py-2.5 text-right align-top">
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
          {/* Print-only masthead (page 1). Screen users already have the page header.
              Continuation pages are identified by the repeated table header
              plus the "Crackers Hyderabad · Price List · Page X of Y" footer
              on every page. */}
          <div className="pl-print-head">
            <p className="pl-print-brand">CRACKERS HYDERABAD</p>
            <p className="pl-print-title">PRICE LIST</p>
            <p className="pl-print-meta">
              Generated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {filteredProducts.length} Products
              {filterSummary ? ` · ${filterSummary}` : ''}
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
              <div className="pl-scroll">
                {/* Fixed layout + colgroup: the name column owns ~half the
                    width on screen and in print; prices/status stay compact
                    and right aligned. When a category is selected the category
                    column is hidden and its share goes to the name column. */}
                <table className="pl-table w-full border-collapse">
                  {showCategories ? (
                    <colgroup>
                      <col style={{ width: '46%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '10%' }} />
                    </colgroup>
                  ) : (
                    <colgroup>
                      <col style={{ width: '58%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                  )}
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

        /* ---- Screen table: fixed layout, wrapping names, sticky head ---- */
        .pl-table { table-layout: fixed; }
        .pl-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: var(--surface-sunken);
        }
        .pl-name {
          overflow-wrap: break-word;
          word-break: normal;
          hyphens: none;
        }
        /* Desktop: no horizontal scroll — the table fits the content width. */
        .pl-scroll { overflow: visible; }
        /* Small screens: allow the table to scroll horizontally instead of
           crushing the columns. Desktop is unaffected. */
        @media (max-width: 767px) {
          .pl-scroll { overflow-x: auto; }
          .pl-scroll .pl-table { min-width: 40rem; }
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm 9mm 13mm 9mm;
            @bottom-center {
              content: "Crackers Hyderabad · Price List · Page " counter(page) " of " counter(pages);
              font-size: 8px;
              color: #777777;
              font-family: Arial, Helvetica, sans-serif;
            }
          }

          body * { visibility: hidden !important; }

          .pricelist-print-area,
          .pricelist-print-area * { visibility: visible !important; }

          .pricelist-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #FFFFFF !important;
          }

          /* Full printable width — release the screen shell constraints. */
          .pricelist-print-area .shell {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
          }
          .pricelist-print-area .pl-scroll { overflow: visible !important; }

          /* Compact page-1 masthead with a thin brand accent line. */
          .pl-print-head {
            display: block;
            margin-bottom: 5px;
            padding-bottom: 4px;
            border-bottom: 2px solid #B3401F;
          }

          .pl-print-brand {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 0.08em;
            margin: 0;
            color: #111111 !important;
            font-family: Arial, Helvetica, sans-serif;
          }

          .pl-print-title {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.22em;
            margin: 1px 0 0 0;
            color: #B3401F !important;
            font-family: Arial, Helvetica, sans-serif;
          }

          .pl-print-meta {
            font-size: 9px;
            margin: 1px 0 0 0;
            color: #555555 !important;
            font-family: Arial, Helvetica, sans-serif;
          }

          /* Compact professional table: dark text, subtle borders, zebra. */
          .pl-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            font-size: 10px;
            font-family: Arial, Helvetica, sans-serif;
            border-collapse: collapse;
            background: #FFFFFF !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .pl-table thead { display: table-header-group; }
          .pl-table thead th {
            position: static !important;
            background: #E4E4E4 !important;
            color: #111111 !important;
            font-weight: 800;
            font-size: 9px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            border-top: 1px solid #888888 !important;
            border-bottom: 2px solid #555555 !important;
            border-left: 1px solid #BBBBBB !important;
            border-right: 1px solid #BBBBBB !important;
            padding: 4px 6px !important;
          }
          .pl-table thead th:nth-child(3),
          .pl-table thead th:nth-child(4) { text-align: right !important; }
          .pl-table tbody td {
            background: #FFFFFF !important;
            color: #111111 !important;
            border: 1px solid #CCCCCC !important;
            box-shadow: none !important;
            padding: 3px 6px !important;
            vertical-align: top !important;
          }
          /* Alternating rows for scanability (needs the exact-adjust above). */
          .pl-table tbody tr:nth-child(even) td { background: #F5F5F5 !important; }
          .pl-table tr { break-inside: avoid; page-break-inside: avoid; }
          .pl-table tr:hover td { background: #FFFFFF !important; }
          .pl-table tbody tr:nth-child(even):hover td { background: #F5F5F5 !important; }

          /* Complete names in print — never ellipsis, wrap to more lines. */
          .pl-table .pl-name,
          .pl-table td.truncate {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            line-height: 1.35 !important;
            color: #111111 !important;
          }
          /* Category wraps too; badges flatten to plain text. */
          .pl-table .pl-cat {
            overflow-wrap: break-word !important;
            color: #333333 !important;
          }
          /* MRP secondary, sale price emphasized — both tabular. */
          .pl-table .price { color: #444444 !important; font-weight: 400 !important; }
          .pl-table .price .font-bold { color: #111111 !important; font-weight: 800 !important; }
          .pl-table .badge {
            border: 0 !important;
            background: transparent !important;
            padding: 0 !important;
            box-shadow: none !important;
            color: #333333 !important;
            font-weight: 400 !important;
          }
          /* Status centered with a clear text indicator. */
          .pl-table thead th:last-child { text-align: center !important; }
          .pl-table .pl-status { text-align: center !important; }
          .pl-table .pl-avail { color: #1A7A3C !important; font-weight: 700 !important; }
          .pl-table .pl-oos { color: #B02020 !important; font-weight: 700 !important; }
          .pl-table .pl-dot { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default PriceList;
