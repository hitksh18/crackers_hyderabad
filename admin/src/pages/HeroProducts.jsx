import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { readHomepageConfig, saveHomepageConfig } from '../lib/homepage';
import {
  DEFAULT_HERO_PRODUCTS,
  DEFAULT_HERO_PRODUCT_GROUPS,
  HERO_COUNT_MAX,
  HERO_COUNT_MIN,
  newHeroGroupId,
  normalizeHeroProductGroups,
  normalizeHeroProducts,
  resolveHeroProducts,
} from '../lib/heroProducts';
import { buildBrandLookup, getProductBrandName } from '../lib/brands';
import { PRODUCT_CATEGORIES, categoryDisplayName, isProductInCategory } from '../config/categories';
import { productPath } from '../lib/productLinks';
import { useAuth } from '../context/AuthContext';
import toast from '../utils/toast';
import AdminHeader from '../components/admin/AdminHeader';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

const STOREFRONT_URL =
  (import.meta.env.VITE_STOREFRONT_URL || '').trim() || 'https://crackershyderabad.com';

const STATUS_OPTIONS = ['All', 'Active', 'Out of stock'];

const priceOf = (p) => p?.discountPrice ?? p?.onlinePrice ?? p?.price ?? p?.offlineMRP ?? null;
const imageOf = (p) => String(p?.imageURL || p?.imageUrl || p?.image || '').trim();
const categoryOf = (p) => {
  if (Array.isArray(p?.categories) && p.categories.length > 0) return p.categories.join(', ');
  return p?.category || '';
};

const MODE_LABELS = {
  random: 'Random',
  category: 'Category',
  custom: 'Custom Group',
};

const cardStyle = { borderColor: 'var(--hairline)', background: 'var(--surface-card)' };
const labelStyle = { color: 'var(--text-strong)' };
const mutedStyle = { color: 'var(--text-muted)' };
const inputStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-sunken)',
  color: 'var(--text-strong)',
};

/**
 * Hero Products — controls WHICH products the homepage hero animation cycles
 * through (Random / Category / Custom Group). It never touches the animation
 * itself. Configuration persists into the same settings/homepageConfig
 * document Canvas owns, following the same draft/publish workflow.
 */
