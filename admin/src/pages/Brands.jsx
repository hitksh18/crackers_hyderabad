import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { cachedGetDocs, invalidateCache } from '../lib/firestoreCache';
import { modalVariants, pageVariants } from '../lib/motion';
import { productPath } from '../lib/productLinks';
import { PRODUCT_CATEGORIES, isProductInCategory } from '../config/categories';
import {
  brandInitials,
  brandSlugify,
  buildBrandLookup,
  countProductsByBrand,
  ensureUniqueBrandSlug,
  findDuplicateBrand,
  getProductBrandName,
  normalizeBrandName,
  productBelongsToBrand,
  unmappedBrandNames,
} from '../lib/brands';
import { uploadImage } from '../utils/uploadImage';
import toast from '../utils/toast';
import AdminHeader from '../components/admin/AdminHeader';
import BrandDialog from '../components/admin/BrandDialog';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

/* Storefront origin for "View product" links — the admin console runs on its
   own subdomain, so relative links would 404. Local override via
   VITE_STOREFRONT_URL; production falls back to the canonical shop. */
const STOREFRONT_URL =
  (import.meta.env.VITE_STOREFRONT_URL || '').trim() || 'https://crackershyderabad.com';

const STATUS_OPTIONS = ['All', 'Active', 'Inactive'];
const STOCK_OPTIONS = ['All', 'In Stock', 'Out of Stock'];

/* Firestore writeBatch caps at 500 ops — chunk so large reassign/rename
   batches can never overflow a single commit. */
const commitInChunks = async (ops) => {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
};

const emptyDraft = () => ({
  brandId: null,
  name: '',
  slug: '',
  slugEdited: false,
  logo: '',
  logoFile: null,
  description: '',
  active: true,
  linkAfterCreate: null,
});

