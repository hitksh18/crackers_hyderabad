import { Link } from 'react-router-dom';
import { ArrowRight, PackageSearch } from 'lucide-react';
import ScrollReveal from '../ui/ScrollReveal';
import { CornerFiligree } from '../ui/Ornaments';
import { wholesalePillars } from './homeData';

const WHOLESALE_FIELD =
  'linear-gradient(148deg, var(--maroon-900) 0%, var(--maroon-700) 46%, #2A1512 100%)';

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
    className="section-pad relative overflow-hidden"
    style={{ background: WHOLESALE_FIELD, scrollMarginTop: '72px' }}
  >
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        background:
          'radial-gradient(38% 40% at 88% 8%, rgba(210,166,79,0.20) 0%, transparent 100%),' +
          'radial-gradient(34% 36% at 4% 92%, rgba(195,58,20,0.24) 0%, transparent 100%)',
      }}
    />

    <div className="shell-wide relative">
      <div className="grid gap-7 sm:gap-10 lg:grid-cols-12 lg:gap-12">
        {/* ---- Proposition ---- */}
        <div className="relative lg:col-span-5">
          <CornerFiligree position="top-right" className="opacity-80" />

          <span className="section-eyebrow relative" style={{ color: 'var(--gold-400)' }}>
            {copy?.eyebrow || 'Wholesale'}
          </span>

          <h2 className="section-title relative mt-3" style={{ color: 'var(--white-soft)' }}>
            {copy?.title || 'Built for Wholesale Orders'}
          </h2>

          <p
            className="mt-4 max-w-prose text-pretty"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)', lineHeight: 1.7 }}
          >
            {copy?.description || 'Retailers, event teams and large family celebrations order differently. The catalogue, the cart and the tracking are all built to carry a bigger list without turning into a phone call.'}
          </p>

          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link to={copy?.ctaUrl || '/products'} className="btn-primary px-7 py-3.5 text-sm">
              {copy?.ctaText || 'Shop Crackers'}
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link
              to="/track-order"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border-[1.5px] border-[rgba(210,166,79,0.5)] bg-[rgba(237,231,223,0.06)] px-7 py-3.5 text-sm font-semibold text-accent-400 transition-[transform,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-saffron-400 hover:text-saffron-400"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <PackageSearch className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Track an Order
            </Link>
          </div>
        </div>

        {/* ---- Pillars ---- */}
        <ScrollReveal stagger={0.05} className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
          {wholesalePillars.map((pillar, index) => (
            <ScrollReveal.Item
              key={pillar.title}
              className={index === wholesalePillars.length - 1 ? 'sm:col-span-2' : ''}
            >
              <div className="flex h-full items-start gap-3.5 rounded-[var(--r-lg)] border border-[rgba(237,231,223,0.14)] bg-[rgba(237,231,223,0.06)] p-4 transition-[transform,border-color] duration-300 ease-out-expo hover:-translate-y-1 hover:border-accent-400">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center"
                  style={{
                    borderRadius: 'var(--r-md)',
                    background: 'rgba(210,166,79,0.16)',
                    border: '1px solid rgba(210,166,79,0.34)',
                  }}
                  aria-hidden="true"
                >
                  <pillar.icon className="h-5 w-5" strokeWidth={2.1} style={{ color: 'var(--gold-400)' }} />
                </span>

                <div className="min-w-0">
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className="tabular text-[0.6875rem] font-bold tracking-[0.14em]"
                      style={{ color: 'rgba(210,166,79,0.75)' }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="card-title" style={{ color: 'var(--white-soft)' }}>
                      {pillar.title}
                    </h3>
                  </div>
                  <p
                    className="mt-1.5 text-sm"
                    style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)', lineHeight: 1.6 }}
                  >
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