const HeroProducts = () => {
  const { user } = useAuth();
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();

  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [cfg, setCfg] = useState(() => normalizeHeroProducts(DEFAULT_HERO_PRODUCTS));
  const [groups, setGroups] = useState(() => normalizeHeroProductGroups(DEFAULT_HERO_PRODUCT_GROUPS));
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(null);

  /* Group editor (create/edit) state. */
  const [editing, setEditing] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategory, setPickerCategory] = useState('All');
  const [pickerBrand, setPickerBrand] = useState('All');
  const [pickerStatus, setPickerStatus] = useState('All');

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [productsData, brandsData, homepage] = await Promise.all([
        cachedGetDocs(collection(db, 'products'), 'products'),
        cachedGetDocs(collection(db, 'brands'), 'brands').catch(() => []),
        readHomepageConfig(),
      ]);
      const nextCfg = normalizeHeroProducts(homepage?.heroProducts);
      const nextGroups = normalizeHeroProductGroups(homepage?.heroProductGroups);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setBrands(Array.isArray(brandsData) ? brandsData : []);
      setCfg(nextCfg);
      setGroups(nextGroups);
      setBaseline(JSON.stringify({ cfg: nextCfg, groups: nextGroups }));
    } catch (e) {
      console.error(e);
      setLoadError('Failed to load hero product settings');
      toast.error('Failed to load hero product settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* Picker search — debounced local filtering, never a request per keystroke. */
  useEffect(() => {
    const t = window.setTimeout(() => setPickerQuery(pickerSearch.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [pickerSearch]);

  const lookup = useMemo(() => buildBrandLookup(brands), [brands]);

  const resolved = useMemo(
    () => resolveHeroProducts(products, cfg, groups),
    [products, cfg, groups],
  );

  const dirty = useMemo(
    () => baseline !== '' && baseline !== JSON.stringify({ cfg, groups }),
    [baseline, cfg, groups],
  );

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === cfg.groupId) || null,
    [groups, cfg.groupId],
  );

  /* ------------------------------ persist ------------------------------ */

  const persist = async (status) => {
    setSaving(status);
    try {
      const base = await readHomepageConfig();
      await saveHomepageConfig(
        { ...base, heroProducts: cfg, heroProductGroups: groups },
        { status, userEmail: user?.email },
      );
      setBaseline(JSON.stringify({ cfg, groups }));
      toast.success(status === 'published' ? 'Hero products published' : 'Hero products saved as draft');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save hero products');
    } finally {
      setSaving(null);
    }
  };

  /* --------------------------- group editing --------------------------- */

  const openEditor = (group) => {
    setEditing(group
      ? { ...group, productIds: [...group.productIds] }
      : { id: newHeroGroupId(), name: '', active: true, productIds: [] });
    setPickerSearch('');
    setPickerQuery('');
    setPickerCategory('All');
    setPickerBrand('All');
    setPickerStatus('All');
  };

  const closeEditor = () => setEditing(null);

  const saveGroup = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      toast.error('Please give the group a name');
      return;
    }
    setGroups((prev) => {
      const exists = prev.some((g) => g.id === editing.id);
      const next = { ...editing, name };
      return exists ? prev.map((g) => (g.id === editing.id ? next : g)) : [...prev, next];
    });
    closeEditor();
    toast.success(`Group "${name}" saved — remember to Save or Publish`);
  };

  const askDeleteGroup = (group) => {
    openModal({
      title: 'Delete Group',
      message: `Delete "${group.name}"?\n\nProducts are not affected — only this hero group is removed.`,
      type: 'danger',
      confirmText: 'Delete Group',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        setGroups((prev) => prev.filter((g) => g.id !== group.id));
        if (cfg.groupId === group.id) {
          setCfg((c) => ({ ...c, groupId: '' }));
        }
        toast.success(`Group "${group.name}" removed — remember to Save or Publish`);
        return true;
      },
    });
  };

  const duplicateGroup = (group) => {
    const copy = {
      ...group,
      id: newHeroGroupId(),
      name: `${group.name} Copy`,
      active: false,
      productIds: [...group.productIds],
    };
    setGroups((prev) => [...prev, copy]);
    toast.success(`Group "${copy.name}" created`);
  };

  /* ------------------------- picker computation ------------------------ */

  const pickerProducts = useMemo(() => {
    let list = products;
    if (pickerQuery) {
      list = list.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const slug = String(p.slug || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        const cats = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
        const brandName = String(getProductBrandName(p, lookup) || '').toLowerCase();
        const sku = String(p.sku || p.id || '').toLowerCase();
        return (
          name.includes(pickerQuery) || slug.includes(pickerQuery) ||
          cat.includes(pickerQuery) || cats.includes(pickerQuery) ||
          brandName.includes(pickerQuery) || sku.includes(pickerQuery)
        );
      });
    }
    if (pickerCategory !== 'All') list = list.filter((p) => isProductInCategory(p, pickerCategory));
    if (pickerBrand !== 'All') list = list.filter((p) => String(getProductBrandName(p, lookup) || '') === pickerBrand);
    if (pickerStatus === 'Active') list = list.filter((p) => p.outOfStock !== true);
    else if (pickerStatus === 'Out of stock') list = list.filter((p) => p.outOfStock === true);
    return [...list].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }),
    );
  }, [products, lookup, pickerQuery, pickerCategory, pickerBrand, pickerStatus]);

  const pickerBrands = useMemo(() => {
    const names = new Set();
    for (const p of products) {
      const n = String(getProductBrandName(p, lookup) || '').trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [products, lookup]);

  const togglePick = (id) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const has = prev.productIds.includes(id);
      return {
        ...prev,
        productIds: has ? prev.productIds.filter((x) => x !== id) : [...prev.productIds, id],
      };
    });
  };

  const movePicked = (index, delta) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = [...prev.productIds];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, productIds: next };
    });
  };

  const editingProduct = (id) => products.find((p) => String(p.id) === String(id)) || null;

  /* ------------------------------- states ------------------------------ */

  if (loading) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title="Hero Products" backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 py-2 lg:px-8">
          <Skeleton className="h-[76px] w-full" rounded="var(--r-md)" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title="Hero Products" backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 py-6 lg:px-8">
          <EmptyState
            icon={Sparkles}
            title="Unable to load hero product settings"
            description={loadError}
            tone="alert"
            action={(
              <button type="button" onClick={() => { setLoading(true); loadAll(); }} className="btn-primary">
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            )}
          />
        </div>
      </div>
    );
  }

  const flagCheckbox = (checked, onChange, label, id) => (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm" style={mutedStyle}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer"
        style={{ accentColor: 'var(--ember-600)' }}
      />
      {label}
    </label>
  );

  const countSelect = (id) => (
    <div className="relative w-[110px]">
      <select
        id={id}
        value={cfg.count}
        onChange={(e) => setCfg((c) => ({ ...c, count: Number(e.target.value) }))}
        className="h-[42px] w-full appearance-none rounded-[10px] border pl-3 pr-8 text-sm font-semibold focus:outline-none"
        style={inputStyle}
      >
        {Array.from({ length: HERO_COUNT_MAX - HERO_COUNT_MIN + 1 }, (_, i) => HERO_COUNT_MIN + i).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
    </div>
  );

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
      <AdminHeader
        title="Hero Products"
        backFallback="/dashboard"
        controls={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => persist('draft')}
              disabled={saving !== null}
              className="ax-btn"
            >
              {saving === 'draft' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => persist('published')}
              disabled={saving !== null}
              className="ax-btn-primary"
            >
              {saving === 'published' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Publish
            </button>
          </div>
        )}
      />

      <div className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8">
        {dirty && (
          <p className="mb-2 rounded-[10px] border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'rgba(247, 174, 44, 0.4)', background: 'rgba(247, 174, 44, 0.08)', color: 'var(--saffron-400)' }}>
            You have unsaved changes — use Save Draft or Publish.
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ------------------------- LEFT: config ------------------------- */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* Current source */}
            <div className="rounded-[12px] border p-3" style={cardStyle}>
              <h2 className="text-sm font-bold" style={labelStyle}>Hero currently uses</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={mutedStyle}>
                <span className="badge badge-leaf">{MODE_LABELS[cfg.mode]}</span>
                {cfg.mode === 'custom' && <span style={labelStyle}>{activeGroup ? activeGroup.name : 'No group selected'}</span>}
                {cfg.mode === 'category' && <span style={labelStyle}>{cfg.category ? categoryDisplayName(cfg.category) : 'No category selected'}</span>}
                <span className="tabular">· {resolved.list.length} product{resolved.list.length === 1 ? '' : 's'} live</span>
                <span>· Order: {cfg.mode === 'custom' ? 'as configured' : 'admin order'}</span>
              </p>
              {resolved.fallback && (
                <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--saffron-400)' }}>
                  The configured source has no eligible products right now — the hero is using a fallback selection.
                </p>
              )}
            </div>

            {/* Mode selector */}
            <div className="rounded-[12px] border p-3" style={cardStyle}>
              <h2 className="text-sm font-bold" style={labelStyle}>Hero Product Source</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Hero product source">
                {[
                  { id: 'random', title: 'Random', desc: 'Automatic stable selection' },
                  { id: 'category', title: 'Category', desc: 'Everything from one category' },
                  { id: 'custom', title: 'Custom Group', desc: 'Hand-picked products in order' },
                ].map((m) => {
                  const selected = cfg.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCfg((c) => ({ ...c, mode: m.id }))}
                      className="rounded-[10px] border px-3 py-2.5 text-left transition-colors"
                      style={selected
                        ? { borderColor: 'var(--ember-600)', background: 'rgba(195, 58, 20, 0.12)' }
                        : { borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
                    >
                      <span className="flex items-center gap-2 text-sm font-bold" style={selected ? labelStyle : mutedStyle}>
                        {selected && <Check className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />}
                        {m.title}
                      </span>
                      <span className="mt-0.5 block text-xs" style={mutedStyle}>{m.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Shared options */}
              <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
                <div>
                  <label htmlFor="hero-count" className="mb-1 block text-xs font-bold uppercase tracking-widest" style={mutedStyle}>
                    Number of products
                  </label>
                  {countSelect('hero-count')}
                </div>
                <div className="flex flex-col gap-1.5 pb-1">
                  {flagCheckbox(cfg.onlyActive, (v) => setCfg((c) => ({ ...c, onlyActive: v })), 'Only active products', 'hero-only-active')}
                  {flagCheckbox(cfg.onlyWithImages, (v) => setCfg((c) => ({ ...c, onlyWithImages: v })), 'Only products with images', 'hero-only-images')}
                </div>
              </div>
            </div>

            {/* Mode: RANDOM */}
            {cfg.mode === 'random' && (
              <div className="rounded-[12px] border p-3" style={cardStyle}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold" style={labelStyle}>Random selection</h2>
                    <p className="mt-0.5 text-xs" style={mutedStyle}>
                      A stable set of {cfg.count} eligible products. The hero keeps this set across visits —
                      shuffle only when you want a different selection.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCfg((c) => ({ ...c, seed: (Date.now() % 2147483647) || 1 }))}
                    className="ax-btn"
                  >
                    <Shuffle className="h-4 w-4" aria-hidden="true" /> Shuffle Products
                  </button>
                </div>
                {resolved.list.length === 0 && (
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--saffron-400)' }}>No eligible products available.</p>
                )}
              </div>
            )}

            {/* Mode: CATEGORY */}
            {cfg.mode === 'category' && (
              <div className="rounded-[12px] border p-3" style={cardStyle}>
                <h2 className="text-sm font-bold" style={labelStyle}>Category selection</h2>
                <p className="mt-0.5 text-xs" style={mutedStyle}>The hero shows up to {cfg.count} products from the chosen category, in admin order.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-[260px]">
                    <select
                      value={cfg.category}
                      onChange={(e) => setCfg((c) => ({ ...c, category: e.target.value }))}
                      className="h-[42px] w-full appearance-none rounded-[10px] border pl-3 pr-8 text-sm font-semibold focus:outline-none"
                      style={inputStyle}
                      aria-label="Hero category"
                    >
                      <option value="">Select category...</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
                  </div>
                </div>
                {cfg.category !== '' && resolved.fallback && (
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--saffron-400)' }}>
                    No active products found in this category — the hero is using a fallback selection.
                  </p>
                )}
              </div>
            )}

            {/* Mode: CUSTOM */}
            {cfg.mode === 'custom' && (
              <div className="rounded-[12px] border p-3" style={cardStyle}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold" style={labelStyle}>Custom Hero Product Groups</h2>
                  <button type="button" onClick={() => openEditor(null)} className="ax-btn-primary">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Create Group
                  </button>
                </div>

                {groups.length === 0 ? (
                  <p className="mt-2 text-sm" style={mutedStyle}>
                    No groups yet. Create one, pick the exact hero products, and set it as the hero source.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {groups.map((g) => {
                      const isSource = cfg.groupId === g.id;
                      return (
                        <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border px-3 py-2" style={{ borderColor: isSource ? 'var(--ember-600)' : 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold" style={labelStyle}>{g.name}</span>
                              {g.active === false
                                ? <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Inactive</span>
                                : <span className="badge badge-leaf">Active</span>}
                              {isSource && <span className="badge badge-crimson">Hero source</span>}
                            </span>
                            <span className="mt-0.5 block text-xs tabular" style={mutedStyle}>
                              {g.productIds.length} product{g.productIds.length === 1 ? '' : 's'}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setCfg((c) => ({ ...c, groupId: g.id }))} disabled={isSource} className="ax-btn !h-8 !px-3 !text-xs">
                              Use for Hero
                            </button>
                            <button type="button" onClick={() => openEditor(g)} className="ax-btn !h-8 !px-3 !text-xs">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => duplicateGroup(g)} className="ax-btn !h-8 !px-3 !text-xs">
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicate
                            </button>
                            <button type="button" onClick={() => askDeleteGroup(g)} aria-label={`Delete ${g.name}`} className="grid h-8 w-8 place-items-center rounded-[10px] border transition-colors hover:brightness-110" style={{ borderColor: 'var(--hairline)', color: 'var(--crimson-600)' }}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {activeGroup && activeGroup.productIds.length === 0 && (
                  <p className="mt-2 text-sm" style={{ color: 'var(--saffron-400)' }}>
                    No products selected in "{activeGroup.name}" — add products to it.
                  </p>
                )}
                {!activeGroup && (
                  <p className="mt-2 text-sm" style={{ color: 'var(--saffron-400)' }}>
                    No custom group is set as the hero source yet.
                  </p>
                )}
              </div>
            )}

            {/* Group editor */}
            {editing && (
              <div className="rounded-[12px] border p-3" style={{ ...cardStyle, borderColor: 'var(--hairline-strong)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold" style={labelStyle}>
                    {groups.some((g) => g.id === editing.id) ? 'Edit Group' : 'New Group'}
                  </h2>
                  <button type="button" onClick={closeEditor} className="ax-btn !h-8 !px-3 !text-xs">
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Close
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="group-name" className="mb-1 block text-xs font-bold uppercase tracking-widest" style={mutedStyle}>Group name</label>
                    <input
                      id="group-name"
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing((g) => ({ ...g, name: e.target.value }))}
                      placeholder="e.g. Diwali Best Sellers"
                      className="h-[42px] w-full rounded-[10px] border px-3 text-sm focus:outline-none"
                      style={inputStyle}
                    />
                  </div>
                  {flagCheckbox(editing.active, (v) => setEditing((g) => ({ ...g, active: v })), 'Group active', 'group-active')}
                </div>

                {/* Picker toolbar */}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative w-full flex-1 sm:min-w-[220px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="h-[42px] w-full rounded-[10px] border pl-10 pr-4 text-sm focus:outline-none"
                      style={inputStyle}
                      aria-label="Search products for this group"
                    />
                  </div>
                  <div className="relative sm:w-[180px] sm:shrink-0">
                    <select value={pickerCategory} onChange={(e) => setPickerCategory(e.target.value)} className="h-[42px] w-full appearance-none truncate rounded-[10px] border pl-3 pr-8 text-[13px] font-semibold focus:outline-none" style={inputStyle} aria-label="Filter products by category">
                      <option value="All">Category: All</option>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
                  </div>
                  <div className="relative sm:w-[160px] sm:shrink-0">
                    <select value={pickerBrand} onChange={(e) => setPickerBrand(e.target.value)} className="h-[42px] w-full appearance-none truncate rounded-[10px] border pl-3 pr-8 text-[13px] font-semibold focus:outline-none" style={inputStyle} aria-label="Filter products by brand">
                      <option value="All">Brand: All</option>
                      {pickerBrands.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
                  </div>
                  <div className="relative sm:w-[140px] sm:shrink-0">
                    <select value={pickerStatus} onChange={(e) => setPickerStatus(e.target.value)} className="h-[42px] w-full appearance-none truncate rounded-[10px] border pl-3 pr-8 text-[13px] font-semibold focus:outline-none" style={inputStyle} aria-label="Filter products by status">
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o === 'All' ? 'Status: All' : o}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={mutedStyle} />
                  </div>
                </div>

                {/* Product rows */}
                <div className="mt-2 overflow-hidden rounded-[10px] border" style={{ borderColor: 'var(--hairline)' }}>
                  {pickerProducts.length === 0 ? (
                    <p className="px-4 py-4 text-sm" style={mutedStyle}>No products found.</p>
                  ) : (
                    <ul className="max-h-[360px] divide-y overflow-y-auto" style={{ borderColor: 'var(--hairline)' }}>
                      {pickerProducts.map((p) => {
                        const selected = editing.productIds.includes(String(p.id));
                        const image = imageOf(p);
                        const price = priceOf(p);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => togglePick(String(p.id))}
                              aria-pressed={selected}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(210,166,79,0.07)]"
                              style={selected ? { background: 'rgba(210,166,79,0.1)' } : undefined}
                            >
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded border" style={{ borderColor: selected ? 'var(--ember-600)' : 'var(--hairline)', background: selected ? 'var(--ember-600)' : 'transparent' }}>
                                {selected && <Check className="h-3.5 w-3.5" style={{ color: '#FFFFFF' }} aria-hidden="true" />}
                              </span>
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border" style={{ width: 48, height: 48, borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                                {image ? (
                                  <img src={image} alt="" loading="lazy" className="h-full w-full object-contain p-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <span className="text-[10px] font-bold" style={mutedStyle}>—
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold" style={labelStyle} title={p.name}>{p.name}</span>
                                <span className="block truncate text-xs" style={mutedStyle}>
                                  {[categoryOf(p), String(getProductBrandName(p, lookup) || '')].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular" style={labelStyle}>
                                {price != null ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}
                              </span>
                              <span className="hidden shrink-0 sm:block">
                                {p.outOfStock
                                  ? <span className="badge badge-crimson whitespace-nowrap">Out of stock</span>
                                  : <span className="badge badge-leaf whitespace-nowrap">Active</span>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Selected panel */}
                <div className="mt-3 rounded-[10px] border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                  <p className="text-sm font-bold" style={labelStyle}>
                    Selected Products <span className="tabular">({editing.productIds.length})</span>
                  </p>
                  <p className="mt-0.5 text-xs" style={mutedStyle}>Order matters — the hero displays them in this order.</p>
                  {editing.productIds.length === 0 ? (
                    <p className="mt-2 text-sm" style={mutedStyle}>No products selected — pick products from the list above.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {editing.productIds.map((id, index) => {
                        const p = editingProduct(id);
                        const image = p ? imageOf(p) : '';
                        return (
                          <li key={id} className="flex items-center gap-2 rounded-[8px] border px-2 py-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                            <span className="tabular w-5 shrink-0 text-xs font-bold" style={mutedStyle}>{index + 1}</span>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border" style={{ width: 36, height: 36, borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                              {image
                                ? <img src={image} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                : <span className="text-[10px] font-bold" style={mutedStyle}>—</span>}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={labelStyle}>
                              {p ? p.name : `Missing product (${id})`}
                            </span>
                            <button type="button" onClick={() => movePicked(index, -1)} disabled={index === 0} aria-label="Move up" className="ax-btn !h-7 !px-2">
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => movePicked(index, 1)} disabled={index === editing.productIds.length - 1} aria-label="Move down" className="ax-btn !h-7 !px-2">
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => togglePick(id)} aria-label={`Remove ${p ? p.name : id}`} className="grid h-7 w-7 place-items-center rounded-[8px] border" style={{ borderColor: 'var(--hairline)', color: 'var(--crimson-600)' }}>
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeEditor} className="ax-btn">Cancel</button>
                  <button type="button" onClick={saveGroup} className="ax-btn-primary">
                    <Check className="h-4 w-4" aria-hidden="true" /> Save Group
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------- RIGHT: preview ------------------------ */}
          <aside className="min-w-0">
            <div className="sticky top-4 rounded-[12px] border p-3" style={cardStyle}>
              <h2 className="text-sm font-bold uppercase tracking-widest" style={mutedStyle}>Hero Preview</h2>
              <p className="mt-1 text-xs" style={mutedStyle}>
                Source:{' '}
                <span className="font-semibold" style={labelStyle}>
                  {cfg.mode === 'custom'
                    ? (activeGroup ? activeGroup.name : 'Custom Group')
                    : cfg.mode === 'category'
                      ? (cfg.category ? categoryDisplayName(cfg.category) : 'Category')
                      : 'Random selection'}
                </span>
              </p>

              {resolved.list.length === 0 ? (
                <p className="mt-3 text-sm" style={{ color: 'var(--saffron-400)' }}>No eligible products available.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {resolved.list.slice(0, 4).map((p) => {
                    const image = imageOf(p);
                    const price = priceOf(p);
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-[10px] border p-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[8px]" style={{ background: 'radial-gradient(90% 90% at 50% 30%, #221610 0%, #0d0908 78%)' }}>
                          {image
                            ? <img src={image} alt="" loading="lazy" className="h-full w-full object-contain p-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            : <span className="text-xs font-bold" style={mutedStyle}>—</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold" style={labelStyle} title={p.name}>{p.name}</span>
                          <span className="block text-xs tabular" style={{ color: '#EED9A4' }}>
                            {price != null ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}
                          </span>
                        </span>
                        <a
                          href={`${STOREFRONT_URL}${productPath(p)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ax-btn shrink-0 !h-7 !px-2 !text-[11px]"
                        >
                          View ↗
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}

              {resolved.list.length > 4 && (
                <p className="mt-2 text-xs" style={mutedStyle}>
                  + {resolved.list.length - 4} more rotate in the hero
                </p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed" style={mutedStyle}>
                The live hero keeps its existing animation (fade, drift, fireworks). This list only decides
                which products it cycles through. Publish to update the storefront.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default HeroProducts;
