import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { Link, useNavigationType, useSearchParams } from 'react-router-dom';
import {
  Check, GripVertical, LayoutGrid, List,
  PackageSearch, RotateCcw, SearchX,
} from 'lucide-react';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import ProductCard from '../components/ProductCard';
import CategoryIcon from '../components/CategoryIconPack';
import EmptyState from '../components/ui/EmptyState';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';
import toast from '../utils/toast';
import { PRODUCT_CATEGORIES, isProductInCategory, resolveCategory, categoryDisplayName } from '../config/categories';
import { readCategoryShowcaseConfig, applyShowcaseOrder } from '../lib/categoryShowcase';
import { buildBrandLookup, withResolvedBrands, brandSlugOf, productMatchesBrand, resolveBrandParam } from '../lib/resolveBrand';
import { normalizeQuery, searchProducts } from '../lib/productSearch';
import { normalizeImageUrl } from '../lib/normalizeImageUrl';
import { readCustomerProductsScroll, clearCustomerProductsScroll } from '../lib/productsScroll';
import { trackSearch } from '../lib/ga4';

/* Categories come from the single source of truth (config/categories.js),
   ordered by the canonical Canvas showcase config (settings/categoryShowcase)
   — the exact same ordering Home uses. Falls back to base order until the
   config arrives or when it is unavailable. */
