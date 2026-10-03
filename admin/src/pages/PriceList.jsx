import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import toast from '../utils/toast';
import { Search, Package, Printer, CircleCheck, CircleSlash, Layers } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import CategoryIcon from '../components/CategoryIconPack';
import { slugForCategory, displayNameForCategory } from '../lib/categoryIcons';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import { fetchTradePricingMap, mergeTradePricing } from '../lib/tradePricing';
import AdminHeader from '../components/admin/AdminHeader';

const categories = ['All', 'Rockets', 'Sparkles', 'Ground Chakkars', 'Sky Shots', 'Gift Boxes', 'Flower Pots', 'Bombs', 'Garlands', 'Kids Special', 'Guns, Rolls & Pop Pop', 'Threads and Novelties'];

/** Same membership rule the list has always used — array form first, single field second. */
const inCategory = (product, category) => {
  if (product.categories && Array.isArray(product.categories)) {
    return product.categories.includes(category);
  }
  return product.category === category;
};

const PANEL = {
  background: 'var(--surface-card)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
};

const StockCell = ({ outOfStock }) =>
  outOfStock ? (
    <span className="badge badge-crimson">
      <CircleSlash className="h-3 w-3" aria-hidden="true" />
      Out of Stock
    </span>
  ) : (
    <span className="badge badge-leaf">
      <CircleCheck className="h-3 w-3" aria-hidden="true" />
      Available
    </span>
  );

const PriceRow = ({ product, showCategories }) => (
  <tr
    className="border-t transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/15"
    style={{ borderColor: 'var(--hairline)' }}
  >
    <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
      {product.name}
    </td>

    {showCategories && (
      <td className="px-4 py-2.5">
        <span className="flex flex-wrap gap-1">
          {(product.categories || [product.category]).map((cat, idx) => (
            <span key={idx} className="badge badge-neutral">
              {displayNameForCategory(cat)}
            </span>
          ))}
        </span>
      </td>
    )}

    <td className="price px-4 py-2.5 text-right text-sm" style={{ color: 'var(--text-body)' }}>
      ₹{product.offlineMRP || product.price || 0}
    </td>

    <td className="price px-4 py-2.5 text-right text-sm">
      {product.offlineDiscountPrice ? (
        <span className="font-bold" style={{ color: 'var(--leaf-600)' }}>
          ₹{product.offlineDiscountPrice}
        </span>
      ) : (
        <span style={{ color: 'var(--text-subtle)' }}>—</span>
      )}
    </td>

    <td className="px-4 py-2.5 text-right">
      <StockCell outOfStock={product.outOfStock} />
    </td>
  </tr>
);

const PriceTableHead = ({ showCategories }) => (
  <thead>
    <tr style={{ background: 'var(--surface-sunken)' }}>
      <th className="label-caps px-4 py-2.5 text-left">Product Name</th>
      {showCategories && <th className="label-caps px-4 py-2.5 text-left">Categories</th>}
      <th className="label-caps px-4 py-2.5 text-right">Offline MRP</th>
      <th className="label-caps px-4 py-2.5 text-right">Offline Sale Price</th>
      <th className="label-caps px-4 py-2.5 text-right">Status</th>
    </tr>
  </thead>
);

