import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';

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
import Seo, { SITE_URL } from '../components/Seo';
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

const HOME_TITLE = 'Buy Firecrackers Online in Hyderabad | Crackers Hyderabad';
const HOME_DESCRIPTION =
  'Shop firecrackers online in Hyderabad at Crackers Hyderabad. Explore sparklers, flower pots, ground chakkars, rockets, fancy fireworks and more at great prices.';

/* Internal links to the real category routes (/products?category=<value>).
   Names and values mirror config/categories.js — never invented URLs. */
const SEO_CATEGORY_LINKS = [
  { label: 'Shop Sparkles', value: 'Sparkles' },
  { label: 'Shop Flower Pots', value: 'Flower Pots' },
  { label: 'Shop Ground Chakkars', value: 'Ground Chakkars' },
  { label: 'Shop Rockets', value: 'Rockets' },
  { label: 'Shop Sky Shots', value: 'Sky Shots' },
  { label: 'Shop Gift Boxes', value: 'Gift Boxes' },
];

const HOME_FAQS = [
  {
    q: 'Where can I buy firecrackers in Hyderabad?',
    a: 'You can buy firecrackers online right here at Crackers Hyderabad. Browse the catalogue, add fireworks to your cart and check out online — popular picks include sparklers, flower pots, ground chakkars, rockets and gift boxes.',
  },
  {
    q: 'Can I buy crackers online in Hyderabad?',
    a: 'Yes. Crackers Hyderabad is an online fireworks store serving Hyderabad — order through the website cart and checkout, then track your order online.',
  },
  {
    q: 'What types of firecrackers are available?',
    a: 'Sparklers, flower pots, ground chakkars, rockets, bombs, garlands, fancy fireworks, kids\u2019 novelties and gift boxes. Use the category links above to browse each range.',
  },
  {
    q: 'Do you sell Diwali crackers?',
    a: 'Yes — sparklers, flower pots, ground chakkars, rockets and gift boxes are popular choices for Diwali celebrations and festive occasions.',
  },
];

/* Structured data limited to what the page visibly contains: the page
   itself plus the category list linked from it. No ratings, prices,
   hours, address or phone — none of that is on this page. */
const buildHomeJsonLd = (seo) => {
  const sd = seo?.structuredData || {};
  const blocks = [];
  if (sd.webpage !== false) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: seo?.homepageTitle || HOME_TITLE,
      description: seo?.homepageDescription || HOME_DESCRIPTION,
      url: `${SITE_URL}/`,
      inLanguage: 'en-IN',
    });
  }
  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Firecracker categories',
    itemListElement: SEO_CATEGORY_LINKS.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label.replace(/^Shop /, ''),
      url: `${SITE_URL}/products?category=${encodeURIComponent(c.value)}`,
    })),
  });
  return blocks;
};

/* LocalBusiness only from visible/verified settings data (name, URL, logo,
   contact email shown in the footer, service area). Toggle-gated, off by
   default — never invents phone, street address or hours. */
const buildLocalBusinessJsonLd = (siteSettings) => {
  const email = siteSettings?.contact?.email || '';
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: 'Crackers Hyderabad',
    url: `${SITE_URL}/`,
    image: `${SITE_URL}/images/website/crackerhyderabadlogo.png`,
    ...(email ? { email } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Hyderabad',
      addressRegion: 'Telangana',
      addressCountry: 'IN',
    },
    areaServed: 'Hyderabad, Telangana, India',
  };
};

/* Homepage head metadata driven by Site Settings → SEO (settings document
   `settings/siteSettings.seo`), with the long-standing strings as fallback
   so the page never renders broken metadata while settings load. */
