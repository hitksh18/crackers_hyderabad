import { Fragment, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

import ScrollReveal from '../components/ui/ScrollReveal';
import { Skeleton } from '../components/ui/Skeleton';

import StorefrontHero from '../components/home/StorefrontHero';
// Everything below the hero is below the fold: each section splits into its
// own chunk so the first viewport paints without downloading or executing
// below-fold code. The hero itself stays synchronous above.
const CategoryShowcase = lazy(() => import('../components/home/CategoryShowcase'));
const DealsSection = lazy(() => import('../components/home/DealsSection'));
const FeaturedSection = lazy(() => import('../components/home/FeaturedSection'));
const HomeProductRail = lazy(() => import('../components/home/HomeProductRail'));
const WholesaleSection = lazy(() => import('../components/home/WholesaleSection'));
const PromoSection = lazy(() => import('../components/home/PromoSection'));
const SecondaryBannerGrid = lazy(() => import('../components/home/SecondaryBannerGrid'));
const ProductBannerGrid = lazy(() => import('../components/home/ProductBannerGrid'));
const TrustSection = lazy(() => import('../components/home/TrustSection'));
const NewsletterBlock = lazy(() => import('../components/home/NewsletterBlock'));
const TrackOrderBlock = lazy(() => import('../components/home/TrackOrderBlock'));
const Footer = lazy(() => import('../components/Footer'));
import { categoryDefs } from '../components/home/homeData';

import { useHomepageSettings } from '../hooks/useHomepageSettings';
import { readHomepageConfig, DEFAULT_HERO_BANNERS, DEFAULT_PROMO_CARDS } from '../lib/homepage';
import { readBuilderConfig } from '../lib/homepageBuilder';
import { readCategoryShowcaseConfig, applyShowcaseOrder } from '../lib/categoryShowcase';
import { readSiteSettings, firstAnnouncementText } from '../lib/siteSettings';
import { resolveTrustCards } from '../lib/trustIcons';
import Seo from '../components/Seo';
import toast from '../utils/toast';

const DEFAULT_CONTENT = {
  categories: { eyebrow: 'Explore', title: 'Shop by Categories', subtitle: 'Handpicked ranges for every celebration' },
  deals: { eyebrow: 'Festive Offers', title: 'Festive Deals', subtitle: 'Limited-time offers for every celebration' },
  featured: { eyebrow: 'Handpicked', title: 'Featured Products', subtitle: 'Our best-selling fireworks handpicked for you' },
  bestSellers: { eyebrow: 'Top Rated', title: 'Best Sellers', subtitle: 'The most-loved picks from real orders' },
  trust: { eyebrow: 'Why Us', title: 'Why Choose Crackers Hyderabad', subtitle: 'The city’s most trusted fireworks destination' },
};

const DEFAULT_STRIP = {
  banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
  banner1Enabled: true,
};

const Home = () => {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promotionalBanners, setPromotionalBanners] = useState([]);
  const [trackOrderId, setTrackOrderId] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const { settings: homepageSettings, loading: settingsLoading } = useHomepageSettings();
  const categoriesRef = useRef(null);

  const [homepageConfig, setHomepageConfig] = useState(null);
  const [builderConfig, setBuilderConfig] = useState(null);
  const [siteSettings, setSiteSettings] = useState(null);
  const [strip, setStrip] = useState(DEFAULT_STRIP);
  const [festiveDeals, setFestiveDeals] = useState([]);
  const [categoryShowcaseConfig, setCategoryShowcaseConfig] = useState(null);

  /* Homepage-only scrollbar treatment: hide the visible page scrollbar while
     keeping normal document scrolling (wheel, trackpad, touch, keyboard all
     operate on the document scroller, which stays overflow-y: auto). Scoped
     via a class on <html> — removed on unmount — so admin pages, modals,
     dropdowns and every internal scroll container are untouched. */
  useEffect(() => {
    document.documentElement.classList.add('route-home');
    return () => document.documentElement.classList.remove('route-home');
  }, []);

  /* Config hydration — fast single-document reads that drive hero copy,
     builder order, banners and trust cards. The hero itself renders fallback
     content on the very first paint and upgrades in place when this lands;
     it never waits for any of it. */
  useEffect(() => {
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const [catSnap, builder, site, homepage, stripSnap] = await Promise.all([
          // Canonical category order (settings/categoryShowcase); null falls
          // back to the base categoryDefs order below.
          readCategoryShowcaseConfig(),
          readBuilderConfig().catch(() => null),
          readSiteSettings().catch(() => null),
          readHomepageConfig().catch(() => null),
          (async () => {
            try {
              const { getDoc, doc } = await import('firebase/firestore');
              const d = await getDoc(doc(db, 'bannerSettings', 'main'));
              return d.exists() ? d.data() : null;
            } catch { return null; }
          })(),
        ]);
        if (cancelled) return;
        if (catSnap) setCategoryShowcaseConfig(catSnap);
        if (builder) setBuilderConfig(builder);
        if (site) setSiteSettings(site);
        if (homepage) {
          setHomepageConfig(homepage);
          /* Trace the storefront read side: what the Hero will render. */
          if (import.meta.env.DEV) {
            console.log('[home] homepageConfig loaded:', {
              bannerCount: (homepage.heroBanners || []).length,
              banners: (homepage.heroBanners || []).map((b, i) => ({
                pos: i + 1,
                id: b.id,
                enabled: b.enabled !== false,
                image: b.imageDesktop || b.image || null,
              })),
            });
          }
        }
        if (stripSnap) setStrip(prev => ({ ...prev, ...stripSnap }));
      } catch (e) {
        console.error(e);
      }
    };
    fetchConfig();
    return () => { cancelled = true; };
  }, []);

  /* Catalogue hydration — heavy collection reads (full product list, promos,
     deals). These progressively enhance the below-fold rails, counts and deal
     grids; the hero never waits for them. */
  useEffect(() => {
    let cancelled = false;
    const fetchCatalogue = async () => {
      try {
        const [productsSnap, promoSnap, dealsSnap] = await Promise.all([
          getDocs(collection(db, 'products')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'promotionalBanners')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'festiveDeals')).catch(() => ({ docs: [] })),
        ]);
        if (cancelled) return;
        setAllProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPromotionalBanners(promoSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.enabled !== false).sort((a, b) => (b.order || 0) - (a.order || 0)));
        setFestiveDeals(dealsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0)));
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCatalogue();
    return () => { cancelled = true; };
  }, []);

  const byAdminOrder = (a, b) =>
    (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
    (b.salesCount || 0) - (a.salesCount || 0) ||
    (a.name || '').localeCompare(b.name || '');

  const featuredProducts = allProducts
    .filter(p => p.isFeatured)
    .concat(allProducts.filter(p => !p.isFeatured).sort(byAdminOrder));

  const bestSellers = [...allProducts]
    .sort(
      (a, b) =>
        (b.salesCount || 0) - (a.salesCount || 0) ||
        (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
        (a.name || '').localeCompare(b.name || '')
    );

  /* Canvas-editable copy. Every field falls back to the long-standing
     hardcoded editorial, so a homepage saved before the canvas still
     renders exactly as before. maxItems 0/undefined means "show all". */
  const sectionText = homepageConfig?.sectionText || {};
  const maxOrAll = (arr, n) => (n && n > 0 ? arr.slice(0, n) : arr);
  const homepageContent = {
    categories: { ...DEFAULT_CONTENT.categories, ...(sectionText.categories || {}) },
    deals: { ...DEFAULT_CONTENT.deals, ...(sectionText.deals || {}) },
    featured: { ...DEFAULT_CONTENT.featured, ...(sectionText.featured || {}) },
    bestSellers: { ...DEFAULT_CONTENT.bestSellers, ...(sectionText.bestSellers || {}) },
    trust: { ...DEFAULT_CONTENT.trust, ...(sectionText.trust || {}) },
  };
  const newsletterCopy = sectionText.newsletter || undefined;
  const wholesaleCopy = sectionText.wholesale || undefined;
  const resolvedTrust = resolveTrustCards(homepageConfig?.trustCards);
  const trustCards = resolvedTrust ? resolvedTrust.filter(c => c.enabled !== false) : undefined;
  const featuredShown = maxOrAll(featuredProducts, sectionText.featured?.maxItems ?? 12);
  const bestShown = maxOrAll(bestSellers, sectionText.bestSellers?.maxItems ?? 10);
  const dealsShown = maxOrAll(festiveDeals, sectionText.deals?.maxItems);
  // announcement/stable bars below hero removed from public display per spec — keep config/fetch intact
  void firstAnnouncementText; void siteSettings; void strip;

  const countInCategory = (matchNames) => {
    return allProducts.filter(p => {
      if (Array.isArray(p.categories)) {
        return p.categories.some(cat => matchNames.some(m => m.toLowerCase() === String(cat).toLowerCase()));
      }
      return matchNames.some(m => m.toLowerCase() === String(p.category || '').toLowerCase());
    }).length;
  };

  // Canonical ordering shared with /products: base categoryDefs filtered
  // by the showcase `hidden` slugs and sorted by its `order` slugs.
  const visibleCategories = applyShowcaseOrder(categoryDefs, categoryShowcaseConfig);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletterEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    setNewsletterEmail('');
    toast.success('Subscribed! You will get all festival offers first.');
  };

  const handleTrackOrder = (e) => {
    e.preventDefault();
    if (trackOrderId.trim()) {
      navigate('/track-order', { state: { code: trackOrderId.trim() } });
    }
  };

  /* Hero renders on the very first paint with fallback content and upgrades
     in place when the homepage config arrives. StorefrontHero is a static
     canvas scene (banner/card props are API-compat only), so this never
     flashes or shifts — and it never shows a skeleton while data loads. */
  const heroBanners = (homepageConfig?.heroBanners || []).length > 0
    ? homepageConfig.heroBanners
    : DEFAULT_HERO_BANNERS;
  const promoCards = (homepageConfig?.promoCards || []).length > 0
    ? homepageConfig.promoCards
    : DEFAULT_PROMO_CARDS;
  const hero = (
    <StorefrontHero
      banners={heroBanners}
      cards={promoCards}
      durationSec={homepageConfig?.carouselDurationSec ?? 5}
      loading={false}
    />
  );

  // Builder-driven section order with fallback
  const sections = (builderConfig?.sections || []).filter(s => s.enabled !== false).sort((a,b) => (a.order??999)-(b.order??999));
  const hasBuilder = sections.length > 0;

  const renderSection = (section) => {
    switch (section.type) {
      case 'hero':
        // The hero always renders synchronously above the Suspense boundary
        // (see return below), so the builder order never duplicates it and a
        // suspended below-fold chunk can never hide it.
        return <Fragment key={section.id} />;
      case 'promoCards':
        return null; // hero already includes promoCards
      case 'announcement':
        // Announcement bar below hero removed from public homepage per design spec.
        // Top marquee (TopBanner) remains above navbar. Canvas data stays intact.
        return null;
      case 'stableMessage':
        // Stable message below hero removed from public homepage per design spec.
        // Canvas config (settings/siteSettings.stableMessage) remains writable.
        return null;
      case 'categories':
        return <CategoryShowcase key={section.id} sectionRef={categoriesRef} countInCategory={countInCategory} categories={visibleCategories} heading={homepageContent.categories} />;
      case 'featured':
        return <FeaturedSection key={section.id} products={featuredShown} heading={homepageContent.featured} loading={loading} />;
      case 'bestSellers':
        return (
          <section key={section.id} className="section-pad" style={{ background: 'var(--surface-page)' }}>
            <div className="shell-wide">
              <HomeProductRail eyebrow={homepageContent.bestSellers.eyebrow} title={homepageContent.bestSellers.title} subtitle={homepageContent.bestSellers.subtitle} products={bestShown} loading={loading} railLabel="best sellers" />
            </div>
          </section>
        );
      case 'promoBanners':
        return <PromoSection key={section.id} promotionalBanners={promotionalBanners} />;
      case 'secondaryBanners':
        return <SecondaryBannerGrid key={section.id} banners={homepageConfig?.secondaryBanners || []} />;
      case 'productBanners':
        return <ProductBannerGrid key={section.id} banners={homepageConfig?.productBanners || []} />;
      case 'festiveDeals':
        return dealsShown.length > 0 ? <DealsSection key={section.id} deals={dealsShown} heading={homepageContent.deals} /> : null;
      case 'bannerImage':
        return settingsLoading ? (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Loading homepage banner</span>
              <Skeleton className="h-56 w-full sm:h-72" rounded="var(--r-xl)" />
            </div>
          </section>
        ) : homepageSettings?.bannerImageUrl ? (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide">
              <ScrollReveal distance={20} className="overflow-hidden" style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}>
                <img src={homepageSettings.bannerImageUrl} alt={homepageSettings.bannerImageAlt || 'Crackers Hyderabad Banner'} loading="lazy" className="max-h-[400px] w-full object-cover sm:max-h-[500px]" />
              </ScrollReveal>
            </div>
          </section>
        ) : null;
      case 'trust':
        return <TrustSection key={section.id} heading={homepageContent.trust} cards={trustCards} />;
      case 'newsletter':
        return (
          <section key={section.id} className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
            <div className="shell-wide">
              <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
                <NewsletterBlock email={newsletterEmail} onEmailChange={(e) => setNewsletterEmail(e.target.value)} onSubmit={handleSubscribe} copy={newsletterCopy} />
                <TrackOrderBlock orderId={trackOrderId} onOrderIdChange={(e) => setTrackOrderId(e.target.value)} onSubmit={handleTrackOrder} />
              </div>
            </div>
          </section>
        );
      case 'wholesale':
        return <WholesaleSection key={section.id} copy={wholesaleCopy} />;
      case 'banner': {
        // Generic banner section
        const cfg = section.config || {};
        if (!cfg.banners || cfg.banners.length === 0) return null;
        return (
          <section key={section.id} className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide">
              <div className="grid gap-4">
                {cfg.banners.filter(b => b.enabled !== false).map(b => (
                  <a key={b.id} href={b.ctaLink || '/products'} className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--hairline)' }}>
                    <img src={b.imageDesktop || b.image} alt={b.alt || ''} className="w-full object-cover" style={{ maxHeight: '400px' }} />
                  </a>
                ))}
              </div>
            </div>
          </section>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <Seo title="Crackers Hyderabad — Premium Fireworks & Wholesale Crackers" description="Premium fireworks and wholesale crackers in Hyderabad. Gift boxes, sparklers, rockets, flower pots and festival collections at wholesale pricing, with order tracking and doorstep delivery." canonical="/" />

      {/* First viewport: paints synchronously on first render — never inside
          the Suspense boundary below, so lazy below-fold chunks can never
          delay or replace it. */}
      {hero}

      {/* Below the fold: code-split chunks + progressively hydrated Firestore
          data stream in after the hero. fallback={null} keeps every section
          out of the way until its own chunk arrives. */}
      <Suspense fallback={null}>
        {hasBuilder ? (
          sections.map(renderSection)
        ) : (
          <>
            <CategoryShowcase sectionRef={categoriesRef} countInCategory={countInCategory} categories={visibleCategories} heading={homepageContent.categories} />
            <FeaturedSection products={featuredShown} heading={homepageContent.featured} loading={loading} />
            <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
              <div className="shell-wide">
                <HomeProductRail eyebrow={homepageContent.bestSellers.eyebrow} title={homepageContent.bestSellers.title} subtitle={homepageContent.bestSellers.subtitle} products={bestShown} loading={loading} railLabel="best sellers" />
              </div>
            </section>
            <PromoSection promotionalBanners={promotionalBanners} />
            <SecondaryBannerGrid banners={homepageConfig?.secondaryBanners || []} />
            <ProductBannerGrid banners={homepageConfig?.productBanners || []} />
            {dealsShown.length > 0 && <DealsSection deals={dealsShown} heading={homepageContent.deals} />}
            {settingsLoading ? (
              <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
                <div className="shell-wide" role="status" aria-live="polite" aria-busy="true">
                  <span className="sr-only">Loading homepage banner</span>
                  <Skeleton className="h-56 w-full sm:h-72" rounded="var(--r-xl)" />
                </div>
              </section>
            ) : homepageSettings.bannerImageUrl ? (
              <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
                <div className="shell-wide">
                  <ScrollReveal distance={20} className="overflow-hidden" style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}>
                    <img src={homepageSettings.bannerImageUrl} alt={homepageSettings.bannerImageAlt || 'Crackers Hyderabad Banner'} loading="lazy" className="max-h-[400px] w-full object-cover sm:max-h-[500px]" />
                  </ScrollReveal>
                </div>
              </section>
            ) : null}
            <TrustSection heading={homepageContent.trust} cards={trustCards} />
            <section className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
              <div className="shell-wide">
                <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
                  <NewsletterBlock email={newsletterEmail} onEmailChange={(e) => setNewsletterEmail(e.target.value)} onSubmit={handleSubscribe} copy={newsletterCopy} />
                  <TrackOrderBlock orderId={trackOrderId} onOrderIdChange={(e) => setTrackOrderId(e.target.value)} onSubmit={handleTrackOrder} />
                </div>
              </div>
            </section>
            <WholesaleSection copy={wholesaleCopy} />
          </>
        )}
      </Suspense>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default Home;
