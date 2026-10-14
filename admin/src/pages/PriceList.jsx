import { useState, useMemo, Fragment } from 'react';
import { Search, Package, Printer, RefreshCw } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { displayNameForCategory } from '../lib/categoryIcons';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import AdminHeader from '../components/admin/AdminHeader';
import { CATEGORY_VALUES, isProductInCategory, categoryDisplayName, productCategoryValues } from '../config/categories';
import { usePriceListData } from '../hooks/usePriceListData';
import { PRICE_LIST_SECTIONS, formatINR, groupProductsForPrint, availabilityOf, screenGroupOf, printStatusOf } from '../lib/priceListPricing';

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

/* Print tables: one continuous table per selected store. The offline table
   is Product/Price; the online table carries the full register columns.
   Category separator rows (text bands) break groups visually without ever
   splitting the table — the first group needs none, the masthead serves it. */
const OfflinePrintTable = ({ groups, section, snoById, pricingLoading }) => (
  <table className="pl-print-table">
    <colgroup>
      <col style={{ width: '8%' }} />
      <col style={{ width: '72%' }} />
      <col style={{ width: '20%' }} />
    </colgroup>
    <thead>
      <tr>
        <th className="pl-print-h-sno">S.No</th>
        <th className="pl-print-h-name">Product</th>
        <th className="pl-print-h-money">Price</th>
      </tr>
    </thead>
    <tbody>
      {groups.map((group) => (
        <Fragment key={group.key}>
          {group.items.map((product, itemIndex) => {
            const { mrp, sale } = section.valueOf(product);
            const price = sale || mrp;
            return (
              <tr key={product.id} className={itemIndex === 0 ? 'pl-group-first' : undefined}>
                <td className="pl-print-sno">{snoById.get(product.id)}</td>
                <td className="pl-print-name">{product.name}</td>
                <td className="pl-print-money">{pricingLoading ? '' : formatINR(price)}</td>
              </tr>
            );
          })}
        </Fragment>
      ))}
    </tbody>
  </table>
);

