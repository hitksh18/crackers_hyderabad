import { Link } from 'react-router-dom';
import { ArrowRight, Gift } from 'lucide-react';
import ScrollReveal from '../ui/ScrollReveal';
import SectionHeading from '../ui/SectionHeading';
import { DEAL_ICON_OPTIONS } from '../../lib/dealIcons';

const DEFAULT_GRADIENTS = [
  'linear-gradient(128deg, #7A2410 0%, #9E2C10 100%)',
  'linear-gradient(128deg, #C33A14 0%, #DF4C21 100%)',
  'linear-gradient(128deg, #7C5622 0%, #BE8C36 100%)',
  'linear-gradient(128deg, #5C1A24 0%, #8F2433 100%)',
];

const dealGradient = (deal, index) => {
  if (deal.gradientFrom && deal.gradientTo) {
    return `linear-gradient(128deg, ${deal.gradientFrom} 0%, ${deal.gradientTo} 100%)`;
  }
  return DEFAULT_GRADIENTS[index % DEFAULT_GRADIENTS.length];
};

const DealsSection = ({ deals, heading }) => {
  if (!deals || deals.length === 0) return null;

  return (
    <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
      <div className="shell-wide">
        <SectionHeading
          eyebrow={heading?.eyebrow || 'Festive Offers'}
          title={heading?.title || 'Festive Deals'}
          subtitle={heading?.subtitle || 'Limited-time offers for every celebration'}
        />

        <ScrollReveal
          stagger={0.05}
          className="deals-grid grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:grid-cols-4"
        >
          {deals.map((deal, index) => {
            const Icon = DEAL_ICON_OPTIONS[deal.icon] || Gift;
            return (
              <ScrollReveal.Item key={deal.id}>
                <Link
                  to={deal.ctaLink || '/products'}
                  className="group relative flex h-full flex-col overflow-hidden p-4 transition-[transform,box-shadow,border-color] duration-300 ease-out-expo hover:-translate-y-1 sm:p-5"
                  style={{
                    borderRadius: 'var(--r-xl)',
                    background: dealGradient(deal, index),
                    border: '1px solid rgba(210,166,79,0.35)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(80% 60% at 15% 0%, rgba(255,255,255,0.14), transparent 62%), radial-gradient(70% 70% at 100% 100%, rgba(0,0,0,0.28), transparent 70%)',
                    }}
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <span
                      className="inline-flex min-h-[30px] items-center rounded-[var(--r-pill)] px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em]"
                      style={{
                        background: 'rgba(210,166,79,0.22)',
                        border: '1px solid rgba(210,166,79,0.55)',
                        color: 'var(--gold-200)',
                      }}
                    >
                      {deal.offerText || 'Festive Offer'}
                    </span>

                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-out-expo group-hover:scale-110"
                      style={{
                        background: 'rgba(255,253,248,0.12)',
                        border: '1px solid rgba(255,253,248,0.28)',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} style={{ color: '#FFFFFF' }} />
                    </span>
                  </div>

                  <div className="relative mt-4 flex flex-1 flex-col">
                    <h3
                      className="card-title"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--white-soft)' }}
                    >
                      {deal.title}
                    </h3>
                    <p
                      className="mt-1.5 flex-1 text-xs leading-relaxed"
                      style={{ fontFamily: 'var(--font-body)', color: 'rgba(237,231,223,0.86)' }}
                    >
                      {deal.description}
                    </p>

                    <span
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-transform duration-300 ease-out-expo group-hover:translate-x-1"
                      style={{ fontFamily: 'var(--font-body)', color: 'var(--gold-200)' }}
                    >
                      {deal.ctaText || 'Shop Now'}
                      <ArrowRight className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </ScrollReveal.Item>
            );
          })}
        </ScrollReveal>
      </div>
    </section>
  );
};

export default DealsSection;