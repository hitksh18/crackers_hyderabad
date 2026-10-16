import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Heart, ShoppingBag } from 'lucide-react';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { useWishlist } from '../context/WishlistContext';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/ui/EmptyState';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import Seo from '../components/Seo';

const SORT_OPTIONS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name: A to Z' },
];

const priceOf = (p) => {
  const cands = [p?.discountPrice, p?.onlinePrice, p?.price];
  for (const v of cands) {
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) return v;
      continue;
    }
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && String(v).replace(/[^0-9.-]/g, '') !== '') return n;
  }
  return null;
};

/**
 * Favorites — every product the shopper hearted, in one place.
 *
 * Reuses the existing wishlist system end to end: ids from WishlistContext
 * (localStorage + Firestore users/{uid}.wishlist sync), catalogue rows from
 * the shared cached `products` collection (zero new reads when warm), and
 * the same ProductCard every other surface renders. Removing the last heart
 * lands on the empty state; nothing here owns data of its own.
 *
 * UI-only addition: display sort (a sorted copy for rendering).
 * No data, auth, routing or backend behavior changes.
 */
const Wishlist = () => {
  const { wishlist } = useWishlist();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('featured');

  /* Premium cream ground shared with Products (scoped .route-wishlist). */
  useEffect(() => {
    document.documentElement.classList.add('route-wishlist');
    return () => document.documentElement.classList.remove('route-wishlist');
  }, []);

  useEffect(() => {
    let cancelled = false;
    cachedGetDocs(collection(db, 'products'), 'products')
      .then((docs) => {
        if (cancelled) return;
        const byId = new Map((Array.isArray(docs) ? docs : []).map((p) => [p.id, p]));
        // Wishlist order, skipping ids that no longer resolve to a product.
        setProducts(wishlist.map((id) => byId.get(id)).filter(Boolean));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wishlist]);

  /* Display sort only — always a new array, source list never mutated. */
  const visibleProducts = useMemo(() => {
    const list = [...products];
    if (sortBy === 'price-asc') {
      return list.sort((a, b) => {
        const pa = priceOf(a);
        const pb = priceOf(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      });
    }
    if (sortBy === 'price-desc') {
      return list.sort((a, b) => {
        const pa = priceOf(a);
        const pb = priceOf(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      });
    }
    if (sortBy === 'name-asc') {
      return list.sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base', numeric: true }),
      );
    }
    return list;
  }, [products, sortBy]);

  const count = products.length;

  return (
    <div className="fav-page min-h-screen">
      <Seo title="Favorites | Crackers Hyderabad" noindex />
      <div className="fav-shell">
        {/* ============ PREMIUM HEADER ============ */}
        <header className="fav-header">
          <div className="fav-header-main">
            <p className="section-eyebrow">Your Collection</p>
            <h1 className="section-title fav-title">Favorites</h1>
            <p className="fav-subtitle">Your saved fireworks, ready whenever you are.</p>
          </div>
          {!loading && count > 0 && (
            <div className="fav-count-pill" aria-live="polite">
              <Heart className="fav-count-icon" aria-hidden="true" />
              <span>
                <strong className="tabular">{count}</strong> {count === 1 ? 'Saved Item' : 'Saved Items'}
              </span>
            </div>
          )}
        </header>

        {/* ============ COMPACT TOOLBAR ============ */}
        {!loading && count > 0 && (
          <div className="fav-toolbar">
            <p className="fav-toolbar-count">
              <Heart className="fav-toolbar-heart" aria-hidden="true" />
              <span>
                <strong className="tabular">{count}</strong> {count === 1 ? 'Saved Item' : 'Saved Items'}
              </span>
            </p>
            <div className="fav-toolbar-actions">
              <label className="sort-label" htmlFor="fav-sort">
                Sort
              </label>
              <span className="fav-sort-wrap">
                <ArrowUpDown className="fav-sort-icon" aria-hidden="true" />
                <select
                  id="fav-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-select fav-sort-select"
                  aria-label="Sort favorites"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        )}

        {/* ============ GRID / STATES ============ */}
        <div className="fav-body">
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : count === 0 ? (
            <div className="fav-empty">
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Save the fireworks you love and they'll appear here."
                action={
                  <Link to="/products" className="btn-primary">
                    <ShoppingBag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Explore Products
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="fav-grid">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wishlist;