const OnlinePrintTable = ({ groups, section, snoById, pricingLoading }) => (
  <table className="pl-print-table pl-print-table-wide">
    <colgroup>
      <col style={{ width: '7%' }} />
      <col style={{ width: '37%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '13%' }} />
      <col style={{ width: '15%' }} />
    </colgroup>
    <thead>
      <tr>
        <th className="pl-print-h-sno">S.No</th>
        <th className="pl-print-h-name">Product Name</th>
        <th className="pl-print-h-cat">Category</th>
        <th className="pl-print-h-money">Offline MRP</th>
        <th className="pl-print-h-money">Sale Price</th>
        <th className="pl-print-h-status">Status</th>
      </tr>
    </thead>
    <tbody>
      {groups.map((group) => (
        <Fragment key={group.key}>
          {group.items.map((product, itemIndex) => {
            const { mrp, sale } = section.valueOf(product);
            return (
              <tr key={product.id} className={itemIndex === 0 ? 'pl-group-first' : undefined}>
                <td className="pl-print-sno">{snoById.get(product.id)}</td>
                <td className="pl-print-name">{product.name}</td>
                <td className="pl-print-cat" />
                <td className="pl-print-money">{pricingLoading ? '' : formatINR(mrp)}</td>
                <td className="pl-print-money">{pricingLoading ? '' : (sale ? formatINR(sale) : '—')}</td>
                <td className={`pl-print-status${product.outOfStock ? ' is-oos' : ''}`}>{printStatusOf(product)}</td>
              </tr>
            );
          })}
        </Fragment>
      ))}
    </tbody>
  </table>
);
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

  /* Print with the store's name as the suggested PDF filename: browsers name
     "Save as PDF" output after document.title, so it is swapped for the
     print and restored the moment the dialog closes (plus a fallback timer
     in case the event is missed). Tab title is unaffected afterwards. */
  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = section.fileName;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    setTimeout(restore, 1500);
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
              className="ax-btn no-print"
              title="Print price list (in the print dialog, turn off Headers and footers for a clean PDF)"
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

          {/* ---- Print document: the selected store only ----------------------
               A separate print-only document (never an embedded preview): the
               company masthead once, then one continuous table with category
               separator rows and a running S.No. The screen sheet above is
               hidden in print. */}
          <div className={`pl-print-doc pl-print-${section.key}`}>
            <div className="pl-print-head">
              <img src={section.logo} alt="" className="pl-print-logo" />
              <p className="pl-print-brand">{section.brand}</p>
              <h2 className="pl-print-title">{section.printTitle}</h2>
              <div className="pl-print-div" aria-hidden="true" />
            </div>
            {section.key === 'online' ? (
              <OnlinePrintTable groups={printGroups} section={section} snoById={snoById} pricingLoading={pricingLoading} />
            ) : (
              <OfflinePrintTable groups={printGroups} section={section} snoById={snoById} pricingLoading={pricingLoading} />
            )}
          </div>
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

          /* The print document never shows on screen. */
          .pl-print-doc { display: none; }

        /* ================= Print: the separate document ================
           Only .pl-print-doc prints: centred masthead once, then ONE
           continuous table with full-width category separator rows and a
           single header that repeats per printed page. Both stores footer
           their pages; nothing else paginates. */
        @media print {
          @page {
            size: A4 portrait;
            margin: 40px 45px 40px 45px;
          }
          /* Each store owns a named page carrying its own whisper-quiet
             footer (brand + page count). */
          @page pl-online {
            @bottom-center {
              content: "CRACKERS HYDERABAD · PRICE LIST · Page " counter(page) " of " counter(pages);
              font-size: 8px;
              color: #888888;
              font-family: Arial, Helvetica, sans-serif;
            }
          }
          @page pl-offline {
            @bottom-center {
              content: "AYYAPA FIREWORKS · OFFLINE STORE · Page " counter(page) " of " counter(pages);
              font-size: 8px;
              color: #888888;
              font-family: Arial, Helvetica, sans-serif;
            }
          }

          /* Admin chrome leaves normal flow entirely (display, not
             visibility): the document starts at the top of page 1 with no
             absolute positioning — absolute containers suppress paged-media
             features in Chrome. Named one by one (never a blind global
             button hide): sidebar, mobile drawer + veil + close, mobile nav
             trigger (the circular hamburger always leaks into print below
             desktop widths), top bar, page header, and toast popups. These
             rules live in this page's style block so no other admin screen
             is affected. */
          .asb-desktop,
          .asb-drawer,
          .asb-drawer-veil,
          .asb-drawer-close,
          .asb-fab,
          .admin-topbar,
          .ax-header,
          .react-hot-toast { display: none !important; }
          .admin-main { overflow: visible !important; padding: 0 !important; }
          .page-enter { min-height: 0 !important; animation: none !important; }
          .admin-page { padding: 0 !important; margin: 0 !important; background: #FFFFFF !important; }
          body { margin: 0 !important; }

          .pricelist-print-area {
            width: 100%;
            background: #FFFFFF !important;
          }

          /* Full printable width — release the screen shell constraints. */
          .pricelist-print-area .shell {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
          }

          /* Screen sheet off, print document on. No page frame: the table's
             own outer border is the document's single boundary. */
          .pl-sheet { display: none !important; }
          .pl-print-doc { display: block !important; }
          .pl-print-online { page: pl-online; }
          .pl-print-offline { page: pl-offline; }

          .pl-print-head { text-align: center; padding: 2mm 0 0 0; }
          .pl-print-logo {
            height: 88px;
            width: auto;
            max-width: 280px;
            object-fit: contain;
            display: block;
            margin: 0 auto 10px auto;
          }
          .pl-print-brand {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.14em;
            color: #1A1A1A;
          }
          .pl-print-title {
            margin: 4px 0 0 0;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 21px;
            font-weight: 800;
            letter-spacing: 0.05em;
            color: #1A1A1A;
          }
          .pl-print-online .pl-print-title { color: #B3401F; }
          /* Offline hierarchy: the gold brand name leads, the dark-blue
             title follows smaller — both drawn from the Ayyappa logo
             palette (gold sampled from the mark, deep complementary blue;
             the mark itself carries no blue). */
          .pl-print-offline .pl-print-brand { color: #B28E03; font-size: 19px; letter-spacing: 0.06em; }
          .pl-print-offline .pl-print-title { color: #1E40AF; font-size: 14px; margin-top: 4px; }
          /* Short centred divider — never a full-width bar, never a box
             around the header. Shared geometry, per-brand colour. */
          .pl-print-div {
            width: 72mm;
            margin: 5mm auto 0 auto;
            border-top: 2px solid #111111;
          }
          .pl-print-online .pl-print-div { border-top-color: #B3401F; }
          .pl-print-offline .pl-print-div { border-top-color: #1E40AF; }

          .pl-print-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            background: #FFFFFF !important;
            color: #111111 !important;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            margin-top: 3mm;
            border: 1px solid #999999;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .pl-print-table thead { display: table-header-group; }
          .pl-print-table thead th {
            position: static !important;
            background: #F1EFEA !important;
            color: #111111 !important;
            font-weight: 800;
            font-size: 10px;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            text-align: left;
            padding: 6px 8px !important;
            border-bottom: 2px solid #111111 !important;
          }
          .pl-print-table thead th + th { text-align: right !important; border-left: 1px solid #D8D4CC !important; }
          .pl-print-table thead th.pl-print-h-sno { text-align: center !important; }
          .pl-print-table tbody td {
            background: #FFFFFF !important;
            color: #111111 !important;
            border-bottom: 1px solid #D8D4CC !important;
            padding: 5px 8px !important;
            vertical-align: top !important;
          }
          .pl-print-table tbody td + td { border-left: 1px solid #E7E4DD !important; }
          .pl-print-table tr { break-inside: avoid; page-break-inside: avoid; }
          .pl-print-name {
            font-weight: 600;
            line-height: 1.35;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .pl-print-sno {
            text-align: center;
            color: #555555 !important;
            font-variant-numeric: tabular-nums;
          }
          .pl-print-money {
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
          }
          /* Category transitions, text-free: the first row of each group
             carries a thin accent top border — a single quiet line, same
             row height as every other row. The very first row needs none of
             it (the masthead divider already separates it). The row keeps
             with the one that follows so a lone first row never strands at
             a page bottom. */
          .pl-print-table tr.pl-group-first td {
            border-top: 1px solid #111111 !important;
          }
          .pl-print-online tr.pl-group-first td { border-top-color: #B3401F !important; }
          .pl-print-offline tr.pl-group-first td { border-top-color: #B28E03 !important; }
          .pl-print-table tbody > tr.pl-group-first:first-child td {
            border-top-color: #D8D4CC !important;
          }
          .pl-print-table tr.pl-group-first { break-after: avoid; page-break-after: avoid; }
          /* Screen-only actions inside states stay out of the document. */
          .pricelist-print-area .ax-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default PriceList;
