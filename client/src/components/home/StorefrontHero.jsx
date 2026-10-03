import { BadgeCheck, Truck, ShieldCheck, Headphones } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import FireworksHero from './FireworksHero';

/* Navbar is dark glass on homepage; hero must feel like its continuation — not a card on a light page */
const HERO_SHELL_BG = '#070505';

const HERO_TRUST_ITEMS = [
  { icon: BadgeCheck, title: '100% Genuine', sub: 'Products' },
  { icon: Truck, title: 'Free Shipping', sub: 'Above ₹2,500' },
  { icon: ShieldCheck, title: 'Safe & Secure', sub: 'Payments' },
  { icon: Headphones, title: 'Dedicated', sub: 'Support' },
];

/* Slim trust strip directly beneath the hero — quiet text row with hairline
   dividers, no cards or boxes. */
const HeroTrustStrip = () => (
  <div
    className="relative"
    style={{ background: '#0B0908', borderTop: '1px solid rgba(178,140,70,0.22)' }}
  >
    <div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 md:grid-cols-4 md:px-10 lg:px-12 xl:px-14">
      {HERO_TRUST_ITEMS.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.title}
            className={`flex items-center gap-2.5 py-4 md:justify-center md:py-5 ${
              i > 0 ? 'md:border-l md:border-[rgba(178,140,70,0.16)]' : ''
            } ${i % 2 === 1 ? 'justify-end md:justify-center' : ''}`}
          >
            <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: '#B28C46' }} strokeWidth={1.9} aria-hidden="true" />
            <span className="leading-tight">
              <span className="block text-xs font-semibold tracking-wide" style={{ color: '#F8F2E7', fontFamily: 'var(--font-body)' }}>
                {item.title}
              </span>
              <span className="block text-[11px]" style={{ color: 'rgba(248,242,231,0.52)', fontFamily: 'var(--font-body)' }}>
                {item.sub}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

const HeroShellSkeleton = () => (
  <div
    className="relative w-full overflow-hidden"
    style={{ background: '#0B0908', height: 'clamp(640px, 94svh, 920px)' }}
  >
    <div className="mx-auto flex h-full max-w-[1400px] flex-col items-center justify-center gap-4 px-6 py-8 text-center sm:px-8">
      <Skeleton className="h-3 w-36" rounded="999px" />
      <Skeleton className="h-14 w-72" rounded="8px" />
      <Skeleton className="h-4 w-80" rounded="8px" />
      <div className="mt-2 flex gap-3">
        <Skeleton className="h-12 w-36" rounded="8px" />
        <Skeleton className="h-12 w-44" rounded="8px" />
      </div>
    </div>
  </div>
);

/**
 * Storefront hero — the cinematic DOM/CSS/JS fireworks scene.
 * Accepts the same props (banners, cards, durationSec, loading, mode) so
 * Canvas/Home.jsx require no changes. Banner/carousel props are accepted
 * for API compat; the scene is static and needs no campaign data.
 */
const StorefrontHero = ({ banners, cards, durationSec, loading, mode = 'auto' }) => {
  void banners;
  void cards;
  void durationSec;

  if (loading) {
    return (
      <section className="hero-stage relative isolate overflow-hidden" style={{ background: HERO_SHELL_BG }}>
        <HeroShellSkeleton />
      </section>
    );
  }

  return (
    <section className="hero-stage relative isolate w-full max-w-full overflow-hidden" style={{ background: HERO_SHELL_BG, maxWidth: '100%', overflow: 'clip' }}>
      {/* Top soft blend — navbar dark surface flows into hero artwork */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8" style={{ background: 'linear-gradient(180deg, rgba(7,5,5,0.45) 0%, transparent 100%)' }} />
      {/* Hero is visually part of navbar — no hard gap, no bright separator */}
      <div className={mode === 'auto' ? 'relative w-full max-w-full' : 'relative mx-auto w-full max-w-[420px]'}>
        <FireworksHero />
      </div>
      {/* Slim trust strip — the four hero assurances live here now, not in the hero */}
      <HeroTrustStrip />
    </section>
  );
};

export default StorefrontHero;
