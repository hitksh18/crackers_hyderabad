import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { GripVertical, Package, Plus, RotateCcw, Search, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import ProductRegisterRow from '../components/admin/ProductRegisterRow';
import AdminHeader from '../components/admin/AdminHeader';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { deleteTradePricing, fetchTradePricingMap, mergeTradePricing } from '../lib/tradePricing';
import { PRODUCT_CATEGORIES, isProductInCategory } from '../config/categories';

const AllProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStock, setFilterStock] = useState('All');
  const [filterFeatured, setFilterFeatured] = useState('All');
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dirtyRef = useRef(false);
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
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
        toast.error('Trade pricing is unavailable — offline prices may be blank.');
      }

      const productsData = mergeTradePricing(
        productsResult.value.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        pricingMap
      );
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

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || isProductInCategory(p, filterCategory);
    const matchesStock = filterStock === 'All' ||
      (filterStock === 'In Stock' && !p.outOfStock) ||
      (filterStock === 'Out of Stock' && p.outOfStock);
    const matchesFeatured = filterFeatured === 'All' ||
      (filterFeatured === 'Featured' && p.isFeatured) ||
      (filterFeatured === 'Not Featured' && !p.isFeatured);
    return matchesSearch && matchesCategory && matchesStock && matchesFeatured;
  });

  // Single source of truth — admin/src/config/categories.js (canonical order).
  const categories = PRODUCT_CATEGORIES;

  const sortedAll = sortProductsByOrder(products);
  const sortedFiltered = sortProductsByOrder(filteredProducts);

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
        <div className="mx-auto w-full max-w-[1550px] px-4 py-4 lg:px-8">
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
            <Plus aria-hidden="true" />
            <span className="hidden sm:inline">Add New Product</span>
            <span className="sm:hidden">Add</span>
          </Link>
        )}
      />

      <div className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8">
        {/* Page toolbar: search + filters */}
        <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[280px] lg:w-[300px] xl:w-[340px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-[10px] border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
          </div>

          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-10 appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-sm font-semibold focus:outline-none"
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
              className="h-10 appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-sm font-semibold focus:outline-none"
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
              className="h-10 appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-sm font-semibold focus:outline-none"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Featured: All</option>
              <option value="Featured">Featured</option>
              <option value="Not Featured">Not Featured</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="ax-btn">
              <RotateCcw aria-hidden="true" /> Clear
            </button>
          )}
        </div>

        {/* Compact toolbar - result count + reorder hint */}
        <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{filteredProducts.length}</span> of <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{products.length}</span> products
            {hasActiveFilters && <button type="button" onClick={clearFilters} className="ml-2 text-xs font-semibold underline" style={{ color: 'var(--ember-600)' }}>Clear filters</button>}
          </p>
          <p className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex" style={{ background: 'rgba(210,166,79,0.12)', borderColor: 'rgba(210,166,79,0.3)', color: 'var(--gold-600)' }}>
            <GripVertical className="h-3.5 w-3.5" /> Drag rows to reorder — customers see this order first
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
          <section aria-label="Product register" className="mt-3">
            {/* Column header - desktop */}
            <div
              className="mb-2 hidden items-center gap-3 rounded-xl border px-4 py-2.5 xl:flex"
              style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
              aria-hidden="true"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-9 shrink-0" />
                <span className="w-14 shrink-0" />
                <span className="label-caps flex-1">Product</span>
              </div>
              <span className="label-caps w-[9rem] shrink-0">Pricing</span>
              <span className="label-caps w-[11rem] shrink-0">Status</span>
              <span className="label-caps w-[7rem] shrink-0">Order</span>
              <span className="label-caps w-[6rem] shrink-0 text-right">Actions</span>
            </div>

            <ul role="list" className="flex flex-col gap-2">
              {sortedFiltered.map((product, index) => {
                const position = sortedAll.findIndex(p => p.id === product.id) + 1;
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
