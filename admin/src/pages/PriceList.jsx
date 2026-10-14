import { useState, useMemo, Fragment } from 'react';
import { Search, Package, Printer, RefreshCw } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { displayNameForCategory } from '../lib/categoryIcons';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import AdminHeader from '../components/admin/AdminHeader';
import { CATEGORY_VALUES, isProductInCategory, categoryDisplayName, productCategoryValues } from '../config/categories';
import { usePriceListData } from '../hooks/usePriceListData';
import { PRICE_LIST_SECTIONS, formatINR, groupProductsForPrint, availabilityOf, screenGroupOf, printStatusOf } from '../lib/priceListPricing';
import { buildPriceListRows, loadLogoDataUrl, pdfBrandingFor, printPriceListPDF } from '../utils/priceListPdf';

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

const PriceSkeleton = () => (
  <span className="pl-skel inline-block h-4 w-14 rounded" aria-hidden="true" />
);

/* Compact availability readout driven by the catalogue's own stock flag —
   the same field the status filter reads. Small dot + words, no big badge. */
const AvailabilityCell = ({ outOfStock }) => (
  <span className="pl-stock inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
    <span
      aria-hidden="true"
      className="pl-dot h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: outOfStock ? '#C0453E' : '#2E8B57' }}
    />
    <span className={outOfStock ? 'pl-oos' : 'pl-avail'}>
      {availabilityOf({ outOfStock })}
    </span>
  </span>
);

const CategoryBadges = ({ product }) => {
  const values = productCategoryValues(product);
  if (values.length === 0) {
    return <span className="pl-dash">—</span>;
  }
  const shown = values.slice(0, 2);
  const extra = values.length - shown.length;
  return (
    <span className="pl-cats">
      {shown.map((value) => (
        <span key={value} className="pl-cat">
          {displayNameForCategory(value)}
        </span>
      ))}
      {extra > 0 && (
        <span className="pl-cat tabular">+{extra}</span>
      )}
    </span>
  );
};

/* One row shape for the screen table — the caller passes the section's own
   { mrp, sale } pair (see priceListPricing.js), so online and offline values
   can never cross into each other's table. Names wrap, never truncate. */
const PriceRow = ({ product, sno, pricingLoading, mrp, sale }) => {
  const price = sale || mrp;
  return (
    <tr className="pl-row">
      <td className="pl-sno">
        {sno}
      </td>
      <td className="pl-name" title={product.name}>
        {product.name}
      </td>
      <td className="pl-cat">
        <CategoryBadges product={product} />
      </td>
      <td className="pl-money">
        {pricingLoading ? <PriceSkeleton /> : formatINR(mrp)}
      </td>
      <td className="pl-money pl-sale">
        {pricingLoading ? <PriceSkeleton /> : <span className="pl-sale-value">{formatINR(price)}</span>}
      </td>
      <td className="pl-status">
        <AvailabilityCell outOfStock={product.outOfStock} />
      </td>
    </tr>
  );
};

const PriceTableHead = ({ mrpLabel, priceLabel }) => (
  <thead>
    <tr>
      <th className="pl-h-sno">S.No</th>
      <th className="pl-h-name">Product</th>
      <th className="pl-h-cat">Category</th>
      <th className="pl-h-money">{mrpLabel}</th>
      <th className="pl-h-money">{priceLabel}</th>
      <th className="pl-h-status">Availability</th>
    </tr>
  </thead>
);

/* Two-option store switcher. The same control renders in the navbar (compact)
   and in the content area — both flip the one shared state, so the table,
   the print document and both switchers always agree. */
