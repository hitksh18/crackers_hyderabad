import { Link } from 'react-router-dom';
import ScrollReveal from '../ui/ScrollReveal';
import SectionHeading from '../ui/SectionHeading';
import { promoBanners } from './homeData';

/**
 * Offers. Admin-uploaded promotional banner images ride in a rail above the
 * four fixed promo cards, so a long banner list can never widen the page.
 * Rail banners with `enabled: false` are hidden; a `link` makes one tappable.
 */
const PromoSection = ({ promotionalBanners }) => (
  <section className="section-pad bg-festive">
    <div className="shell-wide">
      <SectionHeading
        eyebrow="Offers"
        title="Festive Deals"
        subtitle="Limited-time offers you cannot miss"
      />

      {(promotionalBanners || []).filter((b) => b.enabled !== false).length > 0 && (
        <div className="rail mb-10">
          {(promotionalBanners || []).filter((b) => b.enabled !== false).map((banner, index) => {
            const img = (
              <img
                src={banner.imageUrl}
                alt={`Promotional banner ${(banner.order ?? index) + 1}`}
                loading="lazy"
                className="h-auto w-full object-cover"
              />
            );
            return (
              <div
                key={banner.id}
                className="w-[86vw] max-w-[420px] overflow-hidden sm:w-[420px]"
                style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-md)' }}
              >
                {banner.link ? <Link to={banner.link}>{img}</Link> : img}
              </div>
            );
          })}
        </div>
      )}

      <ScrollReveal stagger={0.06} className="promo-grid grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {promoBanners.map((banner) => (
          <ScrollReveal.Item key={banner.title}>
            <Link
              to={banner.link}
              className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden p-4 transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1.5 sm:min-h-[190px] sm:p-5"
              style={{
                background: banner.gradient,
                borderRadius: 'var(--r-xl)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span
                className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-[var(--r-pill)]"
                style={{ background: 'rgba(255,255,255,0.10)' }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-[var(--r-pill)]"
                style={{ background: 'rgba(255,255,255,0.10)' }}
                aria-hidden="true"
              />

              <span className="relative flex items-start justify-between gap-3">
                <span
                  className="label-caps rounded-[var(--r-pill)] px-3 py-1"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }}
                >
                  {banner.tag}
                </span>
                <banner.icon
                  className="h-8 w-8 shrink-0 transition-transform duration-300 ease-out-expo group-hover:scale-110"
                  strokeWidth={1.9}
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  aria-hidden="true"
                />
              </span>

              <span className="relative mt-4 block sm:mt-6">
                <span
                  className="block text-xl font-bold sm:text-2xl"
                  style={{ fontFamily: 'var(--font-display)', color: '#FFFFFF' }}
                >
                  {banner.title}
                </span>
                <span
                  className="mt-1 block text-[13px] font-medium sm:text-sm"
                  style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.85)' }}
                >
                  {banner.subtitle}
                </span>
              </span>
            </Link>
          </ScrollReveal.Item>
        ))}
      </ScrollReveal>
    </div>
  </section>
);

export default PromoSection;
