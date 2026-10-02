import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AccountMenu from '../components/admin/AccountMenu';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Package,
  Search,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { categoryDefs } from '../components/home/homeData';
import CategoryIcon from '../components/CategoryIconPack';
import toast from '../utils/toast';
import { pageVariants } from '../lib/motion';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

const AdminCategories = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [initialAssignedIds, setInitialAssignedIds] = useState(new Set());

  const loadProducts = useCallback(async () => {
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, 'products'));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setLoadError('Failed to load products');
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = categoryDefs;

  const isInCategory = useCallback((product, cat) => {
    const matchNames = cat.match.map((m) => m.toLowerCase());
    if (Array.isArray(product.categories)) {
      return product.categories.some((c) => matchNames.includes(String(c).toLowerCase()));
    }
    return matchNames.includes(String(product.category || '').toLowerCase());
  }, []);

  const countInCategory = useCallback((cat) => {
    return products.filter((p) => isInCategory(p, cat)).length;
  }, [products, isInCategory]);

  const openCategory = (cat) => {
    const assigned = new Set(products.filter((p) => isInCategory(p, cat)).map((p) => p.id));
    setSelectedCategory(cat);
    setSelectedProductIds(new Set(assigned));
    setInitialAssignedIds(new Set(assigned));
    setSearchQuery('');
    setFilterMode('all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleProduct = (id) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    if (selectedProductIds.size !== initialAssignedIds.size) return true;
    for (const id of selectedProductIds) if (!initialAssignedIds.has(id)) return true;
    return false;
  }, [selectedProductIds, initialAssignedIds]);

  const pendingAddCount = useMemo(() => {
    let c = 0;
    for (const id of selectedProductIds) if (!initialAssignedIds.has(id)) c++;
    return c;
  }, [selectedProductIds, initialAssignedIds]);

  const pendingRemoveCount = useMemo(() => {
    let c = 0;
    for (const id of initialAssignedIds) if (!selectedProductIds.has(id)) c++;
    return c;
  }, [selectedProductIds, initialAssignedIds]);

  const filteredProducts = useMemo(() => {
    let list = products;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        const cats = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
        const slug = String(p.slug || p.seo?.slug || '').toLowerCase();
        const brand = String(p.brand || '').toLowerCase();
        const sku = String(p.sku || p.id || '').toLowerCase();
        return name.includes(q) || cat.includes(q) || cats.includes(q) || slug.includes(q) || brand.includes(q) || sku.includes(q);
      });
    }
    if (filterMode === 'assigned') list = list.filter((p) => selectedProductIds.has(p.id));
    else if (filterMode === 'unassigned') list = list.filter((p) => !selectedProductIds.has(p.id));
    return list;
  }, [products, searchQuery, filterMode, selectedProductIds]);

  const assignedCount = selectedProductIds.size;

  const handleSelectAllVisible = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const handleClearAllVisible = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => next.delete(p.id));
      return next;
    });
  };
  const handleReset = () => {
    setSelectedProductIds(new Set(initialAssignedIds));
    toast.success('Changes discarded');
  };

  const saveCategoryProducts = async () => {
    if (!selectedCategory) return;
    if (!hasChanges) {
      toast.success('No changes to save');
      return;
    }
    setSaving(true);
    try {
      const categoryName = selectedCategory.match[0];
      const toAdd = products.filter((p) => selectedProductIds.has(p.id) && !initialAssignedIds.has(p.id));
      const toRemove = products.filter((p) => !selectedProductIds.has(p.id) && initialAssignedIds.has(p.id));
      const batchOps = [];
      for (const p of toAdd) {
        batchOps.push(
          updateDoc(doc(db, 'products', p.id), {
            categories: arrayUnion(categoryName),
            ...(Array.isArray(p.categories) && p.categories.length > 0 ? {} : !p.category ? { category: categoryName } : {}),
          })
        );
      }
      for (const p of toRemove) {
        const updates = { categories: arrayRemove(categoryName) };
        if (String(p.category || '').toLowerCase() === categoryName.toLowerCase()) {
          const remaining = (p.categories || []).filter((c) => String(c).toLowerCase() !== categoryName.toLowerCase());
          updates.category = remaining.length > 0 ? remaining[0] : '';
        }
        batchOps.push(updateDoc(doc(db, 'products', p.id), updates));
      }
      await Promise.all(batchOps);
      await loadProducts();
      setInitialAssignedIds(new Set(selectedProductIds));
      toast.success('Category updated successfully.');
    } catch (e) {
      console.error(e);
      toast.error('Unable to update category. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8">
          <div className="h-9 w-44 animate-pulse rounded-full" style={{ background: 'var(--surface-sunken)' }} />
          <div className="cat-grid mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full" rounded="var(--r-md)" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError && products.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8">
          <EmptyState icon={Package} title="Unable to load categories" description={loadError} tone="alert" action={<button type="button" onClick={() => { setLoading(true); loadProducts(); }} className="btn-primary"><RotateCcw className="h-4 w-4" /> Retry</button>} />
        </div>
      </div>
    );
  }

  // Detail view — compact admin list, matches User Management density
  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
        {/* Header: identical to User Management / All Products */}
        <header className="sticky top-0 z-30 flex h-[60px] w-full shrink-0 items-center border-b bg-[var(--surface-card)] px-4 lg:px-8" style={{ borderColor: 'var(--hairline)' }}>
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            <button type="button" onClick={() => setSelectedCategory(null)} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ember-600)' }}>
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to Categories</span><span className="sm:hidden">Back</span>
            </button>
            <h1 className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 text-sm font-bold tracking-tight sm:inline-flex" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}>
                <span className="h-5 w-5"><CategoryIcon category={selectedCategory.slug} noCrop /></span>
              </span>
              {selectedCategory.name}
            </h1>
            <span className="absolute left-1/2 -translate-x-1/2 text-sm font-bold sm:hidden" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{selectedCategory.name}</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs sm:inline" style={{ color: hasChanges ? 'var(--ember-600)' : 'var(--text-muted)' }}>{hasChanges ? `${pendingAddCount + pendingRemoveCount} pending` : 'All saved'}</span>
              <button type="button" onClick={handleReset} disabled={!hasChanges || saving} className="hidden h-8 items-center rounded-full border px-3 text-xs font-semibold sm:inline-flex disabled:opacity-40" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>Discard</button>
              <button type="button" onClick={saveCategoryProducts} disabled={!hasChanges || saving} className="inline-flex h-8 items-center rounded-full px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: hasChanges ? 'var(--grad-ember)' : 'linear-gradient(122deg, #A9A29A, #8B8377)' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
              <AccountMenu />
            </div>
          </div>
        </header>

        <motion.div variants={pageVariants} initial="initial" animate="animate" className="mx-auto w-full max-w-[1600px] px-4 py-3 lg:px-8">
          {/* Compact subheader: mirrors Ana intro / Orders subline */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Assigned <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{assignedCount}</span> / {products.length} · <span className="hidden sm:inline">Click checkbox to assign products</span><span className="sm:hidden">Tap to assign</span>
            </p>
            <div className="flex items-center gap-2 sm:hidden">
              <button type="button" onClick={handleReset} disabled={!hasChanges || saving} className="h-7 rounded-full border px-2.5 text-xs font-semibold disabled:opacity-40" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Discard</button>
              <span className="text-xs" style={{ color: hasChanges ? 'var(--ember-600)' : 'var(--text-muted)' }}>{hasChanges ? `${pendingAddCount + pendingRemoveCount} pending` : 'All saved'}</span>
            </div>
          </div>

          {/* Filter pills — exact User Management treatment */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'all', label: 'All Products', count: products.length },
              { key: 'assigned', label: 'Assigned', count: assignedCount },
              { key: 'unassigned', label: 'Not Assigned', count: products.length - assignedCount },
            ].map((tab) => {
              const active = filterMode === tab.key;
              return (
                <button key={tab.key} type="button" aria-pressed={active} onClick={() => setFilterMode(tab.key)} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-200" style={active ? { background: 'var(--text-strong)', color: 'var(--surface-card)', borderColor: 'var(--text-strong)' } : { background: 'var(--surface-card)', color: 'var(--text-muted)', borderColor: 'var(--hairline)' }}>
                  {tab.label} <span className="tabular text-[11px] opacity-70">{tab.count}</span>
                </button>
              );
            })}
          </div>

          {/* Search + controls — matches User Management search row */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-[380px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
              <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 w-full rounded-full border bg-[var(--surface-card)] pl-10 pr-9 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none" style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }} />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}><X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} /></button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{filteredProducts.length} products</span>
              <div className="ml-1 flex items-center gap-1.5">
                <button type="button" onClick={handleSelectAllVisible} className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}>Select All</button>
                <button type="button" onClick={handleClearAllVisible} className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}>Clear All</button>
              </div>
            </div>
          </div>

          {/* Product list — admin data table, not SaaS cards */}
          <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            {/* Desktop column header */}
            <div className="hidden items-center gap-3 px-3 py-2.5 lg:grid" style={{ gridTemplateColumns: 'auto 48px 1fr 110px 140px 96px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--hairline)' }}>
              <div className="w-5" />
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Image</div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Product</div>
              <div className="text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Price</div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Category</div>
              <div className="text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Status</div>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
              {filteredProducts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="mx-auto h-7 w-7" style={{ color: 'var(--text-subtle)' }} />
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
                    {searchQuery ? 'No products match your search.' : filterMode === 'assigned' ? 'No products have been assigned to this category yet.' : filterMode === 'unassigned' ? 'All products are assigned.' : 'No products found.'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{searchQuery ? `Try "${searchQuery}" with different keywords.` : filterMode !== 'all' ? 'Try switching the filter.' : 'No products available.'}</p>
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const checked = selectedProductIds.has(p.id);
                  const price = p.discountPrice ?? p.onlinePrice ?? p.price ?? p.offlineMRP ?? null;
                  const image = p.imageURL || p.imageUrl || p.image || '';
                  const catText = Array.isArray(p.categories) && p.categories.length > 1 ? `${p.categories[0]} +${p.categories.length - 1}` : (Array.isArray(p.categories) ? p.categories[0] : p.category) || '—';
                  return (
                    <label key={p.id} className="grid cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]/50 lg:grid-cols-[auto_48px_1fr_110px_140px_96px] lg:gap-3" style={{ minHeight: '64px' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} className="sr-only" />
                      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border" style={{ background: checked ? 'var(--ember-600)' : 'transparent', borderColor: checked ? 'var(--ember-600)' : 'var(--hairline-strong)' }}>
                        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </span>
                      {image ? (
                        <img src={image} alt="" className="h-9 w-9 justify-self-start rounded-[8px] object-cover lg:h-10 lg:w-10" style={{ border: '1px solid var(--hairline)', background: 'var(--surface-raised)' }} />
                      ) : (
                        <span className="grid h-9 w-9 place-items-center rounded-[8px] border lg:h-10 lg:w-10" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}><Package className="h-4 w-4" style={{ color: 'var(--text-muted)' }} /></span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>{p.name}</span>
                        <span className="mt-0.5 hidden text-xs lg:block" style={{ color: 'var(--text-muted)' }}>{p.brand ? `${p.brand} · ` : ''}{p.outOfStock ? 'Out of stock' : p.isFeatured ? 'Featured' : catText}</span>
                        <span className="mt-1 flex items-center gap-2 lg:hidden">
                          {price != null && <span className="tabular text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>₹{Number(price).toLocaleString('en-IN')}</span>}
                          <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{catText}</span>
                        </span>
                      </span>
                      <span className="hidden tabular text-right text-sm font-semibold lg:block" style={{ color: 'var(--text-strong)' }}>{price != null ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}</span>
                      <span className="hidden min-w-0 truncate text-xs lg:block" style={{ color: 'var(--text-muted)' }}>{catText}</span>
                      <span className="hidden justify-end lg:flex">
                        {checked ? <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(44,122,83,0.12)', color: 'var(--leaf-600)' }}>Assigned</span> : <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Not assigned</span>}
                      </span>
                      {/* Mobile status */}
                      <span className="col-span-2 ml-8 flex items-center gap-2 lg:hidden">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${checked ? '' : 'border'}`} style={checked ? { background: 'rgba(44,122,83,0.12)', color: 'var(--leaf-600)' } : { background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>{checked ? 'Assigned' : 'Not assigned'}</span>
                        {p.outOfStock && <span className="badge badge-crimson text-[10px]">Out of stock</span>}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Mobile save bar — compact, not giant */}
          <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-between gap-3 border-t bg-[var(--surface-page)] py-3 lg:static lg:border-0 lg:bg-transparent lg:py-0 lg:pt-3" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hasChanges ? <><span className="font-semibold" style={{ color: 'var(--text-strong)' }}>{pendingAddCount + pendingRemoveCount} pending</span> — save to apply</> : 'No pending changes'}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedCategory(null)} className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}>Back</button>
              <button type="button" onClick={saveCategoryProducts} disabled={!hasChanges || saving} className="inline-flex h-8 items-center rounded-full px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: hasChanges ? 'var(--grad-ember)' : 'linear-gradient(122deg, #A9A29A, #8B8377)' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // List view — same shell/margins as User Management & All Products
  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
      <header className="sticky top-0 z-30 flex h-[60px] w-full shrink-0 items-center border-b bg-[var(--surface-card)] px-4 lg:px-8" style={{ borderColor: 'var(--hairline)' }}>
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
          <Link to="/dashboard" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ember-600)' }}>
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Back</span>
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-sm font-bold tracking-tight sm:block" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Categories</h1>
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-bold sm:hidden" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Categories</span>
          <span className="hidden text-xs tabular sm:inline" style={{ color: 'var(--text-muted)' }}>{categories.length} · {products.length} products</span>
          <span className="text-xs tabular sm:hidden" style={{ color: 'var(--text-muted)' }}>{products.length} products</span>
          <AccountMenu />
        </div>
      </header>

      <motion.div variants={pageVariants} initial="initial" animate="animate" className="mx-auto w-full max-w-[1600px] px-4 py-3 lg:px-8">
        <div className="py-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Manage your product categories and assign products easily.</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{categories.length} categories · {products.length} total products</p>
        </div>

        {categories.length === 0 ? (
          <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="px-6 py-12 text-center"><Package className="mx-auto h-7 w-7" style={{ color: 'var(--text-subtle)' }} /><p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-body)' }}>No categories found.</p></div>
          </div>
        ) : (
          <div className="cat-grid mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const count = countInCategory(cat);
              return (
                <button key={cat.name} type="button" onClick={() => openCategory(cat)} className="group flex w-full items-center gap-3 rounded-[var(--r-md)] border px-3 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]/60" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }} aria-hidden="true">
                    <span className="h-7 w-7"><CategoryIcon category={cat.slug} noCrop /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>{cat.name}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>{count} product{count !== 1 ? 's' : ''}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-subtle)' }} />
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminCategories;
