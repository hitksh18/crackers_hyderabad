import { Link } from 'react-router-dom';

const FIELD = 'linear-gradient(158deg, var(--maroon-900) 0%, var(--maroon-800) 45%, #2A1512 75%, #1A1714 100%)';

const fitClass = (banner) => (banner?.fit === 'contain' ? 'object-contain' : 'object-cover');

/**
 * Secondary banner strip below the hero (1–10 banners from
 * settings/homepageConfig.secondaryBanners).
 *
 * 1 banner fills the row, 2–3 split it, 4+ flow into a compact responsive
 * grid so the strip never becomes a page-height block. Every cell is 16:9.
 */
export default function SecondaryBannerGrid({ banners }) {
  const list = (banners || []).filter((b) => b.enabled !== false);
  if (list.length === 0) return null;

  const cols =
    list.length === 1
      ? 'grid-cols-1'
      : list.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : list.length === 3
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
      <div className="shell-wide">
        <div className={`grid gap-3 sm:gap-4 ${cols}`}>
          {list.map((b) => {
            const frame = (
              <span
                className="block h-full w-full overflow-hidden"
                style={{ borderRadius: 'var(--r-xl)', background: FIELD, boxShadow: 'var(--shadow-md)' }}
              >
                {b.imageMobile && (
                  <img
                    src={b.imageMobile}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className={`aspect-video w-full sm:hidden ${fitClass(b)}`}
                  />
                )}
                <img
                  src={b.imageDesktop || b.image}
                  alt={b.alt || ''}
                  loading="lazy"
                  className={`aspect-video w-full ${b.imageMobile ? 'hidden sm:block' : ''} ${fitClass(b)}`}
                />
              </span>
            );
            return b.ctaLink ? (
              <Link key={b.id} to={b.ctaLink} aria-label={b.alt || 'Promotional banner'}>
                {frame}
              </Link>
            ) : (
              <div key={b.id}>{frame}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