const StoreSwitch = ({ value, onChange, compact = false }) => (
  <div role="group" aria-label="Price list store" className={`pl-switch${compact ? ' pl-switch-compact' : ''}`}>
    {[
      { key: 'online', label: 'ONLINE STORE' },
      { key: 'offline', label: 'OFFLINE STORE' },
    ].map((option) => {
      const active = value === option.key;
      return (
        <button
          key={option.key}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.key)}
          className={`pl-switch-btn${active ? ' is-active' : ''}`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
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
  const [pdfBusy, setPdfBusy] = useState(false);
  /* Visible store: "online" | "offline". One variable drives both switchers,
     the table values and the printed document — flipping it re-renders only
     this page (no navigation, no reload). */
  const [priceListMode, setPriceListMode] = useState('online');

  const section = PRICE_LIST_SECTIONS.find((s) => s.key === priceListMode) || PRICE_LIST_SECTIONS[0];

  const rankByValue = useMemo(
    () => new Map(CATEGORY_VALUES.map((value, i) => [value, i])),
    []
  );

  const query = searchQuery.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    const list = products.filter((product) => {
      if (!inCategory(product, selectedCategory)) return false;
      if (statusFilter === 'available' && product.outOfStock) return false;
      if (statusFilter === 'out' && !product.outOfStock) return false;
      if (query && !(product.name || '').toLowerCase().includes(query)) return false;
      return true;
    });
    /* Stable catalogue order: canonical category group, then name. The screen
       S.No and the printed S.No both follow this order. */
    return [...list].sort(
      (a, b) => rankOf(a, rankByValue) - rankOf(b, rankByValue)
        || String(a.name || '').localeCompare(String(b.name || ''))
    );
  }, [products, selectedCategory, statusFilter, query, rankByValue]);

  const isFiltered = Boolean(query) || selectedCategory !== 'All' || statusFilter !== 'all';
  const busy = productsLoading || pricingLoading;

  /* Print catalogue: the filtered list grouped by existing category
     (canonical order, uncategorised last). Same products, same order as the
     screen table — only regrouped for the document. */
  const printGroups = useMemo(() => groupProductsForPrint(filteredProducts), [filteredProducts]);

  /* Screen separator bands use the exact same grouping rule, resolved per
     displayed row — the band above a row always names its group. */
  const screenGroups = useMemo(() => filteredProducts.map(screenGroupOf), [filteredProducts]);

  /* Continuous S.No across category groups: a product keeps the number of
     its position in the filtered list, whatever group prints it. */
  const snoById = useMemo(
    () => new Map(filteredProducts.map((product, index) => [product.id, index + 1])),
    [filteredProducts]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusFilter('all');
  };

  /* PDF document: the selected store rendered through the shared jsPDF
     engine (utils/priceListPdf.js) — one 6-column register
     (S.No/Product/Category/MRP/Sale/Status), brand header on page 1 only,
     table head repeated on every page, one compact heading band per
     category (existing grouping, never invented), content-aware pagination,
     real stock status. Same structure for both stores; only branding +
     values differ. */
  const handlePrint = async () => {
    if (pdfBusy || filteredProducts.length === 0) return;
    setPdfBusy(true);
    try {
      const rows = buildPriceListRows({
        groups: printGroups,
        snoById,
        valueOf: section.valueOf,
        formatPrice: formatINR,
        statusOf: printStatusOf,
        categoryOf: (product) =>
          productCategoryValues(product).map(categoryDisplayName).filter(Boolean).join(', ') || '—',
        labelOf: (group) => group.label,
      });
      const logoDataUrl = await loadLogoDataUrl(section.logo);
      printPriceListPDF(pdfBrandingFor(section, logoDataUrl), rows);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="admin-page" style={{ background: 'var(--surface-page)' }}>
      <AdminHeader
        title="Price List"
        backFallback="/dashboard"
        leftControls={(
          <span className="no-print" style={{ display: 'inline-flex', marginLeft: 8 }}>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="ax-btn"
              title="Refresh product and pricing data"
            >
              <RefreshCw aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </span>
        )}
        controls={(
          <>
            <span className="no-print">
              <StoreSwitch value={priceListMode} onChange={setPriceListMode} compact />
            </span>
            <button
              type="button"
              onClick={handlePrint}
              disabled={pdfBusy || filteredProducts.length === 0}
              className="ax-btn no-print"
              title="Download the price list PDF for the selected store"
            >
              <Printer aria-hidden="true" />
              <span className="hidden sm:inline">{pdfBusy ? 'Preparing…' : 'Print price list'}</span>
              <span className="sm:hidden">Print</span>
            </button>
          </>
        )}
      />
      <div className="pricelist-print-area">
        <div className="shell py-6 md:py-8">
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
                  className="input-premium pl-select h-10 text-sm sm:w-44"
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
                  className="input-premium pl-select h-10 text-sm sm:w-36"
                >
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="out">Out of Stock</option>
                </select>
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

          {/* ---- Screen table: the selected store only ------------------------ */}
          <section className="pl-sheet mt-4">
            {productsLoading ? (
              <div className="pl-body-pad">
                <TableSkeleton rows={10} cols={6} label={`Loading ${section.title}`} />
              </div>
            ) : productsError ? (
              <div className="pl-body-pad">
                <EmptyState
                  icon={Package}
                  title="Unable to load price list"
                  description="The product catalogue could not be loaded."
                  tone="alert"
                  action={(
                    <button type="button" onClick={refresh} className="ax-btn no-print">
                      <RefreshCw aria-hidden="true" /> Retry
                    </button>
                  )}
                />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="pl-body-pad">
                <EmptyState
                  icon={Package}
                  title="No products found"
                  description={isFiltered ? 'Nothing matches the current search and filters.' : 'The catalogue is empty.'}
                  action={isFiltered ? (
                    <button type="button" onClick={clearFilters} className="ax-btn no-print">
                      Clear filters
                    </button>
                  ) : null}
                />
              </div>
            ) : (
              <div className="pl-table-wrap">
                {/* Fixed layout: name owns the width it needs, S.No stays
                    narrow and centred, prices right aligned. Category always
                    shows — filtering never hides columns. */}
                <table className="pl-table">
                  <colgroup>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '36%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '13%' }} />
                  </colgroup>
                  <PriceTableHead mrpLabel={section.mrpLabel} priceLabel={section.priceLabel} />
                  <tbody>
                    {filteredProducts.map((product, index) => {
                      const { mrp, sale } = section.valueOf(product);
                      const group = screenGroups[index] || screenGroupOf(product);
                      const showSeparator = index === 0 || (screenGroups[index - 1] || {}).key !== group.key;
                      return (
                        <Fragment key={product.id}>
                          {showSeparator && (
                            <tr className="pl-sep">
                              <td colSpan={6}>{group.label}</td>
                            </tr>
                          )}
                          <PriceRow
                            product={product}
                            sno={index + 1}
                            pricingLoading={pricingLoading}
                            mrp={mrp}
                            sale={sale}
                          />
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>

      <style>{`
        .scroll-x-pills { scrollbar-width: thin; }

        /* ================= Screen: store switch ========================
           Restrained two-option segmented control, in the navbar (compact)
           and above the table. The active store reads instantly; nothing
           glows, floats or animates. */
        .pl-switch {
          display: inline-flex;
          gap: 2px;
          padding: 3px;
          border: 1px solid var(--hairline-strong);
          border-radius: 999px;
          background: var(--surface-card);
        }
        .pl-switch-btn {
          border: 0;
          border-radius: 999px;
          background: transparent;
          padding: 8px 26px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 120ms ease-out, color 120ms ease-out;
        }
        .pl-switch-btn:hover { color: var(--text-strong); }
        .pl-switch-btn.is-active { background: #FFFFFF; color: #1A1A1A; }
        .pl-switch-btn:focus-visible { outline: 2px solid var(--gold-500); outline-offset: 2px; }
        /* Compact navbar variant: same control, tighter to fit beside the
           action buttons without crowding the bar. */
        .pl-switch-compact { padding: 2px; }
        .pl-switch-compact .pl-switch-btn { padding: 6px 14px; font-size: 11px; }

        /* Readable dropdowns: dark website-themed control with light text,
           visible border and states — never faint-on-light. */
        select.pl-select.input-premium {
          background-color: var(--surface-card);
          color: var(--text-body);
          border: 1px solid var(--hairline-strong);
        }
        select.pl-select.input-premium:hover { border-color: var(--gold-500); }
        select.pl-select.input-premium:focus {
          outline: 2px solid var(--gold-500);
          outline-offset: 1px;
          border-color: var(--gold-500);
        }
        select.pl-select.input-premium option {
          background-color: #1E1815;
          color: #D6CEC3;
        }

        /* ================= Screen: dark admin table ====================
           The working table lives on the dark admin theme: dark card,
           clearly visible row + column borders, sticky head, subtle hover.
           Print styling is separate below and never leaks in. */
        .pl-sheet {
          background: var(--surface-card);
          color: var(--text-body);
          border: 1px solid var(--hairline-strong);
          border-radius: 10px;
          overflow: hidden;
        }
        .pl-body-pad { padding: 16px; }
        .pl-table-wrap { overflow: visible; }
        @media (max-width: 767px) {
          .pl-table-wrap { overflow-x: auto; }
          .pl-table-wrap .pl-table { min-width: 44rem; }
        }

        /* Screen table: dark rows, sticky head, subtle hover. */
        .pl-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          background: transparent;
          color: var(--text-body);
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12.5px;
        }
        .pl-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: var(--surface-card);
          color: var(--text-strong);
          font-weight: 800;
          font-size: 10.5px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          text-align: left;
          padding: 8px 10px;
          border-bottom: 2px solid var(--hairline-strong);
        }
        .pl-table thead th + th { border-left: 1px solid var(--hairline); }
        .pl-h-sno { text-align: center; }
        .pl-h-money, .pl-h-status { text-align: right; white-space: nowrap; }
        .pl-table tbody td {
          padding: 7px 10px;
          vertical-align: top;
          border-bottom: 1px solid var(--hairline);
          background: transparent;
          color: var(--text-body);
        }
        .pl-table tbody td + td { border-left: 1px solid var(--hairline); }
        .pl-table tbody tr:nth-child(even) td { background: rgba(237, 231, 223, 0.025); }
        .pl-table tbody tr:hover td { background: rgba(237, 231, 223, 0.06); }
        .pl-sno {
          text-align: center;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        .pl-name {
          font-weight: 600;
          line-height: 1.4;
          overflow-wrap: break-word;
          word-break: normal;
          color: var(--text-strong);
        }
        .pl-cat { color: var(--text-muted); font-size: 11.5px; overflow-wrap: break-word; }
        .pl-cats { display: flex; flex-wrap: wrap; gap: 4px; }
        .pl-cats .pl-cat {
          display: inline-block;
          border: 1px solid var(--hairline-strong);
          background: rgba(237, 231, 223, 0.05);
          border-radius: 20px;
          padding: 1px 8px;
          font-size: 10.5px;
          color: var(--text-body);
          white-space: nowrap;
        }
        .pl-money {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          color: var(--text-body);
        }
        .pl-sale-value { font-weight: 800; color: var(--text-strong); }
        .pl-status { text-align: right; }
        .pl-avail { color: #4FB483; font-weight: 700; }
        .pl-oos { color: #F2716B; font-weight: 700; }
        .pl-dash { color: var(--text-muted); }
        .pl-skel { background: var(--surface-raised); }
        /* Category separator band: full-width, compact, clearly distinct
           from product rows without boxing anything. Screen only — the
           print document has its own separator rows. */
        .pl-table tbody tr.pl-sep td {
          background: rgba(237, 231, 223, 0.06);
          border-top: 1px solid var(--hairline-strong);
          border-bottom: 1px solid var(--hairline-strong);
          padding: 7px 10px 6px 10px;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-strong);
        }

        /* ================= Print fallback ============================
           The document ships as a generated PDF (see handlePrint above), so
           browser printing is only a fallback: hide the app chrome and the
           toolbar, keep the working table. */
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          .asb-desktop,
          .asb-drawer,
          .asb-drawer-veil,
          .asb-drawer-close,
          .asb-fab,
          .admin-topbar,
          .ax-header,
          .react-hot-toast,
          .no-print { display: none !important; }
          .admin-main { overflow: visible !important; padding: 0 !important; }
          .page-enter { min-height: 0 !important; animation: none !important; }
          .admin-page { padding: 0 !important; margin: 0 !important; }
          .pl-table thead th { position: static; }
          .pl-table tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};

export default PriceList;