const HomeSeo = ({ siteSettings }) => {
  const seo = siteSettings?.seo || null;
  const sd = seo?.structuredData || {};
  const title = seo?.homepageTitle || HOME_TITLE;
  const description = seo?.homepageDescription || HOME_DESCRIPTION;
  const canonical = seo?.canonicalUrl || '/';
  const image = seo?.ogImage || '/images/website/crackerhyderabadlogo.png';

  /* Site-wide static JSON-LD (index.html) honours the admin toggles on this
     page only: removal restores on re-enable, and defaults leave the tags
     exactly as shipped. */
  const removedStatic = useRef(new Map());
  useEffect(() => {
    if (!siteSettings) return undefined;
    const apply = (id, on) => {
      const el = document.getElementById(id);
      if (on) {
        if (!el && removedStatic.current.has(id)) {
          const fresh = document.createElement('script');
          fresh.id = id;
          fresh.type = 'application/ld+json';
          fresh.textContent = removedStatic.current.get(id);
          document.head.appendChild(fresh);
        }
        return;
      }
      if (el) {
        if (!removedStatic.current.has(id)) removedStatic.current.set(id, el.textContent);
        el.remove();
      }
    };
    apply('ld-store', sd.organization !== false);
    apply('ld-website', sd.website !== false);
    return undefined;
  }, [siteSettings, sd.organization, sd.website]);

  const jsonLd = (() => {
    const blocks = buildHomeJsonLd(seo);
    if (sd.localBusiness) blocks.push(buildLocalBusinessJsonLd(siteSettings));
    return blocks;
  })();

  return (
    <Seo
      title={title}
      description={description}
      canonical={canonical}
      image={image}
      ogTitle={seo?.ogTitle || undefined}
      ogDescription={seo?.ogDescription || undefined}
      twitterImage={seo?.twitterImage || undefined}
      jsonLd={jsonLd}
    />
  );
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
     grids; the hero never waits for them. Products/promos/deals are shared
     via a 60s cache with /products and the cart revalidation, so Home →
     Products navigation reuses the same download. */
  useEffect(() => {
    let cancelled = false;
    const fetchCatalogue = async () => {
      try {
        const [products, promos, deals] = await Promise.all([
          cachedGetDocs(collection(db, 'products'), 'products').catch(() => []),
          cachedGetDocs(collection(db, 'promotionalBanners'), 'promotionalBanners').catch(() => []),
          cachedGetDocs(collection(db, 'festiveDeals'), 'festiveDeals').catch(() => []),
        ]);
        if (cancelled) return;
        setAllProducts(Array.isArray(products) ? products : []);
        setPromotionalBanners((Array.isArray(promos) ? promos : []).filter(d => d.enabled !== false).sort((a, b) => (b.order || 0) - (a.order || 0)));
        setFestiveDeals((Array.isArray(deals) ? deals : []).filter(d => d.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0)));
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

  const featuredProducts = useMemo(() => allProducts
    .filter(p => p.isFeatured)
    .concat(allProducts.filter(p => !p.isFeatured).sort(byAdminOrder)), [allProducts]);

  const bestSellers = useMemo(() => [...allProducts]
    .sort(
      (a, b) =>
        (b.salesCount || 0) - (a.salesCount || 0) ||
        (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
        (a.name || '').localeCompare(b.name || '')
    ), [allProducts]);

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

  const categoryCounts = useMemo(() => {
    const map = new Map();
    for (const p of allProducts) {
      const cats = Array.isArray(p.categories) ? p.categories : (p.category ? [p.category] : []);
      for (const c of cats) {
        const key = String(c).toLowerCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [allProducts]);

  const countInCategory = (matchNames) => {
    let n = 0;
    for (const m of (matchNames || [])) n += categoryCounts.get(String(m).toLowerCase()) || 0;
    return n;
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
      copy={homepageConfig?.heroCopy}
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
      <HomeSeo siteSettings={siteSettings} />
      {/* Single page H1 for assistive tech and crawlers. The hero keeps its
          visual display type (now a styled paragraph, not a heading), so the
          premium design is pixel-identical while the document has one H1. */}
      <h1 className="sr-only">{siteSettings?.seo?.homepageH1 || 'Buy Firecrackers Online in Hyderabad'}</h1>

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

      {/* Homepage SEO companion: editorial copy, real category links and a
          compact FAQ. Rendered on every homepage variant (builder or
          fallback), above the footer — visible content, never hidden. */}
      <section className="section-pad" style={{ background: 'var(--surface-card)' }} aria-labelledby="home-seo-heading">
        <div className="shell-wide">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow justify-center">Hyderabad</p>
            <h2 id="home-seo-heading" className="section-title mt-3 text-center">
              {siteSettings?.seo?.contentHeading || 'Firecrackers in Hyderabad'}
            </h2>
            {(siteSettings?.seo?.content
              ? String(siteSettings.seo.content).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
              : [
                  'Looking for quality firecrackers in Hyderabad? Crackers Hyderabad offers a wide selection of fireworks for Diwali celebrations and special occasions. Explore sparklers, flower pots, ground chakkars, rockets, fancy fireworks, crackers and gift boxes at competitive prices.',
                  'Browse our online collection to find fireworks for family celebrations, festive events and Diwali. Our product range makes it easy to compare prices and choose the right crackers for your celebration in Hyderabad.',
                ]
            ).map((para, i) => (
              <p key={i} className={i === 0 ? 'mt-4 leading-relaxed' : 'mt-3 leading-relaxed'} style={{ color: 'var(--text-body)' }}>
                {para}
              </p>
            ))}
            <p className="mt-3 leading-relaxed" style={{ color: 'var(--text-body)' }}>
              Browse our online collection to find fireworks for family celebrations, festive
              events and Diwali. Our product range makes it easy to compare prices and choose
              the right crackers for your celebration in Hyderabad.
            </p>
            <nav aria-label="Shop by category" className="mt-6 flex flex-wrap justify-center gap-2">
              {SEO_CATEGORY_LINKS.map((c) => (
                <Link
                  key={c.value}
                  to={`/products?category=${encodeURIComponent(c.value)}`}
                  className="inline-flex items-center rounded-[var(--r-pill)] border px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-page)', color: 'var(--text-body)' }}
                >
                  {c.label}
                </Link>
              ))}
            </nav>
            <h2 className="section-title mt-10 text-center">Frequently Asked Questions</h2>
            <div className="mt-4 flex flex-col gap-4">
              {HOME_FAQS.map((f) => (
                <div key={f.q}>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {f.q}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default Home;
