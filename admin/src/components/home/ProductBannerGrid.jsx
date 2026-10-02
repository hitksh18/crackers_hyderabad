import { Link } from 'react-router-dom';

const FIELD = 'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 45%, #2A1512 75%, #1A1714 100%)';

/**
 * Product banners (settings/homepageConfig.productBanners).
 *
 * Each card links to its product via the existing /product/:slug route —
 * never a hand-typed URL. 16:9 cells in a compact responsive grid.
 */
export default function ProductBannerGrid({ banners }) {
  const list = (banners || []).filter((b) => b.enabled !== false);
  if (list.length === 0) return null;

  return (
    <section className="section-pad-sm" style={{ background: 'var(--surface-page)' }}>
      <div className="shell-wide">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {list.map((b) => (
            <Link
              key={b.id}
              to={`/product/${b.productSlug || b.productId}`}
              aria-label={b.productName || b.alt || 'Product offer'}
              className="group block overflow-hidden transition-transform duration-300 ease-out-expo hover:-translate-y-1"
              style={{ borderRadius: 'var(--r-xl)', background: FIELD, boxShadow: 'var(--shadow-md)' }}
            >
              {b.imageMobile && (
                <img
                  src={b.imageMobile}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className={`aspect-video w-full sm:hidden ${b.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
                />
              )}
              <img
                src={b.image}
                alt={b.alt || b.productName || ''}
                loading="lazy"
                className={`aspect-video w-full ${b.imageMobile ? 'hidden sm:block' : ''} ${b.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
