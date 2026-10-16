import { BadgeCheck, Truck, ShieldCheck, Headphones } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Skeleton } from '../ui/Skeleton';
import FireworksHero from './FireworksHero';

/* Navbar is deep maroon; hero is a warm biscuit/parchment stage below the
   dark brand anchor — like a premium printed invitation. */
const HERO_SHELL_BG = '#F3E3C8';

const HERO_TRUST_ITEMS = [
  { icon: BadgeCheck, title: '100% Genuine', sub: 'Products' },
  { icon: Truck, title: 'Free Shipping', sub: 'Above ₹2,500' },
  { icon: ShieldCheck, title: 'Safe & Secure', sub: 'Payments' },
  { icon: Headphones, title: 'Dedicated', sub: 'Support' },
];

/* Premium brand ribbon directly beneath the hero — deep wine/burgundy with
   subtle gold festive line-art, tying the navbar identity through the
   biscuit hero into the ivory content below. Compact 4-column layout is
   unchanged (2×2 on phones); only the visual treatment is elevated. */
const TRUST_PATTERN =
  "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120' fill='none' stroke='%23C9973E' opacity='0.12'><path d='M60 18 L64 56 L102 60 L64 64 L60 102 L56 64 L18 60 L56 56 Z' stroke-width='1'/><circle cx='60' cy='60' r='3' stroke-width='1'/><path d='M0 60 H18 M102 60 H120' stroke-width='1'/><circle cx='14' cy='14' r='1.5' fill='%23C9973E' stroke='none'/><circle cx='106' cy='106' r='1.5' fill='%23C9973E' stroke='none'/></svg>\")";

const HeroTrustStrip = () => {
  const stripRef = useRef(null);

  /* Publish the measured strip height so the hero's viewport calc can
     subtract the real value (mirrors Navbar --nav-h / TopBanner
     --top-banner-h). Removed on unmount; 84px CSS fallback covers first
     paint and non-home mounts. */
  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const root = document.documentElement;
    const publishHeight = () => {
      root.style.setProperty('--trust-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.style.removeProperty('--trust-h');
    };
  }, []);

  return (
  <div
    ref={stripRef}
    className="relative overflow-hidden"
    style={{
      background:
        'radial-gradient(60% 120% at 50% 0%, rgba(201, 151, 62, 0.10) 0%, transparent 60%), linear-gradient(180deg, #651317 0%, #5A0F12 55%, #4F0C0F 100%)',
      borderTop: '1px solid rgba(201, 151, 62, 0.35)',
      borderBottom: '1px solid rgba(201, 151, 62, 0.22)',
    }}
  >
    {/* Low-contrast festive tile: small gold firework → divider → dots. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: TRUST_PATTERN, backgroundSize: '120px 120px', backgroundRepeat: 'repeat' }}
    />
    <div className="hero-trust-grid relative mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 md:grid-cols-4 md:px-10 lg:px-12 xl:px-14">
      {HERO_TRUST_ITEMS.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.title}
            className={`hero-trust-item flex items-center gap-2.5 py-4 md:justify-center md:py-5 ${
              i > 0 ? 'md:border-l md:border-[rgba(201,151,62,0.28)]' : ''
            } ${i % 2 === 1 ? 'justify-end md:justify-center' : ''}`}
          >
            <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: '#D5A646' }} strokeWidth={1.9} aria-hidden="true" />
            <span className="leading-tight">
              <span className="hero-trust-title block text-xs font-semibold tracking-wide" style={{ color: '#F8EBD4', fontFamily: 'var(--font-body)' }}>
                {item.title}
              </span>
              <span className="hero-trust-sub block text-[11px]" style={{ color: '#D9BFA3', fontFamily: 'var(--font-body)' }}>
                {item.sub}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  </div>
  );
};

const HeroShellSkeleton = () => (
  <div
    className="relative w-full overflow-hidden"
    style={{ background: '#F3E3C8', height: 'clamp(640px, 94svh, 920px)' }}
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
 * Accepts the same props (banners, cards, durationSec, loading, mode, copy) so
 * Canvas/Home.jsx require no changes. Banner/carousel props are accepted
 * for API compat; the scene is static and needs no campaign data.
 * heroProducts/showcaseLoading hydrate the right-column showcase only — the
 * hero text never waits for them.
 */
const StorefrontHero = ({ banners, cards, durationSec, loading, mode = 'auto', copy, heroProducts, showcaseLoading, heroArtworkAnimation }) => {
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
      {/* Soft maroon-to-ivory blend — the dark navbar flows into the light hero */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8" style={{ background: 'linear-gradient(180deg, rgba(58,11,12,0.12) 0%, transparent 100%)' }} />
      {/* Hero is visually part of navbar — no hard gap, no bright separator */}
      <div className={mode === 'auto' ? 'relative w-full max-w-full' : 'relative mx-auto w-full max-w-[420px]'}>
        <FireworksHero copy={copy} products={heroProducts} showcaseLoading={showcaseLoading} artworkAnimation={heroArtworkAnimation} />
      </div>
      {/* Slim trust strip — the four hero assurances live here now, not in the hero */}
      <HeroTrustStrip />
    </section>
  );
};

export default StorefrontHero;
