import { Link } from 'react-router-dom';
import { ArrowRight, PackageSearch } from 'lucide-react';
import ScrollReveal from '../ui/ScrollReveal';
import { CornerFiligree } from '../ui/Ornaments';
import { wholesalePillars } from './homeData';

/**
 * Wholesale positioning band. Deliberately the second dark field on the page so
 * it reads as a distinct proposition rather than another product shelf.
 *
 * Copy is theme-only — no volumes, lead times, licences or guarantees.
 * `copy` ({ eyebrow, title, description, ctaText, ctaUrl }) overrides the
 * default editorial copy — used by the homepage canvas.
 */
const WholesaleSection = ({ copy }) => (
  <section
    id="wholesale"
    className="section-pad home-sec-wholesale relative overflow-hidden"
    style={{ scrollMarginTop: '72px' }}
  >
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        background:
          'radial-gradient(38% 40% at 88% 8%, rgba(214,166,75,0.14) 0%, transparent 100%),' +
          'radial-gradient(34% 36% at 4% 92%, rgba(195,58,20,0.18) 0%, transparent 100%)',
      }}
    />

    <div className="shell-wide relative">
      <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-12 lg:gap-10">
        {/* ---- Proposition ---- */}
        <div className="ws-intro relative lg:col-span-5">
          <CornerFiligree position="top-right" className="opacity-80" />

          <span className="section-eyebrow relative" style={{ color: '#D6A64B' }}>
            {copy?.eyebrow || 'Wholesale'}
          </span>

          <h2 className="section-title relative mt-3" style={{ color: '#FFF7E8' }}>
            {copy?.title || 'Built for Wholesale Orders'}
          </h2>

          <p
            className="mt-4 max-w-prose text-pretty"
            style={{ fontFamily: 'var(--font-body)', color: '#E9DCC8', lineHeight: 1.7 }}
          >
            {copy?.description || 'Retailers, event teams and large family celebrations order differently. The catalogue, the cart and the tracking are all built to carry a bigger list without turning into a phone call.'}
          </p>

          <div className="ws-cta mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link to={copy?.ctaUrl || '/products'} className="btn-primary px-7 py-3.5 text-sm">
              {copy?.ctaText || 'Shop Crackers'}
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link
              to="/track-order"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border-[1.5px] border-[rgba(214,166,75,0.5)] bg-transparent px-7 py-3.5 text-sm font-semibold text-accent-400 transition-[transform,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-saffron-400 hover:text-saffron-400"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <PackageSearch className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Track an Order
            </Link>
          </div>
        </div>

        {/* ---- Compact feature grid: 2 columns, last card full width ---- */}
        <ScrollReveal stagger={0.05} className="grid content-center gap-2.5 sm:grid-cols-2 lg:col-span-7">
          {wholesalePillars.map((pillar, index) => (
            <ScrollReveal.Item
              key={pillar.title}
              className={index === wholesalePillars.length - 1 ? 'sm:col-span-2' : ''}
            >
              <div className="ws-card flex h-full items-start gap-3 p-3">
                <span
                  className="ws-ico flex shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <pillar.icon className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="ws-num tabular shrink-0"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="ws-title min-w-0 flex-1">
                      {pillar.title}
                    </h3>
                  </div>
                  <p className="ws-text mt-1">
                    {pillar.text}
                  </p>
                </div>
              </div>
            </ScrollReveal.Item>
          ))}
        </ScrollReveal>
      </div>
    </div>
  </section>
);

export default WholesaleSection;
