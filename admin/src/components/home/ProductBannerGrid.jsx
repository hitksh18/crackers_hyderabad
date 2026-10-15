import { Link } from 'react-router-dom';
import { normalizeImageUrl } from '../../lib/normalizeImageUrl';

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
          {list.map((b) => {
            const src = normalizeImageUrl(b.image);
            const mobileSrc = normalizeImageUrl(b.imageMobile);
            return (
              <Link
                key={b.id}
                to={`/product/${b.productSlug || b.productId}`}
                aria-label={b.productName || b.alt || 'Product offer'}
                className="group block overflow-hidden transition-transform duration-300 ease-out-expo hover:-translate-y-1"
                style={{ borderRadius: 'var(--r-xl)', background: FIELD, boxShadow: 'var(--shadow-md)', aspectRatio: '16 / 9' }}
              >
                {/* <picture> downloads ONE file: mobile below sm, desktop at sm+.
                    The old two-<img> + hidden pattern fetched both. */}
                <picture>
                  {mobileSrc && <source media="(max-width: 639px)" srcSet={mobileSrc} />}
                  {src && (
                    <img
                      src={src}
                      alt={b.alt || b.productName || ''}
                      loading="lazy"
                      decoding="async"
                      width={640}
                      height={360}
                      className={`aspect-video w-full ${b.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
                    />
                  )}
                </picture>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