const AdminBrands = () => {
  const { brandId } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();

  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [draft, setDraft] = useState(emptyDraft());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [deleteState, setDeleteState] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* Detail-view filters. */
  const [detailSearch, setDetailSearch] = useState('');
  const [detailCategory, setDetailCategory] = useState('All');
  const [detailStock, setDetailStock] = useState('All');

  /* Bulk assignment state — selections hold product ids and are always
     scoped to the visible tab; switching tabs clears both sets. */
  const [detailTab, setDetailTab] = useState('assigned');
  const [selectedAssigned, setSelectedAssigned] = useState(() => new Set());
  const [selectedUnassigned, setSelectedUnassigned] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      /* Shared 60s cache — Dashboard, Products, Categories and Canvas all
         read `products`, so opening Brands never triggers a fresh download
         within the TTL. Counts below derive from this cached metadata. */
      const [brandsData, productsData] = await Promise.all([
        cachedGetDocs(collection(db, 'brands'), 'brands'),
        cachedGetDocs(collection(db, 'products'), 'products'),
      ]);
      setBrands(Array.isArray(brandsData) ? brandsData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (e) {
      console.error(e);
      setLoadError('Failed to load brands');
      toast.error('Failed to load brands');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* Debounced brand search — local filtering, so this only delays the render,
     never a database request per keystroke. */
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  /* Reset the detail filters whenever another brand is opened. */
  useEffect(() => {
    setDetailSearch('');
    setDetailCategory('All');
    setDetailStock('All');
    setDeleteState(null);
    setDetailTab('assigned');
    setSelectedAssigned(new Set());
    setSelectedUnassigned(new Set());
  }, [brandId]);

  /* Switching tabs clears both selections — a stale selection from the
     other tab must never leak into a bulk action. */
  useEffect(() => {
    setSelectedAssigned(new Set());
    setSelectedUnassigned(new Set());
  }, [detailTab]);

  const lookup = useMemo(() => buildBrandLookup(brands), [brands]);
  const counts = useMemo(() => countProductsByBrand(products, brands, lookup), [products, brands, lookup]);
  const unmapped = useMemo(() => unmappedBrandNames(products, brands, lookup), [products, brands, lookup]);

  const sortedBrands = useMemo(() => {
    const list = [...brands].sort((a, b) =>
      normalizeBrandName(a.name).localeCompare(normalizeBrandName(b.name), undefined, { sensitivity: 'base' }),
    );
    return list.filter((b) => {
      if (statusFilter === 'Active' && b.active === false) return false;
      if (statusFilter === 'Inactive' && b.active !== false) return false;
      if (!searchQuery) return true;
      const name = normalizeBrandName(b.name).toLowerCase();
      const slug = String(b.slug || '').toLowerCase();
      return name.includes(searchQuery) || slug.includes(searchQuery);
    });
  }, [brands, searchQuery, statusFilter]);

  const activeBrand = useMemo(
    () => (brandId ? brands.find((b) => String(b.id) === String(brandId)) || null : null),
    [brands, brandId],
  );

  /* Shared detail filter (search name/slug/category/brand/SKU + category +
     status) applied identically to both tabs — local memoized filtering, so
     typing never triggers a database request. */
  const filterDetailList = useCallback((list) => {
    let out = list;
    const q = detailSearch.trim().toLowerCase();
    if (q) {
      out = out.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const slug = String(p.slug || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        const cats = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
        const brandName = String(getProductBrandName(p, lookup) || '').toLowerCase();
        const sku = String(p.sku || p.id || '').toLowerCase();
        return name.includes(q) || slug.includes(q) || cat.includes(q) || cats.includes(q) || brandName.includes(q) || sku.includes(q);
      });
    }
    if (detailCategory !== 'All') out = out.filter((p) => isProductInCategory(p, detailCategory));
    if (detailStock === 'In Stock') out = out.filter((p) => !p.outOfStock);
    else if (detailStock === 'Out of Stock') out = out.filter((p) => p.outOfStock);
    return [...out].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }),
    );
  }, [detailSearch, detailCategory, detailStock, lookup]);

  const assignedAll = useMemo(() => {
    if (!activeBrand) return [];
    return products.filter((p) => productBelongsToBrand(p, activeBrand, lookup));
  }, [products, activeBrand, lookup]);

  const unassignedAll = useMemo(() => {
    if (!activeBrand) return [];
    return products.filter((p) => !productBelongsToBrand(p, activeBrand, lookup));
  }, [products, activeBrand, lookup]);

  const brandProducts = useMemo(
    () => filterDetailList(assignedAll),
    [filterDetailList, assignedAll],
  );
  const unassignedProducts = useMemo(
    () => filterDetailList(unassignedAll),
    [filterDetailList, unassignedAll],
  );

  const priceOf = (p) => p.discountPrice ?? p.onlinePrice ?? p.price ?? p.offlineMRP ?? null;
  const imageOf = (p) => p.imageURL || p.imageUrl || p.image || '';
  const categoryOf = (p) => {
    if (Array.isArray(p.categories) && p.categories.length > 1) return `${p.categories[0]} +${p.categories.length - 1}`;
    if (Array.isArray(p.categories) && p.categories.length === 1) return p.categories[0];
    return p.category || '—';
  };

  /* ---------------------------- add / edit ---------------------------- */

  const openAdd = (prefillName = '') => {
    const name = normalizeBrandName(prefillName);
    setDraft({
      ...emptyDraft(),
      name,
      slug: name ? brandSlugify(name) : '',
      linkAfterCreate: prefillName ? normalizeBrandName(prefillName).toLowerCase() : null,
    });
    setDialogOpen(true);
  };

  const openEdit = (brand) => {
    setDraft({
      brandId: brand.id,
      name: normalizeBrandName(brand.name),
      slug: brand.slug || brandSlugify(brand.name || ''),
      slugEdited: true,
      logo: brand.logo || '',
      logoFile: null,
      description: brand.description || '',
      active: brand.active !== false,
      linkAfterCreate: null,
    });
    setDialogOpen(true);
  };

  const closeDialog = (clear) => {
    setDialogOpen(false);
    if (clear) setDraft(emptyDraft());
  };

  const handleLogoFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error('Only image files are allowed for brand logos');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Logo must be smaller than 10 MB');
      return;
    }
    setDraft((d) => ({ ...d, logoFile: file, logo: URL.createObjectURL(file) }));
  };

  const submitDraft = async () => {
    const name = normalizeBrandName(draft.name);
    if (!name) {
      toast.error('Please enter a brand name');
      return;
    }
    const dupe = findDuplicateBrand(brands, name, draft.brandId);
    if (dupe) {
      toast.error(`"${dupe.name}" already exists — brands must be unique`);
      return;
    }
    setSubmitting(true);
    try {
      let logoURL = normalizeBrandName(draft.logo);
      if (draft.logoFile) {
        const toastId = 'brand-logo-upload';
        try {
          toast.loading('Uploading logo...', { id: toastId });
          logoURL = await uploadImage(draft.logoFile, { dir: 'brands', upscale: false, watermark: false });
          toast.success('Logo uploaded', { id: toastId });
        } catch (uploadError) {
          toast.dismiss(toastId);
          console.error('Logo upload failed:', uploadError);
          toast.error(uploadError.message || 'Logo upload failed');
          setSubmitting(false);
          return;
        }
      }
      if (logoURL.startsWith('blob:')) logoURL = '';

      const slug = await ensureUniqueBrandSlug(draft.slug || name, draft.brandId);
      const now = new Date();

      if (!draft.brandId) {
        const docRef = await addDoc(collection(db, 'brands'), {
          name,
          slug,
          logo: logoURL,
          description: normalizeBrandName(draft.description),
          active: draft.active !== false,
          createdAt: now,
          updatedAt: now,
        });
        const created = { id: docRef.id, name, slug, logo: logoURL, description: normalizeBrandName(draft.description), active: draft.active !== false };
        setBrands((prev) => [...prev, created]);
        /* Explicit admin-triggered mapping: legacy products carrying this
           exact brand text adopt the new managed brand. Nothing else moves. */
        if (draft.linkAfterCreate) {
          const targets = products.filter((p) => {
            const existing = p.brandId || (p.brand && p.brand.id);
            if (existing) return false;
            const raw = typeof p.brand === 'string' ? p.brand : (p.brand && p.brand.name) || '';
            return normalizeBrandName(raw).toLowerCase() === draft.linkAfterCreate;
          });
          if (targets.length > 0) {
            await commitInChunks(targets.map((p) => (batch) => batch.set(doc(db, 'products', p.id), { brandId: docRef.id, brand: name }, { merge: true })));
            setProducts((prev) => prev.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, brandId: docRef.id, brand: name } : p)));
            invalidateCache('coll:products');
            toast.success(`${targets.length} product${targets.length === 1 ? '' : 's'} linked to "${name}"`);
          }
        }
        toast.success(`Brand "${name}" added`);
      } else {
        const prev = brands.find((b) => String(b.id) === String(draft.brandId));
        const renamed = prev && normalizeBrandName(prev.name) !== name;
        await updateDoc(doc(db, 'brands', draft.brandId), {
          name,
          slug,
          logo: logoURL,
          description: normalizeBrandName(draft.description),
          active: draft.active !== false,
          updatedAt: now,
        });
        setBrands((prevList) => prevList.map((b) => (String(b.id) === String(draft.brandId) ? { ...b, name, slug, logo: logoURL, description: normalizeBrandName(draft.description), active: draft.active !== false } : b)));
        /* The id never changes, so links survive a rename — only the
           denormalized display name on linked products is synced. */
        if (renamed) {
          const linked = products.filter((p) => {
            const pid = p.brandId || (p.brand && p.brand.id);
            return pid && String(pid) === String(draft.brandId);
          });
          if (linked.length > 0) {
            await commitInChunks(linked.map((p) => (batch) => batch.set(doc(db, 'products', p.id), { brand: name }, { merge: true })));
            setProducts((prevList) => prevList.map((p) => (linked.some((t) => t.id === p.id) ? { ...p, brand: name } : p)));
            invalidateCache('coll:products');
          }
        }
        toast.success(`Brand "${name}" updated`);
      }
      invalidateCache('coll:brands');
      closeDialog(true);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to save brand');
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------ delete ------------------------------ */

  const askDelete = (brand) => {
    const count = counts.get(String(brand.id)) || 0;
    if (count > 0) {
      /* Safety: never strand products on a deleted brand. */
      setReassignTo('');
      setDeleteState({ brand, count, blocked: true });
      return;
    }
    openModal({
      title: 'Delete Brand',
      message: `Are you sure you want to delete "${brand.name}"?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Brand',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'brands', brand.id));
          setBrands((prev) => prev.filter((b) => String(b.id) !== String(brand.id)));
          invalidateCache('coll:brands');
          toast.success(`Brand "${brand.name}" deleted`);
          return true;
        } catch (e) {
          console.error(e);
          toast.error('Failed to delete brand');
          return false;
        }
      },
    });
  };

  const confirmReassignDelete = async () => {
    if (!deleteState || !reassignTo) {
      toast.error('Select a brand to move the products to');
      return;
    }
    const target = brands.find((b) => String(b.id) === String(reassignTo));
    if (!target) return;
    setDeleteBusy(true);
    try {
      const { brand, count } = deleteState;
      const linked = products.filter((p) => productBelongsToBrand(p, brand, lookup));
      await commitInChunks(
        linked.map((p) => (batch) => batch.set(doc(db, 'products', p.id), { brandId: target.id, brand: normalizeBrandName(target.name) }, { merge: true })),
      );
      await deleteDoc(doc(db, 'brands', brand.id));
      setProducts((prev) => prev.map((p) => (linked.some((t) => t.id === p.id) ? { ...p, brandId: target.id, brand: normalizeBrandName(target.name) } : p)));
      setBrands((prev) => prev.filter((b) => String(b.id) !== String(brand.id)));
      invalidateCache('coll:brands');
      invalidateCache('coll:products');
      toast.success(`${count} product${count === 1 ? '' : 's'} moved to "${target.name}" — "${brand.name}" deleted`);
      if (String(brandId) === String(brand.id)) navigate('/brands', { replace: true });
      setDeleteState(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to move products');
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ------------------------- bulk assignment ------------------------- */

  const toggleSelected = (setter) => (id) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAssigned = toggleSelected(setSelectedAssigned);
  const toggleUnassigned = toggleSelected(setSelectedUnassigned);

  const selectAllVisible = (setter, list) => {
    setter(new Set(list.map((p) => p.id)));
  };

  /* Products in the selection that already carry a different brand — the
     assign confirm must call out that these MOVE brands (single-brand model:
     brandId + denormalized name are overwritten, nothing else changes). */
  const countMoves = (list) => {
    if (!activeBrand) return 0;
    const mine = String(activeBrand.name || '').trim().toLowerCase();
    return list.filter((p) => {
      const current = String(getProductBrandName(p, lookup) || '').trim().toLowerCase();
      return current !== '' && current !== mine;
    }).length;
  };

  const commitBrandChange = async (targets, toBrand) => {
    /* toBrand null = remove from brand (clears the relationship only —
       products are never deleted, prices/inventory untouched). */
    const payload = toBrand
      ? { brandId: toBrand.id, brand: normalizeBrandName(toBrand.name) }
      : { brandId: null, brand: null };
    await commitInChunks(
      targets.map((p) => (batch) => batch.set(doc(db, 'products', p.id), payload, { merge: true })),
    );
    setProducts((prev) => prev.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, ...payload } : p)));
    invalidateCache('coll:products');
  };

  const askBulkAssign = () => {
    if (!activeBrand || bulkBusy) return;
    const targets = unassignedProducts.filter((p) => selectedUnassigned.has(p.id));
    if (targets.length === 0) return;
    const moves = countMoves(targets);
    openModal({
      title: 'Assign Products',
      message: `You are about to assign ${targets.length} product${targets.length === 1 ? '' : 's'} to:\n\n${activeBrand.name}\n\nThese products will appear under this brand on the storefront.${moves > 0 ? `\n\n${moves} of these ${moves === 1 ? 'is' : 'are'} currently assigned to another brand and will be moved.` : ''}`,
      type: 'info',
      confirmText: `Assign ${targets.length} Product${targets.length === 1 ? '' : 's'}`,
      cancelText: 'Cancel',
      pendingText: 'Assigning...',
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await commitBrandChange(targets, activeBrand);
          setSelectedUnassigned(new Set());
          toast.success(`${targets.length} product${targets.length === 1 ? '' : 's'} assigned to "${activeBrand.name}"`);
          return true;
        } catch (e) {
          console.error(e);
          toast.error('Failed to assign products');
          return false;
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const askBulkRemove = () => {
    if (!activeBrand || bulkBusy) return;
    const targets = brandProducts.filter((p) => selectedAssigned.has(p.id));
    if (targets.length === 0) return;
    openModal({
      title: `Remove ${targets.length} product${targets.length === 1 ? '' : 's'} from "${activeBrand.name}"?`,
      message: 'These products will remain in your store but will no longer belong to this brand.',
      type: 'danger',
      confirmText: 'Remove Products',
      cancelText: 'Cancel',
      pendingText: 'Removing...',
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await commitBrandChange(targets, null);
          setSelectedAssigned(new Set());
          toast.success(`${targets.length} product${targets.length === 1 ? '' : 's'} removed from "${activeBrand.name}"`);
          return true;
        } catch (e) {
          console.error(e);
          toast.error('Failed to remove products');
          return false;
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  /* Detail table grid — ONE template shared byte-for-byte by the header row
     and every body row, so columns can never drift apart. The Product column
     is the only flexible one (largest share); every other column is a fixed
     track that its content cannot escape. */
  const DETAIL_GRID_ASSIGNED = 'xl:grid-cols-[minmax(280px,1fr)_minmax(150px,0.6fr)_96px_108px_168px]';
  const DETAIL_GRID_UNASSIGNED = 'xl:grid-cols-[minmax(280px,1fr)_minmax(150px,0.6fr)_96px_108px]';

  /* The product cell is its own explicit 3-column grid — checkbox | image |
     information — so the text can never occupy the image column, whatever
     the viewport. The image track is a fixed 52px and the wrapper enforces
     it with explicit width/height; the text track is minmax(0,1fr) so long
     names truncate instead of pushing anything. No absolute positioning,
     no negative margins, no compensating offsets. */
  const PRODUCT_CELL_COLUMNS = { gridTemplateColumns: '40px 52px minmax(0, 1fr)', columnGap: 12 };

  /* Detail product row — one checkbox (inside the product cell's own first
     track) on every viewport. `withActions` renders the Edit/View cell used
     by the Assigned tab; the Unassigned tab is selection-only. */
  const renderDetailRow = (p, selected, onToggle, withActions) => {
    const price = priceOf(p);
    const image = imageOf(p);
    const storefront = `${STOREFRONT_URL}${productPath(p)}`;
    const category = categoryOf(p);
    return (
      <li
        key={p.id}
        className={`flex min-h-[64px] flex-col justify-center gap-2 px-3 py-3 sm:px-4 xl:grid xl:items-center xl:gap-3 xl:py-2 ${withActions ? DETAIL_GRID_ASSIGNED : DETAIL_GRID_UNASSIGNED}`}
      >
        <div className="grid w-full min-w-0 items-center" style={PRODUCT_CELL_COLUMNS}>
          <span className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(p.id)}
              aria-label={`Select ${p.name || 'product'}`}
              className="h-4 w-4 cursor-pointer"
              style={{ accentColor: 'var(--ember-600)' }}
            />
          </span>
          <span
            className="flex items-center justify-center overflow-hidden rounded-[8px] border"
            style={{ width: 52, height: 52, minWidth: 52, padding: 4, borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
          >
            {image ? (
              <img
                src={image}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{brandInitials(p.name)}</span>
            )}
          </span>
          <div className="min-w-0 overflow-hidden">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }} title={p.name}>{p.name}</p>
            <p className="truncate text-xs xl:hidden" style={{ color: 'var(--text-muted)' }}>{category}{price != null ? ` · ₹${Number(price).toLocaleString('en-IN')}` : ''}</p>
          </div>
        </div>
        <span className="hidden min-w-0 truncate whitespace-nowrap text-xs xl:block" style={{ color: 'var(--text-muted)' }} title={category}>{category}</span>
        <span className="hidden whitespace-nowrap text-right text-sm font-semibold tabular xl:block" style={{ color: 'var(--text-strong)' }}>{price != null ? `₹${Number(price).toLocaleString('en-IN')}` : '—'}</span>
        <span className="hidden justify-end xl:flex">
          {p.outOfStock ? (
            <span className="badge badge-crimson whitespace-nowrap">Out of stock</span>
          ) : (
            <span className="badge badge-leaf whitespace-nowrap">Active</span>
          )}
        </span>
        {withActions ? (
          <span className="flex items-center gap-2 whitespace-nowrap xl:justify-end">
            {p.outOfStock ? (
              <span className="badge badge-crimson xl:hidden">Out of stock</span>
            ) : (
              <span className="badge badge-leaf xl:hidden">Active</span>
            )}
            <Link to={`/products/edit/${p.id}`} className="ax-btn ml-auto !h-8 !px-3 !text-xs xl:ml-0">Edit</Link>
            <a href={storefront} target="_blank" rel="noreferrer" className="ax-btn !h-8 !px-3 !text-xs">View ↗</a>
          </span>
        ) : (
          <span className="flex items-center gap-2 whitespace-nowrap xl:justify-end">
            {p.outOfStock ? (
              <span className="badge badge-crimson xl:hidden">Out of stock</span>
            ) : (
              <span className="badge badge-leaf xl:hidden">Active</span>
            )}
          </span>
        )}
      </li>
    );
  };

  const detailHeaderRow = (allVisibleSelected, someVisibleSelected, onToggleAll, withActions) => (
    <div
      className={`hidden items-center gap-3 px-4 py-2.5 xl:grid ${withActions ? DETAIL_GRID_ASSIGNED : DETAIL_GRID_UNASSIGNED}`}
      style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--hairline)' }}
    >
      {/* Mirrors the product cell's track geometry (40px checkbox + 52px
          image + gap) so the select-all box sits exactly above every row
          checkbox and the label starts over the text column. */}
      <div className="flex w-full min-w-0 items-center" style={PRODUCT_CELL_COLUMNS}>
        <span className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
            onChange={onToggleAll}
            aria-label="Select all visible products"
            className="h-4 w-4 cursor-pointer"
            style={{ accentColor: 'var(--ember-600)' }}
          />
        </span>
        <span aria-hidden="true" />
        <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Product</div>
      </div>
      <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Category</div>
      <div className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Price</div>
      <div className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Status</div>
      {withActions && (
        <div className="whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Actions</div>
      )}
    </div>
  );

  const brandAvatar = (brand, size = 'h-11 w-11') => (
    brand.logo ? (
      <img
        src={brand.logo}
        alt=""
        loading="lazy"
        className={`${size} shrink-0 rounded-[10px] border object-contain p-1`}
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--hairline)' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    ) : (
      <span
        aria-hidden="true"
        className={`${size} grid shrink-0 place-items-center rounded-[10px] border text-sm font-bold`}
        style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--gold-600)' }}
      >
        {brandInitials(brand.name)}
      </span>
    )
  );

  /* ------------------------------- states ------------------------------ */

  if (loading) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title={brandId ? 'Brand' : 'Brands'} backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 py-2 lg:px-8">
          {brandId ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[76px] w-full" rounded="var(--r-md)" />
              <TableSkeleton rows={6} cols={4} label="Loading brand products" />
            </div>
          ) : (
            <TableSkeleton rows={8} cols={4} label="Loading brands" />
          )}
        </div>
      </div>
    );
  }

  if (loadError && brands.length === 0) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title="Brands" backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 py-6 lg:px-8">
          <EmptyState
            icon={Award}
            title="Unable to load brands"
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

  /* --------------------------- detail view ---------------------------- */
  if (brandId) {
    if (!activeBrand) {
      return (
        <div className="admin-page bg-[var(--surface-page)]">
          <AdminHeader title="Brand" backFallback="/brands" />
          <div className="mx-auto w-full max-w-[1550px] px-4 py-6 lg:px-8">
            <EmptyState
              icon={Award}
              title="Brand not found"
              description="This brand may have been deleted."
              action={<Link to="/brands" className="btn-primary">Back to Brands</Link>}
            />
          </div>
        </div>
      );
    }
    const totalCount = products.filter((p) => productBelongsToBrand(p, activeBrand, lookup)).length;
    const hasDetailFilters = detailSearch || detailCategory !== 'All' || detailStock !== 'All';
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
          title={activeBrand.name}
          backFallback="/brands"
          controls={(
            <button type="button" onClick={() => openEdit(activeBrand)} className="ax-btn-primary">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Edit Brand</span>
              <span className="sm:hidden">Edit</span>
            </button>
          )}
        />

        <motion.div variants={pageVariants} initial="initial" animate="animate" className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8">
          {/* Brand identity card — identity on the left, the product tabs
              pushed to the far right of the SAME container (margin-left:auto,
              vertically centered). On narrow screens the tabs wrap onto their
              own line inside the card rather than overlapping anything. */}
          <div className="flex flex-col gap-2.5 rounded-[12px] border p-2.5 sm:flex-row sm:items-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {brandAvatar(activeBrand, 'h-12 w-12')}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{activeBrand.name}</h2>
                  {activeBrand.active === false ? (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Inactive</span>
                  ) : (
                    <span className="badge badge-leaf">Active</span>
                  )}
                </div>
                {activeBrand.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--text-muted)' }}>{activeBrand.description}</p>
                ) : null}
                <p className="mt-1 text-xs tabular" style={{ color: 'var(--text-subtle)' }}>
                  /products?brand={activeBrand.slug || brandSlugify(activeBrand.name)} · {totalCount} product{totalCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {/* Product tabs — counts come from the live catalogue. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end" role="tablist" aria-label="Brand product assignment">
              {[
                { id: 'assigned', label: 'Assigned Products', count: assignedAll.length },
                { id: 'unassigned', label: 'Unassigned Products', count: unassignedAll.length },
              ].map((tab) => {
                const selected = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setDetailTab(tab.id)}
                    className="flex-1 rounded-[12px] border px-3 py-2 text-[13px] font-bold transition-colors sm:flex-none sm:px-4"
                    style={selected
                      ? { borderColor: 'var(--ember-600)', background: 'rgba(195, 58, 20, 0.14)', color: 'var(--text-strong)', boxShadow: 'inset 0 0 0 1px rgba(195, 58, 20, 0.35)' }
                      : { borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
                  >
                    {tab.label} <span className="tabular">({tab.count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toolbar: search + category + status */}
          <div className="mt-2 flex flex-col gap-2 rounded-[12px] border p-2 sm:flex-row sm:items-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="relative w-full flex-1 sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
              <input
                type="text"
                placeholder={detailTab === 'assigned' ? 'Search assigned products...' : 'Search unassigned products...'}
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                className="h-[42px] w-full rounded-[10px] border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
              />
            </div>
            <div className="relative sm:w-[180px] sm:shrink-0">
              <select
                value={detailCategory}
                onChange={(e) => setDetailCategory(e.target.value)}
                className="h-[42px] w-full appearance-none truncate rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
                aria-label="Filter by category"
              >
                <option value="All">Category: All</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            </div>
            <div className="relative sm:w-[140px] sm:shrink-0">
              <select
                value={detailStock}
                onChange={(e) => setDetailStock(e.target.value)}
                className="h-[42px] w-full appearance-none truncate rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
                aria-label="Filter by status"
              >
                {STOCK_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o === 'All' ? 'Status: All' : o}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            </div>
            {hasDetailFilters && (
              <button type="button" onClick={() => { setDetailSearch(''); setDetailCategory('All'); setDetailStock('All'); }} className="ax-btn h-[42px] shrink-0">
                <RotateCcw aria-hidden="true" /> Clear
              </button>
            )}
          </div>

          {detailTab === 'assigned' ? (
            <>
              <p className="py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Showing <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{brandProducts.length}</span> of <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{totalCount}</span> products
              </p>

              {brandProducts.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title={hasDetailFilters ? 'No products match these filters' : 'No products assigned'}
                  description={hasDetailFilters ? 'Try adjusting the search or filters.' : 'Products assigned to this brand will appear here.'}
                  action={hasDetailFilters ? (
                    <button type="button" onClick={() => { setDetailSearch(''); setDetailCategory('All'); setDetailStock('All'); }} className="btn-outline">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear filters
                    </button>
                  ) : (
                    <button type="button" onClick={() => setDetailTab('unassigned')} className="btn-primary">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Assign Products
                    </button>
                  )}
                />
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                    {detailHeaderRow(
                      brandProducts.length > 0 && brandProducts.every((p) => selectedAssigned.has(p.id)),
                      brandProducts.some((p) => selectedAssigned.has(p.id)) && !brandProducts.every((p) => selectedAssigned.has(p.id)),
                      () => {
                        if (brandProducts.every((p) => selectedAssigned.has(p.id))) setSelectedAssigned(new Set());
                        else selectAllVisible(setSelectedAssigned, brandProducts);
                      },
                      true,
                    )}
                    <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                      {brandProducts.map((p) => renderDetailRow(p, selectedAssigned.has(p.id), toggleAssigned, true))}
                    </ul>
                  </div>
                  {selectedAssigned.size > 0 && (
                    <div className="sticky bottom-3 mt-2 flex flex-col gap-2 rounded-[12px] border p-3 sm:flex-row sm:items-center" style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-raised)', boxShadow: 'var(--shadow-lg)' }}>
                      <p className="text-sm font-semibold tabular" style={{ color: 'var(--text-strong)' }}>
                        {selectedAssigned.size} product{selectedAssigned.size === 1 ? '' : 's'} selected
                      </p>
                      <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                        <button type="button" onClick={() => selectAllVisible(setSelectedAssigned, brandProducts)} disabled={bulkBusy} className="ax-btn">
                          Select all {brandProducts.length} visible
                        </button>
                        <button type="button" onClick={askBulkRemove} disabled={bulkBusy} className="ax-btn-primary">
                          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          Remove from Brand
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Showing <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{unassignedProducts.length}</span> of <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{unassignedAll.length}</span> products
              </p>

              {unassignedProducts.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title={hasDetailFilters ? 'No products match these filters' : 'All products are assigned'}
                  description={hasDetailFilters ? 'Try adjusting the search or filters.' : 'No unassigned products are available for this brand.'}
                  action={hasDetailFilters ? (
                    <button type="button" onClick={() => { setDetailSearch(''); setDetailCategory('All'); setDetailStock('All'); }} className="btn-outline">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear filters
                    </button>
                  ) : null}
                />
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                    {detailHeaderRow(
                      unassignedProducts.length > 0 && unassignedProducts.every((p) => selectedUnassigned.has(p.id)),
                      unassignedProducts.some((p) => selectedUnassigned.has(p.id)) && !unassignedProducts.every((p) => selectedUnassigned.has(p.id)),
                      () => {
                        if (unassignedProducts.every((p) => selectedUnassigned.has(p.id))) setSelectedUnassigned(new Set());
                        else selectAllVisible(setSelectedUnassigned, unassignedProducts);
                      },
                      false,
                    )}
                    <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                      {unassignedProducts.map((p) => renderDetailRow(p, selectedUnassigned.has(p.id), toggleUnassigned, false))}
                    </ul>
                  </div>
                  {selectedUnassigned.size > 0 && (
                    <div className="sticky bottom-3 mt-2 flex flex-col gap-2 rounded-[12px] border p-3 sm:flex-row sm:items-center" style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-raised)', boxShadow: 'var(--shadow-lg)' }}>
                      <p className="text-sm font-semibold tabular" style={{ color: 'var(--text-strong)' }}>
                        {selectedUnassigned.size} product{selectedUnassigned.size === 1 ? '' : 's'} selected
                      </p>
                      <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                        <button type="button" onClick={() => selectAllVisible(setSelectedUnassigned, unassignedProducts)} disabled={bulkBusy} className="ax-btn">
                          Select all {unassignedProducts.length} visible
                        </button>
                        <button type="button" onClick={askBulkAssign} disabled={bulkBusy} className="ax-btn-primary">
                          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          Assign {selectedUnassigned.size} Product{selectedUnassigned.size === 1 ? '' : 's'} to {activeBrand.name}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </motion.div>

        <BrandDialog
          open={dialogOpen}
          mode="edit"
          name={draft.name}
          onNameChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({ ...d, name: v, slug: d.slugEdited ? d.slug : brandSlugify(v) }));
          }}
          slug={draft.slug}
          onSlugChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugEdited: true }))}
          slugEdited={draft.slugEdited}
          logo={draft.logo}
          onLogoChange={(e) => setDraft((d) => ({ ...d, logo: e.target.value, logoFile: null }))}
          logoFile={draft.logoFile}
          onLogoFileChange={handleLogoFile}
          description={draft.description}
          onDescriptionChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          active={draft.active}
          onActiveChange={(v) => setDraft((d) => ({ ...d, active: v }))}
          submitting={submitting}
          onSubmit={submitDraft}
          onClose={() => closeDialog(false)}
          onCancel={() => closeDialog(true)}
        />
      </div>
    );
  }

  /* ---------------------------- list view ----------------------------- */
  const hasListFilters = searchInput || statusFilter !== 'All';
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
        title="Brands"
        backFallback="/dashboard"
        controls={(
          <button type="button" onClick={() => openAdd()} className="ax-btn-primary">
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Add Brand</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      />

      <motion.div variants={pageVariants} initial="initial" animate="animate" className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8">
        <div className="py-4">
          <h2 className="text-base font-bold leading-snug" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Manage product manufacturers and brand collections.</h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="tabular">{brands.length} brand{brands.length === 1 ? '' : 's'}</span>
            <span aria-hidden="true" style={{ color: 'var(--text-subtle)' }}>·</span>
            <span className="tabular">{products.length} total products</span>
            {unmapped.length > 0 && (
              <>
                <span aria-hidden="true" style={{ color: 'var(--text-subtle)' }}>·</span>
                <span className="tabular font-semibold" style={{ color: 'var(--ember-600)' }}>{unmapped.reduce((s, u) => s + u.count, 0)} products with unmapped brand text</span>
              </>
            )}
          </p>
        </div>

        {/* Toolbar: search + status */}
        <div className="flex flex-col gap-2 rounded-[12px] border p-2 sm:flex-row sm:items-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="relative w-full flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="Search brands..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-[42px] w-full rounded-[10px] border bg-[var(--surface-sunken)] pl-10 pr-9 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
              aria-label="Search brands"
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} aria-label="Clear brand search" className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-[42px] w-full appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-[13px] font-semibold focus:outline-none sm:w-auto"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === 'All' ? 'Status: All' : o}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>
          {hasListFilters && (
            <button type="button" onClick={() => { setSearchInput(''); setStatusFilter('All'); }} className="ax-btn h-[42px] shrink-0">
              <RotateCcw aria-hidden="true" /> Clear
            </button>
          )}
        </div>

        <p className="py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          Showing <span className="tabular font-bold" style={{ color: 'var(--ember-600)' }}>{sortedBrands.length}</span> of <span className="tabular font-bold" style={{ color: 'var(--text-strong)' }}>{brands.length}</span> brands
        </p>

        {sortedBrands.length === 0 ? (
          <EmptyState
            icon={Award}
            title={hasListFilters ? 'No brands match your search' : 'No brands yet'}
            description={hasListFilters ? 'Try a different name or slug.' : 'Create your first brand to organize products by manufacturer.'}
            action={hasListFilters ? (
              <button type="button" onClick={() => { setSearchInput(''); setStatusFilter('All'); }} className="btn-outline">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear search
              </button>
            ) : (
              <button type="button" onClick={() => openAdd()} className="btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Brand
              </button>
            )}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="hidden items-center gap-3 px-4 py-2 lg:grid" style={{ gridTemplateColumns: '1fr 130px 110px 190px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--hairline)' }}>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Brand</div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Products</div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Status</div>
              <div className="text-right text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Actions</div>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
              {sortedBrands.map((b) => {
                const count = counts.get(String(b.id)) || 0;
                return (
                  <li key={b.id} className="flex flex-col gap-2.5 px-3 py-3 sm:px-4 lg:grid lg:grid-cols-[1fr_130px_110px_190px] lg:items-center lg:gap-3 lg:py-2">
                    <Link to={`/brands/${b.id}`} className="group flex min-w-0 items-center gap-3 rounded-[10px]">
                      {brandAvatar(b)}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold group-hover:underline" style={{ color: 'var(--text-strong)' }}>{b.name}</span>
                        <span className="block truncate text-xs tabular" style={{ color: 'var(--text-subtle)' }}>{b.slug || brandSlugify(b.name)}</span>
                      </span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 lg:hidden" style={{ color: 'var(--text-subtle)' }} />
                    </Link>
                    <Link to={`/brands/${b.id}`} className="w-fit text-xs font-semibold tabular hover:underline lg:w-auto" style={{ color: 'var(--text-body)' }}>
                      {count} product{count === 1 ? '' : 's'}
                    </Link>
                    <span>
                      {b.active === false ? (
                        <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Inactive</span>
                      ) : (
                        <span className="badge badge-leaf">Active</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 lg:justify-end">
                      <Link to={`/brands/${b.id}`} className="ax-btn !h-8 !px-3 !text-xs">View</Link>
                      <button type="button" onClick={() => openEdit(b)} className="ax-btn !h-8 !px-3 !text-xs">
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => askDelete(b)} aria-label={`Delete ${b.name}`} className="grid h-8 w-8 place-items-center rounded-[10px] border transition-colors hover:brightness-110" style={{ borderColor: 'var(--hairline)', color: 'var(--crimson-600)' }}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Legacy brand text with no managed record — explicit, safe mapping. */}
        {unmapped.length > 0 && (
          <section aria-label="Unmapped brand names" className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-sunken)' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Unmapped brand names</h3>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Product brand text with no managed brand yet — create the brand to link these products.</p>
              </div>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
              {unmapped.map((u) => (
                <li key={u.name.toLowerCase()} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border text-xs font-bold" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>
                    {brandInitials(u.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{u.name}</span>
                    <span className="block text-xs tabular" style={{ color: 'var(--text-muted)' }}>{u.count} product{u.count === 1 ? '' : 's'}</span>
                  </span>
                  <button type="button" onClick={() => openAdd(u.name)} className="ax-btn shrink-0 !h-8 !px-3 !text-xs">
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Create brand
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </motion.div>

      <BrandDialog
        open={dialogOpen}
        mode={draft.brandId ? 'edit' : 'add'}
        name={draft.name}
        onNameChange={(e) => {
          const v = e.target.value;
          setDraft((d) => ({ ...d, name: v, slug: d.slugEdited ? d.slug : brandSlugify(v) }));
        }}
        slug={draft.slug}
        onSlugChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugEdited: true }))}
        slugEdited={draft.slugEdited}
        logo={draft.logo}
        onLogoChange={(e) => setDraft((d) => ({ ...d, logo: e.target.value, logoFile: null }))}
        logoFile={draft.logoFile}
        onLogoFileChange={handleLogoFile}
        description={draft.description}
        onDescriptionChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        active={draft.active}
        onActiveChange={(v) => setDraft((d) => ({ ...d, active: v }))}
        submitting={submitting}
        onSubmit={submitDraft}
        onClose={() => closeDialog(false)}
        onCancel={() => closeDialog(true)}
      />

      {/* Delete safety: blocked while products are assigned — reassign or cancel. */}
      <AnimatePresence>
        {deleteState?.blocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.001 : 0.18 }}
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/55 p-4"
            onClick={() => { if (!deleteBusy) setDeleteState(null); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="brand-delete-title"
              variants={modalVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-lg)] border"
              style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline-strong)', boxShadow: 'var(--shadow-xl)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b px-5 py-4" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(203, 42, 42, 0.12)', color: 'var(--crimson-600)' }}>
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="brand-delete-title" className="card-title truncate" style={{ color: 'var(--text-strong)' }}>
                    Cannot delete “{deleteState.brand.name}”
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    This brand has {deleteState.count} product{deleteState.count === 1 ? '' : 's'} assigned to it.
                  </p>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-sm" style={{ color: 'var(--text-body)' }}>
                  This brand cannot be deleted while products are assigned to it. Move the products to another brand first — nothing is left pointing at a deleted brand.
                </p>
                <div>
                  <label htmlFor="brand-reassign" className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                    Move {deleteState.count} product{deleteState.count === 1 ? '' : 's'} to
                  </label>
                  <div className="relative">
                    <select
                      id="brand-reassign"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      className="input-premium w-full appearance-none pr-9"
                    >
                      <option value="">Select a brand...</option>
                      {brands.filter((b) => String(b.id) !== String(deleteState.brand.id)).map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" disabled={deleteBusy} onClick={() => setDeleteState(null)} className="btn-outline flex-1">Cancel</button>
                  <Link to={`/brands/${deleteState.brand.id}`} className="btn-outline flex-1 text-center" onClick={() => setDeleteState(null)}>View Products</Link>
                  <button type="button" disabled={deleteBusy || !reassignTo} onClick={confirmReassignDelete} className="btn-primary flex-1">
                    {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {deleteBusy ? 'Moving...' : 'Move & Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminBrands;