const useOrderedCategories = () => {
  const [categories, setCategories] = useState(PRODUCT_CATEGORIES);
  useEffect(() => {
    let cancelled = false;
    readCategoryShowcaseConfig()
      .then((cfg) => {
        if (!cancelled && cfg) setCategories(applyShowcaseOrder(PRODUCT_CATEGORIES, cfg));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return categories;
};

/* Search entry points: the navbar's search (single search bar) writes the
   ?q= param, which the page reads into searchTerm. */

const SORT_OPTIONS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name: A to Z' },
];

/* Per-category SEO descriptors — one factual line each, used for the
   category meta description and the visible context line. No delivery,
   discount or availability claims; names come from the canonical config. */
const CATEGORY_DESCRIPTORS = {
  'Sparkles': 'hand-held sparklers in multiple sizes for every celebration',
  'Ground Chakkars': 'spinning ground chakkars in classic and special effects',
  'Flower Pots': 'colourful flower pots and fountains for family displays',
  'Bombs': 'traditional sound crackers in a range of sizes',
  'Garlands': 'garland crackers from single strings to multi-thousand wala series',
  'Rockets': 'sky rockets with bright bursts and whistling effects',
  'Sky Shots': 'multi-shot aerial repeaters for bigger displays',
  'Guns, Rolls & Pop Pop': 'caps, rolls and pop-pop novelties',
  'Threads and Novelties': 'sparkling pencils and novelty threads',
  'Fancy Fireworks': 'special-effect fancy fireworks for grand celebrations',
  'Kids Special': 'a family-focused selection of fireworks',
  'Gift Boxes': 'curated gift boxes combining favourites for gifting',
};

/* The price a shopper actually pays, in the same precedence ProductCard uses to
   render it. Reading `price` alone was the sorting bug: this catalogue stores
   `onlinePrice` and `discountPrice`, so `price` is usually undefined and every
   comparison collapsed to 0 — the list looked sorted by price but never moved.

   Coerces numeric strings ("240", "240.00", " ₹240 ") and treats anything
   unparseable as no price, so one malformed product cannot poison the order. */
const sellingPrice = (product) => {
  const candidates = [product?.discountPrice, product?.onlinePrice, product?.price];
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      continue;
    }
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    // Nothing numeric survived ("abc", "--") — treat it as no price. Number('')
    // is 0, which would file a broken product as the cheapest thing in the shop.
    if (!cleaned) continue;
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

/* Case- and number-insensitive name order ("10 Shots" before "9 Shots"), with a
   stable id tie-break so equal names never shuffle between renders. */
const byName = (a, b) =>
  String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base', numeric: true })
  || String(a?.id || '').localeCompare(String(b?.id || ''));

const byFeaturedOrder = (a, b) => {
  const orderA = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 9999;
  const orderB = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 9999;
  return orderA - orderB || byName(a, b);
};

/* Pure: always returns a new array, never mutates the input. */
const sortList = (list, key) => {
  const sorted = [...list];
  switch (key) {
    case 'price-asc':
      // Unpriced products sink to the end rather than masquerading as free.
      return sorted.sort((a, b) => {
        const pa = sellingPrice(a);
        const pb = sellingPrice(b);
        if (pa === null && pb === null) return byFeaturedOrder(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb || byName(a, b);
      });
    case 'price-desc':
      return sorted.sort((a, b) => {
        const pa = sellingPrice(a);
        const pb = sellingPrice(b);
        if (pa === null && pb === null) return byFeaturedOrder(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa || byName(a, b);
      });
    case 'name-asc':
      return sorted.sort(byName);
    case 'featured':
    default:
      return sorted.sort(byFeaturedOrder);
  }
};

/* ---- Category pills ------------------------------------------------
   Compact single-line filter chips. Every value that affects how wide a
   pill gets (font, padding, icon, gaps) lives in CSS and is sized by
   clamp() against the viewport, so all 12 fit on one line on desktop.
   No abbreviations, no hidden categories, no dropdown. */
/* Layout/sizing lives in .catalogue-pill (index.css) so the one-line fit is
   tuned in one place; only interaction styling stays here. */
const pillBase =
  'catalogue-pill inline-flex items-center rounded-[var(--r-pill)] transition-transform duration-200 ease-out ' +
  'hover:-translate-y-0.5 focus-visible:-translate-y-0.5';

const pillStyle = (active) =>
  active
    ? {
        background: 'var(--grad-maroon)',
        color: '#FFFFFF',
        border: '1px solid rgba(210, 166, 79, 0.55)',
        boxShadow: 'var(--shadow-sm)',
        fontWeight: 700,
      }
    : {
        background: 'var(--surface-card)',
        color: 'var(--text-body)',
        border: '1px solid var(--hairline-strong)',
        fontWeight: 600,
      };

const gridClasses = {
  grid: 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
  list: 'flex flex-col gap-3 sm:gap-4 min-w-0',
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('featured');
  const [viewMode, setViewMode] = useState('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const { isAdmin } = useAuth();
  const categories = useOrderedCategories();
  const [reorderMode, setReorderMode] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dirtyRef = useRef(false);

  /* Products-only scrollbar treatment: hide the visible page scrollbar while
     keeping normal document scrolling (wheel, trackpad, touch, keyboard all
     operate on the document scroller, which stays overflow-y: auto). Scoped
     via a class on <html> — removed on unmount — so admin pages, modals,
     dropdowns and every internal scroll container are untouched. Mirrors the
     homepage (.route-home) pattern. */
  useEffect(() => {
    document.documentElement.classList.add('route-products');
    return () => document.documentElement.classList.remove('route-products');
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Shared 60s cache with Home + cart revalidation: navigating
        // Home ↔ Products reuses one download, filtering stays local.
        // Brands ride the same cache so every card resolves from one read.
        const [productsData, brandsData] = await Promise.all([
          cachedGetDocs(collection(db, 'products'), 'products'),
          cachedGetDocs(collection(db, 'brands'), 'brands').catch(() => []),
        ]);
        setProducts(Array.isArray(productsData) ? productsData : []);
        setBrands(Array.isArray(brandsData) ? brandsData : []);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      // Normalise legacy spellings/casing (?category=threads & pencils) to
      // the canonical stored value so pills highlight and filters match.
      setSelectedCategory(resolveCategory(categoryParam)?.value || categoryParam);
    }
    const qParam = searchParams.get('q');
    if (qParam) {
      setSearchTerm(qParam);
      // GA4 search: the ?q= navigation IS the submitted search (navbar +
      // mobile overlay both navigate on submit). Deduped inside the helper
      // so StrictMode remounts send it once.
      trackSearch(qParam);
    } else {
      // No ?q= means no search — clear any stale term so the full catalogue
      // returns (e.g. navigating from /products?q=x back to /products).
      setSearchTerm('');
    }
  }, [searchParams]);

  /* One brands lookup per page load — every card below resolves from it. */
  const brandLookup = useMemo(() => buildBrandLookup(brands), [brands]);

  /* Managed brand filter, derived straight from the shareable ?brand=<slug>
     param (slug, id or name all resolve) — no mirrored state to drift. Only
     active brands resolve; inactive ones stay out of customer navigation. */
  const brandParam = searchParams.get('brand');
  const activeBrand = brandParam ? resolveBrandParam(brands, brandParam) : null;
  const unknownBrand = brandParam && brands.length > 0 && !activeBrand ? brandParam : null;

  /* Brand dropdown options: active brands that actually have products in the
     catalogue, alphabetical. Inactive and empty brands stay hidden. */
  const brandOptions = useMemo(() => {
    const list = Array.isArray(brands) ? brands.filter((b) => b && b.active !== false) : [];
    return list
      .filter((b) => products.some((p) => productMatchesBrand(p, b, brandLookup)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }, [brands, products, brandLookup]);

  /* Back-from-details scroll restoration: only POP navigations (browser Back
     or history-back) may restore; PUSH (navbar links, fresh clicks) clears
     any saved position so intentional visits always start at the top.
     Restoration waits for the catalogue (loading false) and a settled
     layout via double rAF — instant, never smooth — then consumes the key.
     Filters/sort/view are untouched; query-param filters re-apply through
     the existing searchParams flow on Back. */
  useEffect(() => {
    if (loading) return;
    if (navigationType !== 'POP') {
      clearCustomerProductsScroll();
      return;
    }
    const saved = readCustomerProductsScroll();
    if (!saved) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, Math.max(0, Math.min(saved.scrollY, Math.max(0, max))));
        } catch {
          /* Unmounted mid-restore — ignore. */
        }
        clearCustomerProductsScroll();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // navigationType is mount-time only; loading gates the restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /* The visible list is derived, not stored: filter (category + search) and
     sort run together on every render, so the cards can never lag behind the
     control that was just used. Brand normalization runs last so ProductCard
     always receives a consistent { id, name, logo } shape. Nothing here
     mutates `products`. */
  const filteredProducts = useMemo(() => {
    /* An unresolvable ?brand= is a dead link, not the full catalogue. */
    if (unknownBrand) return [];
    let list = products;

    if (activeBrand) {
      list = list.filter(p => productMatchesBrand(p, activeBrand, brandLookup));
    }

    if (selectedCategory !== 'All') {
      list = list.filter(p => isProductInCategory(p, selectedCategory));
    }

    if (searchTerm) {
      /* Same engine as the navbar suggestions (normalization, substrings,
         numbers, brand/category fields) — membership only, the toolbar sort
         below still decides the order. Local + synchronous, so the grid can
         never flash an empty state between keystrokes; single characters are
         first-class queries in the engine. */
      if (!normalizeQuery(searchTerm)) {
        list = [];
      } else {
        const matchedIds = new Set(
          searchProducts(list, searchTerm, list.length, brandLookup).map((p) => p.id)
        );
        list = list.filter((p) => matchedIds.has(p.id));
      }
    }

    return withResolvedBrands(sortList(list, sortBy), brandLookup);
  }, [products, brandLookup, searchTerm, selectedCategory, activeBrand, unknownBrand, sortBy]);

  const sortByOrder = (list) =>
    [...list].sort((a, b) =>
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || (a.name || '').localeCompare(b.name || '')
    );

  const handleDragStart = (e, productId) => {
    if (!reorderMode) return;
    setDragId(productId);
    dirtyRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', productId);
  };

  const reorderInMemory = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = sortByOrder(products);
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
    if (!reorderMode || !dragId) return;
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
      const list = sortByOrder(products);
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

  /* Same semantics as the "All Products" pill, plus clearing the search box. */
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All');
    setSearchParams({});
  };

  const hasActiveFilters = Boolean(searchTerm) || selectedCategory !== 'All' || Boolean(brandParam);

  const totalCount = filteredProducts.length;

  let emptyTitle = 'No products listed yet';
  let emptyDescription = 'The catalogue is empty right now. Please check back shortly.';
  if (unknownBrand) {
    emptyTitle = 'Brand not found';
    emptyDescription = `Nothing is listed under “${unknownBrand}” right now. Reset the filters to browse the full catalogue.`;
  } else if (searchTerm) {
    emptyTitle = 'No products match that search';
    const scope = activeBrand ? ` from ${activeBrand.name}` : (selectedCategory === 'All' ? '' : ` in ${categoryDisplayName(selectedCategory)}`);
    emptyDescription = `Nothing matched “${searchTerm}”${scope}. Try a shorter word, or reset the filters to browse the whole range.`;
  } else if (activeBrand) {
    emptyTitle = `Nothing from ${activeBrand.name} right now`;
    emptyDescription = selectedCategory === 'All'
      ? 'This brand has no products listed at the moment. Reset the filters to browse the full catalogue.'
      : `This brand has no ${categoryDisplayName(selectedCategory)} listed at the moment. Reset the filters to browse the full catalogue.`;
  } else if (selectedCategory !== 'All') {
    const label = categoryDisplayName(selectedCategory);
    emptyTitle = `Nothing in ${label} right now`;
    emptyDescription = 'This category has no products listed at the moment. Reset the filters to browse the full catalogue.';
  }

  const selectCategory = (name) => {
    // Clicking the active pill again clears the filter — back to the full
    // range. (There is no "All" pill in the row; this is the way back.)
    if (name === selectedCategory) name = 'All';
    setSelectedCategory(name);
    const brandPart = brandParam ? { brand: brandParam } : {};
    const qPart = searchTerm ? { q: searchTerm } : {};
    if (name === 'All') {
      setSearchParams({ ...brandPart, ...qPart });
    } else {
      setSearchParams({ category: name, ...brandPart, ...qPart });
    }
  };

  /* Brand dropdown — writes the shareable slug so the URL stays the filter.
     Category and search ride along; every filter combines. */
  const selectBrand = (brandId) => {
    const categoryPart = selectedCategory !== 'All' ? { category: selectedCategory } : {};
    const qPart = searchTerm ? { q: searchTerm } : {};
    if (!brandId || brandId === 'All') {
      setSearchParams({ ...categoryPart, ...qPart });
      return;
    }
    const doc = brands.find((b) => String(b.id) === String(brandId));
    setSearchParams({ ...categoryPart, brand: brandSlugOf(doc) || doc?.name || brandId, ...qPart });
  };

  /* Category SEO: unique title/description/H1 per real category, generic
     catalogue signals otherwise. Canonical strategy unchanged
     (/products?category=<value>), extended with ?brand=<slug> — the brand
     collection view reuses this same page, never a duplicate listing. */
  const activeCategoryEntry = selectedCategory !== 'All' ? resolveCategory(selectedCategory) : null;
  const activeCategoryName = activeCategoryEntry ? activeCategoryEntry.name : null;
  const activeCategoryDescriptor = activeCategoryEntry
    ? (CATEGORY_DESCRIPTORS[activeCategoryEntry.value] || CATEGORY_DESCRIPTORS[activeCategoryEntry.name] || 'fireworks picked for celebrations')
    : null;
  const activeBrandSlug = activeBrand ? (brandSlugOf(activeBrand) || activeBrand.name) : null;
  const catalogueCanonical = (() => {
    const params = new URLSearchParams();
    if (activeCategoryEntry) params.set('category', activeCategoryEntry.value);
    if (activeBrandSlug) params.set('brand', activeBrandSlug);
    const qs = params.toString();
    return qs ? `/products?${qs}` : '/products';
  })();
  const catalogueTitle = activeBrand
    ? (activeCategoryName
        ? `${activeBrand.name} ${activeCategoryName} in Hyderabad | Crackers Hyderabad`
        : `${activeBrand.name} Fireworks in Hyderabad | Crackers Hyderabad`)
    : (activeCategoryName
      ? `${activeCategoryName} in Hyderabad | Crackers Hyderabad`
      : 'Buy Crackers Online in Hyderabad | Wholesale Fireworks – Crackers Hyderabad');
  const catalogueDescription = activeBrand
    ? (activeBrand.description
      ? `${activeBrand.name}: ${activeBrand.description}`.slice(0, 160)
      : `Shop ${activeBrand.name.toLowerCase()} fireworks online at Crackers Hyderabad with delivery across Hyderabad.${activeCategoryDescriptor ? ` ${activeCategoryDescriptor.charAt(0).toUpperCase() + activeCategoryDescriptor.slice(1)}.` : ''}`)
    : (activeCategoryName
      ? `Shop ${activeCategoryName.toLowerCase()} online at Crackers Hyderabad with delivery across Hyderabad. ${activeCategoryDescriptor.charAt(0).toUpperCase() + activeCategoryDescriptor.slice(1)}.`
      : 'Shop premium fireworks and wholesale crackers in Hyderabad. Gift boxes, sparkles, rockets, flower pots and festival collections with doorstep delivery.');
  const catalogueBreadcrumbLd = (activeCategoryEntry || activeBrand)
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://crackershyderabad.com/' },
          { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://crackershyderabad.com/products' },
          ...(activeCategoryEntry && !activeBrand
            ? [{
                '@type': 'ListItem',
                position: 3,
                name: activeCategoryName,
                item: `https://crackershyderabad.com${catalogueCanonical}`,
              }]
            : []),
          ...(activeBrand
            ? [{
                '@type': 'ListItem',
                position: activeCategoryEntry ? 4 : 3,
                name: activeBrand.name,
                item: `https://crackershyderabad.com${catalogueCanonical}`,
              }]
            : []),
        ],
      }
    : null;

  return (
    <div className="min-h-screen">
      <Seo
        title={catalogueTitle}
        description={catalogueDescription}
        canonical={catalogueCanonical}
        jsonLd={catalogueBreadcrumbLd}
      />
      <div className="shell products-page" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
        {/* ============ COMPACT HEADER ============ */}
        <header className="text-center products-page-header">
          <span className="section-eyebrow justify-center">{activeBrand ? 'Brand' : 'Catalogue'}</span>
          <h1 className="section-title mt-1.5 text-balance">
            {activeBrand
              ? (activeCategoryName ? `${activeBrand.name} ${activeCategoryName}` : `${activeBrand.name} in Hyderabad`)
              : (activeCategoryName ? `${activeCategoryName} in Hyderabad` : 'Our Products')}
          </h1>
          {(activeCategoryEntry || activeBrand) && (
            <nav aria-label="Breadcrumb" className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Link to="/">Home</Link>
              <span aria-hidden="true"> / </span>
              <Link to="/products">Products</Link>
              {activeCategoryName && (
                <>
                  <span aria-hidden="true"> / </span>
                  {activeBrand ? <Link to={`/products?category=${encodeURIComponent(activeCategoryEntry.value)}`}>{activeCategoryName}</Link> : <span aria-current="page">{activeCategoryName}</span>}
                </>
              )}
              {activeBrand && (
                <>
                  <span aria-hidden="true"> / </span>
                  <span aria-current="page">{activeBrand.name}</span>
                </>
              )}
            </nav>
          )}
          {activeBrand ? (
            <div className="mx-auto mt-2 flex max-w-xl flex-col items-center gap-1.5">
              {activeBrand.logo && (
                <img
                  src={normalizeImageUrl(activeBrand.logo)}
                  alt={`${activeBrand.name} logo`}
                  loading="lazy"
                  className="h-12 w-12 rounded-xl border object-contain p-1"
                  style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <p className="max-w-xl text-sm" style={{ color: 'var(--text-muted)' }}>
                {activeBrand.description || `Premium fireworks from ${activeBrand.name}.`}
              </p>
            </div>
          ) : (
            activeCategoryDescriptor && (
              <p className="mx-auto mt-1.5 max-w-xl text-sm" style={{ color: 'var(--text-muted)' }}>
                Explore {activeCategoryDescriptor} from Crackers Hyderabad.
              </p>
            )
          )}
        </header>

        {/* ============ CATEGORY FILTER PILLS — spec-compliant scroll container ============ */}
        <div className="category-scroll-container mt-3">
          <nav
            aria-label="Filter products by category"
            className="catalogue-pills category-list"
          >
            {categories.map((category) => {
              const isSelected = resolveCategory(selectedCategory)?.value === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => selectCategory(category.value)}
                  aria-pressed={isSelected}
                  className={`${pillBase} category-pill`}
                  style={pillStyle(isSelected)}
                >
<span className="catalogue-pill-icon" aria-hidden="true">
                    <CategoryIcon category={category.slug} noCrop />
                  </span>
                  <span>{category.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ============ TOOLBAR ============ */}
        <div className="catalogue-toolbar">
          <p className="catalogue-count">
            {loading
              ? 'Loading products…'
              : totalCount === 0
                ? 'No products'
                : `Showing ${totalCount} ${totalCount === 1 ? 'product' : 'products'}`}
          </p>

          <div className="catalogue-toolbar-actions">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="admin-reorder"
                title="Clear search and category filters"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Clear filters
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setReorderMode(!reorderMode);
                  setDragId(null);
                  setDragOverId(null);
                }}
                aria-pressed={reorderMode}
                className={`mobile-admin-reorder admin-reorder ${reorderMode ? 'active' : ''}`}
              >
                {reorderMode ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Done
                  </>
                ) : (
                  <>
                    <GripVertical className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Reorder Products
                  </>
                )}
              </button>
            )}

            <label className="sort-label" htmlFor="catalogue-brand">
              Brand
            </label>
            <select
              id="catalogue-brand"
              value={activeBrand ? String(activeBrand.id) : 'All'}
              onChange={(e) => selectBrand(e.target.value)}
              className="sort-select"
              aria-label="Filter products by brand"
            >
              <option value="All">All Brands</option>
              {brandOptions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>

            <label className="sort-label" htmlFor="catalogue-sort">
              Sort by
            </label>
            <select
              id="catalogue-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="view-toggle" role="group" aria-label="View layout">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                title="Grid view"
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                title="List view"
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {isAdmin && reorderMode && (
          <div className="catalogue-admin">
            {/* Hint only — the reorder toggle itself lives in the toolbar row
                above on all viewports. Rendered solely while reordering so
                this row never reserves vertical space otherwise. */}
            <p
              className="admin-reorder-hint"
              style={{
                background: 'rgba(210, 166, 79, 0.14)',
                border: '1px solid rgba(210, 166, 79, 0.4)',
                color: 'var(--gold-600)',
              }}
            >
              Drag product cards to rearrange — customers see this exact order
            </p>
          </div>
        )}

        {/* ============ GRID ============ */}
        {/* In-flow search results heading — the query's matches render as
            normal product cards in the grid below. No floating overlay. */}
        {!loading && searchTerm.trim().length > 0 && (
          <div className="mt-4">
            <p className="section-eyebrow">Search results</p>
            <h2 className="subsection-title mt-1">
              {totalCount} {totalCount === 1 ? 'match' : 'matches'} for &ldquo;{searchTerm.trim()}&rdquo;
            </h2>
          </div>
        )}
        <div className="mt-4">
          {loading ? (
            <ProductGridSkeleton count={12} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={searchTerm ? SearchX : PackageSearch}
              title={emptyTitle}
              description={emptyDescription}
              action={
                hasActiveFilters ? (
                  <button type="button" onClick={resetFilters} className="btn-primary">
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Reset filters
                  </button>
                ) : null
              }
            />
          ) : (
            <div className={gridClasses[viewMode]}>
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onDragOver={(e) => handleDragOver(e, product.id)}
                  onDrop={handleDrop}
                  className={`relative ${
                    dragId === product.id
                      ? 'z-overlay scale-95 opacity-50'
                      : dragOverId === product.id
                        ? 'z-nav'
                        : ''
                  }`}
                >
                  {reorderMode && (
                    <span
                      draggable
                      onDragStart={(e) => handleDragStart(e, product.id)}
                      onDragEnd={handleDragEnd}
                      title="Drag to reorder"
                      aria-label={`Reorder product number ${sortByOrder(products).findIndex(p => p.id === product.id) + 1}`}
                      className="absolute -left-2 -top-2 z-modal flex h-9 w-9 cursor-grab items-center justify-center gap-0.5 rounded-full text-xs font-bold active:cursor-grabbing"
                      style={{
                        background: 'var(--grad-gold)',
                        color: 'var(--maroon-900)',
                        boxShadow: 'var(--shadow-gold)',
                      }}
                    >
                      <GripVertical className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                      {sortByOrder(products).findIndex(p => p.id === product.id) + 1}
                    </span>
                  )}
                  <ProductCard product={product} viewMode={viewMode} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Products;