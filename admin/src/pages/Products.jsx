import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { GripVertical, Package, Plus, RotateCcw, Search, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import ProductRegisterRow from '../components/admin/ProductRegisterRow';
import AdminHeader from '../components/admin/AdminHeader';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { deleteTradePricing, mergeTradePricing } from '../lib/tradePricing';
import { PRODUCT_CATEGORIES, isProductInCategory } from '../config/categories';

/* Default display order: natural alphabetical by product name, numbers first
   ("7 CM" < "12 CM" < "100 Shots" < "Aerial"), case-insensitive, with a
   stable id tie-break so equal names never shuffle between renders.
   Same convention as the storefront (client/src/pages/Products.jsx byName).
   Display-only: sortOrder data, drag-reorder persistence and the customer
   storefront order are untouched. Pure: never mutates its input. */
const byNaturalName = (a, b) =>
  String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base', numeric: true })
  || String(a?.id || '').localeCompare(String(b?.id || ''));

/* Products → Edit → Products state restoration. Temporary navigation state
   only — sessionStorage, never localStorage. One object holds the four
   filters plus the scroll position, e.g.
   { search, category, stock, featured, scrollY, savedAt }.
   Note the scroller is main.admin-main (the viewport never scrolls; see
   ScrollToTop), so the position is saved/restored there with a window
   fallback. Consumed (removed) on restore so normal visits start clean. */
const PRODUCTS_STATE_KEY = 'productsPageState';
const PRODUCTS_STATE_TTL_MS = 30 * 60 * 1000;

const STOCK_OPTIONS = ['All', 'In Stock', 'Out of Stock'];
const FEATURED_OPTIONS = ['All', 'Featured', 'Not Featured'];

const getScroller = () =>
  (typeof document !== 'undefined' && document.querySelector('main.admin-main')) || null;

const validOption = (value, options, fallback = 'All') =>
  (typeof value === 'string' && options.includes(value) ? value : fallback);

const readSavedProductsState = () => {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_STATE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt > PRODUCTS_STATE_TTL_MS
    ) {
      sessionStorage.removeItem(PRODUCTS_STATE_KEY);
      return null;
    }
    const categories = ['All', ...PRODUCT_CATEGORIES.map((c) => c.value)];
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      category: validOption(parsed.category, categories),
      stock: validOption(parsed.stock, STOCK_OPTIONS),
      featured: validOption(parsed.featured, FEATURED_OPTIONS),
      scrollY:
        typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY) && parsed.scrollY > 0
          ? parsed.scrollY
          : 0,
    };
  } catch {
    /* Storage unavailable or corrupt — treat as no saved state. */
    return null;
  }
};

const clearSavedProductsState = () => {
  try {
    sessionStorage.removeItem(PRODUCTS_STATE_KEY);
  } catch {
    /* ignore */
  }
};

const AllProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  /* Returning from Edit Product restores the exact filter set the user left;
     a normal visit finds no saved state and starts with the defaults. */
  const [savedState] = useState(readSavedProductsState);
  const [searchQuery, setSearchQuery] = useState(savedState?.search ?? '');
  const [filterCategory, setFilterCategory] = useState(savedState?.category ?? 'All');
  const [filterStock, setFilterStock] = useState(savedState?.stock ?? 'All');
  const [filterFeatured, setFilterFeatured] = useState(savedState?.featured ?? 'All');
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dirtyRef = useRef(false);
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // Shared 60s cache: Dashboard, Orders editor, Categories and Canvas
      // all read `products` — one download per minute, not one per visit.
      // Pricing lives in `productPricing` and is cached under its own key.
      const [productsResult, pricingResult] = await Promise.allSettled([
        cachedGetDocs(collection(db, 'products'), 'products'),
        cachedGetDocs(collection(db, 'productPricing'), 'productPricing'),
      ]);

      if (productsResult.status === 'rejected') throw productsResult.reason;

      let pricingMap = new Map();
      if (pricingResult.status === 'fulfilled') {
        const rows = pricingResult.value;
        pricingMap = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.id, r]));
      } else {
        console.error('Error fetching trade pricing:', pricingResult.reason);
        toast.error('Trade pricing is unavailable — offline prices may be blank.');
      }

      const productsData = mergeTradePricing(productsResult.value, pricingMap);
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    const product = products.find(p => p.id === productId);
    openModal({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product?.name}"?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Product',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting "${product?.name || 'product'}"...`);
        try {
          await deleteDoc(doc(db, 'products', productId));
          await deleteTradePricing(productId);
          setProducts((prev) => prev.filter(p => p.id !== productId));
          toast.success('Product deleted successfully', { id: loadingToast });
          return true;
        } catch (error) {
          console.error('Error deleting product:', error);
          toast.error('Failed to delete product', { id: loadingToast });
          return false;
        }
      },
    });
  };

  const toggleFeatured = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        isFeatured: !currentStatus
      });
      setProducts(products.map(p =>
        p.id === productId ? { ...p, isFeatured: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Removed from featured' : 'Added to featured');
    } catch (error) {
      console.error('Error toggling featured:', error);
      toast.error('Failed to update featured status');
    }
  };

  const toggleOutOfStock = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        outOfStock: !currentStatus
      });
      setProducts(products.map(p =>
        p.id === productId ? { ...p, outOfStock: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Marked as in stock' : 'Marked as out of stock');
    } catch (error) {
      console.error('Error toggling stock status:', error);
      toast.error('Failed to update stock status');
    }
  };

  const sortProductsByOrder = (list) =>
    [...list].sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || (a.name || '').localeCompare(b.name || '')
    );

  const moveProduct = async (productId, direction) => {
    try {
      let list = sortProductsByOrder(products);
      const cur = list.findIndex(p => p.id === productId);
      const target = cur + direction;
      if (target < 0 || target >= list.length) return;

      if (list.some(p => p.sortOrder == null)) {
        const batch = writeBatch(db);
        list = list.map((p, i) => ({ ...p, sortOrder: i + 1 }));
        list.forEach(p => {
          batch.set(doc(db, 'products', p.id), { sortOrder: p.sortOrder }, { merge: true });
        });
        await batch.commit();
      }

      const a = list[cur];
      const b = list[target];
      await Promise.all([
        updateDoc(doc(db, 'products', a.id), { sortOrder: b.sortOrder }),
        updateDoc(doc(db, 'products', b.id), { sortOrder: a.sortOrder }),
      ]);

      setProducts(list.map(p => {
        if (p.id === a.id) return { ...p, sortOrder: b.sortOrder };
        if (p.id === b.id) return { ...p, sortOrder: a.sortOrder };
        return p;
      }));
      toast.success('Product order updated');
    } catch (error) {
      console.error('Error reordering product:', error);
      toast.error('Failed to update product order');
    }
  };

  const handleDragStart = (e, productId) => {
    setDragId(productId);
    dirtyRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', productId);
  };

  const reorderInMemory = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = sortProductsByOrder(products);
    const from = list.findIndex(p => p.id === dragId);
    const to = list.findIndex(p => p.id === targetId);
    if (from < 0 || to < 0 || from === to) return;

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    dirtyRef.current = true;
    setDragOverId(targetId);
    setProducts(list.map((p, i) => ({ ...p, sortOrder: i + 1 })));
  };

  const handleDragOver = (e, productId) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== productId) {
      reorderInMemory(productId);
    }
  };

  const persistOrder = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      const list = sortProductsByOrder(products);
      const batch = writeBatch(db);
      list.forEach((p, i) => {
        batch.set(doc(db, 'products', p.id), { sortOrder: i + 1 }, { merge: true });
      });
      await batch.commit();
      toast.success('Product order updated');
    } catch (error) {
      console.error('Error saving product order:', error);
      toast.error('Failed to save product order');
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    await persistOrder();
  };

  const handleDragEnd = async () => {
    await persistOrder();
    setDragId(null);
    setDragOverId(null);
  };

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || isProductInCategory(p, filterCategory);
    const matchesStock = filterStock === 'All' ||
      (filterStock === 'In Stock' && !p.outOfStock) ||
      (filterStock === 'Out of Stock' && p.outOfStock);
    const matchesFeatured = filterFeatured === 'All' ||
      (filterFeatured === 'Featured' && p.isFeatured) ||
      (filterFeatured === 'Not Featured' && !p.isFeatured);
    return matchesSearch && matchesCategory && matchesStock && matchesFeatured;
  }), [products, searchQuery, filterCategory, filterStock, filterFeatured]);

  /* Save the full page state (filters + scroll) before leaving for Edit.
     Passed to each row's Edit link; runs synchronously on click so nothing
     is lost on unmount. */
  const handleEditClick = () => {
    try {
      const el = getScroller();
      sessionStorage.setItem(
        PRODUCTS_STATE_KEY,
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          search: searchQuery,
          category: filterCategory,
          stock: filterStock,
          featured: filterFeatured,
          scrollY: el ? el.scrollTop : window.scrollY,
        })
      );
    } catch {
      /* Storage unavailable (private mode) — skip silently. */
    }
  };

  /* Restore the saved Edit→return position once products have rendered.
     Filters were already applied via the lazy initial state above, so the
     filtered list is what renders; this only positions the scroller. Runs
     after loading flips false (rows exist) and after the global ScrollToTop
     reset, on a double rAF so layout is settled — instant jump, never
     smooth. Clamps to the available height and clears the key so a fresh
     visit starts at the top. */
  useEffect(() => {
    if (loading) return;
    let raf1 = 0;
    let raf2 = 0;
    const saved = savedState?.scrollY || 0;
    if (!(saved > 0)) {
      clearSavedProductsState();
      return;
    }
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try {
          const el = getScroller();
          const max = el
            ? el.scrollHeight - el.clientHeight
            : document.documentElement.scrollHeight - window.innerHeight;
          const target = Math.max(0, Math.min(saved, Math.max(0, max)));
          if (el) el.scrollTo(0, target);
          else window.scrollTo(0, target);
        } catch {
          /* Unmounted mid-restore — ignore. */
        }
        clearSavedProductsState();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // savedState is mount-time only; loading gates the restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Single source of truth — admin/src/config/categories.js (canonical order).
  const categories = PRODUCT_CATEGORIES;

  const sortedAll = useMemo(() => sortProductsByOrder(products), [products]);
  /* Display: every filter (search, category, stock, featured) applies first in
     filteredProducts above; the natural name sort runs last so every filtered
     result stays naturally sorted. Copy-then-sort: never mutates state. */
  const sortedFiltered = useMemo(() => [...filteredProducts].sort(byNaturalName), [filteredProducts]);
  /* Row positions without O(n²) findIndex per card. */
  const positionById = useMemo(() => {
    const map = new Map();
    sortedAll.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [sortedAll]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('All');
    setFilterStock('All');
    setFilterFeatured('All');
  };

  const hasActiveFilters = searchQuery || filterCategory !== 'All' || filterStock !== 'All' || filterFeatured !== 'All';

  if (loading) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title="Products" backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 py-2 lg:px-8">
          <TableSkeleton rows={8} cols={4} label="Loading products" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
      <CustomModal
        {...modalConfig}
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        busy={isConfirming}
        busyText={modalConfig.pendingText}
      />

      {/* Shared Admin navbar: Back | Products | Add + avatar.
          Search and filters live in the toolbar below, not the navbar. */}
      <AdminHeader
        title="Products"
        backFallback="/dashboard"
        controls={(
          <Link to="/products/add" className="ax-btn-primary">
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Add New Product</span>
            <span className="sm:hidden">Add</span>
          </Link>
        )}
      />

      <div className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8">
        {/* Page toolbar: one clean card — search (largest) + compact equal-height filters */}
        <div
          className="flex flex-col gap-2 rounded-[12px] border p-2 sm:flex-row sm:items-center"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        >
          <div className="relative w-full flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[42px] w-full rounded-[10px] border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-150"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
          </div>

          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-[42px] w-full appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none sm:w-auto"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Category: All</option>
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>

          <div className="relative">
            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
              className="h-[42px] w-full appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none sm:w-auto"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Stock: All</option>
              <option value="In Stock">In Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>

          <div className="relative">
            <select
              value={filterFeatured}
              onChange={(e) => setFilterFeatured(e.target.value)}
              className="h-[42px] w-full appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none sm:w-auto"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Featured: All</option>
              <option value="Featured">Featured</option>
              <option value="Not Featured">Not Featured</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="ax-btn h-[42px] shrink-0">
              <RotateCcw aria-hidden="true" /> Clear
            </button>
          )}
        </div>

        {/* Compact summary row — small secondary count + subtle reorder hint pill */}
        <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{filteredProducts.length}</span> of <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{products.length}</span> products
            {hasActiveFilters && <button type="button" onClick={clearFilters} className="ml-2 text-xs font-semibold underline" style={{ color: 'var(--ember-600)' }}>Clear filters</button>}
          </p>
          <p className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex" style={{ background: 'rgba(210,166,79,0.08)', borderColor: 'rgba(210,166,79,0.22)', color: 'var(--text-muted)' }}>
            <GripVertical className="h-3 w-3" style={{ color: 'var(--gold-500)' }} /> Drag rows to reorder — customers see this order first
          </p>
        </div>

        {/* Product list */}
        {filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            description="Try adjusting your filters or add a new product"
            action={
              <button type="button" onClick={clearFilters} className="btn-outline">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Clear filters
              </button>
            }
            secondaryAction={
              <Link to="/products/add" className="btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add New Product
              </Link>
            }
          />
        ) : (
          <section aria-label="Product register" className="mt-2">
            {/* Column header - desktop: widths mirror ProductRegisterRow cells */}
            <div
              className="mb-1.5 hidden items-center gap-4 rounded-[10px] border px-4 py-1.5 xl:flex"
              style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
              aria-hidden="true"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-8 shrink-0" />
                <span className="w-11 shrink-0" />
                <span className="label-caps flex-1">Product</span>
              </div>
              <span className="label-caps w-[8.5rem] shrink-0 text-right">Pricing</span>
              <span className="label-caps w-[11.5rem] shrink-0">Status</span>
              <span className="label-caps w-[8.5rem] shrink-0">Order</span>
              <span className="label-caps w-[6rem] shrink-0 text-right">Actions</span>
            </div>

            <ul role="list" className="flex flex-col gap-1.5">
              {sortedFiltered.map((product, index) => {
                const position = positionById.get(product.id) ?? (index + 1);
                return (
                  <ProductRegisterRow
                    key={product.id}
                    product={product}
                    position={position}
                    total={sortedAll.length}
                    index={index}
                    reduced={false}
                    isDragging={dragId === product.id}
                    isDropTarget={dragId !== product.id && dragOverId === product.id}
                    onDragStart={(e) => handleDragStart(e, product.id)}
                    onDragOver={(e) => handleDragOver(e, product.id)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onMoveUp={(id) => moveProduct(id, -1)}
                    onMoveDown={(id) => moveProduct(id, 1)}
                    onToggleFeatured={toggleFeatured}
                    onToggleStock={toggleOutOfStock}
                    onDelete={handleDeleteProduct}
                    onEditClick={handleEditClick}
                  />
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default AllProducts;
