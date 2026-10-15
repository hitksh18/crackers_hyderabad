import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { useWishlist } from '../context/WishlistContext';
import ProductCard from '../components/ProductCard';
import EmptyState from '../components/ui/EmptyState';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import Seo from '../components/Seo';

/**
 * Favorites — every product the shopper hearted, in one place.
 *
 * Reuses the existing wishlist system end to end: ids from WishlistContext
 * (localStorage + Firestore users/{uid}.wishlist sync), catalogue rows from
 * the shared cached `products` collection (zero new reads when warm), and
 * the same ProductCard every other surface renders. Removing the last heart
 * lands on the empty state; nothing here owns data of its own.
 */
const Wishlist = () => {
  const { wishlist } = useWishlist();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <Seo title="Favorites | Crackers Hyderabad" noindex />
      <div className="mx-auto w-full py-6" style={{ maxWidth: 1440, paddingInline: 'clamp(16px, 4vw, 40px)' }}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1
              className="text-xl font-bold sm:text-2xl"
              style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
            >
              Favorites
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Products you hearted
            </p>
          </div>
          {!loading && products.length > 0 && (
            <p className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                {products.length}
              </span>{' '}
              {products.length === 1 ? 'item' : 'items'}
            </p>
          )}
        </div>

        <div className="mt-5">
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No favorites yet"
              description="Tap the heart on any product to keep it here for later."
              action={
                <Link to="/products" className="btn-primary">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Browse products
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
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