const PriceList = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    let filtered = products;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => inCategory(p, selectedCategory));
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredProducts(filtered);
  }, [selectedCategory, searchQuery, products]);

  const fetchProducts = async () => {
    try {
      /* Wholesale figures live in `productPricing` (staff-only), not on the
         world-readable product document. Fetched alongside, never after. */
      // allSettled, not all: a failed pricing read must not blank the entire
      // price list. Losing the trade column is bad; losing every row is worse.
      const [productsResult, pricingResult] = await Promise.allSettled([
        getDocs(collection(db, 'products')),
        fetchTradePricingMap(),
      ]);

      if (productsResult.status === 'rejected') throw productsResult.reason;

      let pricingMap = new Map();
      if (pricingResult.status === 'fulfilled') {
        pricingMap = pricingResult.value;
      } else {
        console.error('Error fetching trade pricing:', pricingResult.reason);
        toast.error('Trade pricing is unavailable — showing catalogue prices only.');
      }

      const productsList = mergeTradePricing(
        productsResult.value.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })),
        pricingMap
      );
      setProducts(productsList);
      setFilteredProducts(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const productsByCategory = categories
    .filter(cat => cat !== 'All')
    .map(cat => ({
      category: cat,
      products: products.filter(p => inCategory(p, cat))
    }))
    .filter(group => group.products.length > 0);

  const countFor = (cat) =>
    cat === 'All' ? products.length : products.filter(p => inCategory(p, cat)).length;

  const isFiltered = Boolean(searchQuery) || selectedCategory !== 'All';

  if (loading) {
    return (
      <div className="admin-page" style={{ background: 'var(--surface-page)' }}>
        <div className="shell py-8">
          <span className="label-caps">Wholesale</span>
          <h1 className="section-title mt-1 mb-6">Price List</h1>
          <div className="p-4" style={PANEL}>
            <TableSkeleton rows={8} cols={4} label="Loading price list" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page" style={{ background: 'var(--surface-page)' }}>
      <AdminHeader
        title="Price List"
        backFallback="/dashboard"
        controls={(
          <button
            type="button"
            onClick={() => window.print()}
            className="ax-btn no-print"
          >
            <Printer aria-hidden="true" />
            <span className="hidden sm:inline">Print price list</span>
            <span className="sm:hidden">Print</span>
          </button>
        )}
      />
      <motion.div
        variants={pageVariants(reduced)}
        initial="initial"
        animate="animate"
        className="pricelist-print-area"
      >
        <div className="shell py-6 md:py-8">
          {/* Print-only masthead. Screen users already have the page header. */}
          <div className="pl-print-head">
            <p className="pl-print-brand">Crackers Hyderabad</p>
            <p className="pl-print-meta">
              Price List
              {selectedCategory !== 'All' ? ` — ${selectedCategory}` : ''} · {new Date().toLocaleDateString()}
            </p>
          </div>

          <header
            className="no-print mb-5 flex flex-col gap-1 border-b pb-5"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <div className="min-w-0">
              <span className="label-caps">Wholesale</span>
              <h1 className="section-title mt-1">Price List</h1>
              <p className="tabular mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                Showing {filteredProducts.length} of {products.length} products
              </p>
            </div>
          </header>

          {/* ---- Filters (screen only) ------------------------------------ */}
          <div className="no-print mb-6 space-y-4">
            <div className="relative max-w-md">
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
                className="input-premium pl-10 text-sm"
              />
            </div>

            <div>
              <p className="label-caps mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCategory(cat)}
                      className={`inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-3.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-[color:var(--hairline-strong)] bg-[color:var(--surface-card)] text-[color:var(--text-body)] hover:border-primary-400'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {cat}
                      <span
                        className={`tabular text-xs font-bold ${
                          active ? 'opacity-80' : 'opacity-70'
                        }`}
                      >
                        {countFor(cat)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- Tables ---------------------------------------------------- */}
          {isFiltered ? (
            /* An empty result set renders nothing here — the EmptyState below stands alone. */
            filteredProducts.length > 0 && (
            <motion.section
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 14)}
              aria-label="Filtered price list"
              style={PANEL}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
              >
                <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                  <Layers className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                  {selectedCategory === 'All' ? 'Search results' : selectedCategory}
                </h2>
                <span className="badge badge-neutral tabular">{filteredProducts.length} products</span>
              </div>

              <div className="scroll-x">
                <table className="pl-table w-full min-w-[38rem] border-collapse">
                  <PriceTableHead showCategories />
                  <tbody>
                    {filteredProducts.map(product => (
                      <PriceRow key={product.id} product={product} showCategories />
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
            )
          ) : (
            <div className="space-y-5">
              {productsByCategory.map(({ category, products: groupProducts }) => (
                <motion.section
                  key={category}
                  initial="hidden"
                  animate="visible"
                  variants={revealVariants(reduced, 12)}
                  aria-label={`${category} prices`}
                  style={PANEL}
                >
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
                  >
                    <h2
                      className="card-title flex items-center gap-2"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      <span className="h-5 w-5 shrink-0" aria-hidden="true">
                        <CategoryIcon category={slugForCategory(category)} />
                      </span>
                      {displayNameForCategory(category)}
                    </h2>
                    <span className="badge badge-neutral tabular">
                      {groupProducts.length} products
                    </span>
                  </div>

                  <div className="scroll-x">
                    <table className="pl-table w-full min-w-[32rem] border-collapse">
                      <PriceTableHead showCategories={false} />
                      <tbody>
                        {groupProducts.map(product => (
                          <PriceRow key={product.id} product={product} showCategories={false} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.section>
              ))}
            </div>
          )}

          {filteredProducts.length === 0 && (
            <EmptyState
              icon={Package}
              title="No products found"
              description="Nothing matches the current search and category filter."
              className="mt-6"
            />
          )}
        </div>
      </motion.div>

      <style>{`
        .pl-print-head { display: none; }

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
