import { Component, useState } from 'react';
import ScrollReveal from '../../ui/ScrollReveal';
import { normalizeImageUrl } from '../../../lib/normalizeImageUrl';
import StorefrontHero from '../../home/StorefrontHero';
import CategoryShowcase from '../../home/CategoryShowcase';
import FeaturedSection from '../../home/FeaturedSection';
import HomeProductRail from '../../home/HomeProductRail';
import DealsSection from '../../home/DealsSection';
import PromoSection from '../../home/PromoSection';
import SecondaryBannerGrid from '../../home/SecondaryBannerGrid';
import ProductBannerGrid from '../../home/ProductBannerGrid';
import TrustSection from '../../home/TrustSection';
import NewsletterBlock from '../../home/NewsletterBlock';
import TrackOrderBlock from '../../home/TrackOrderBlock';
import WholesaleSection from '../../home/WholesaleSection';
import Footer from '../../Footer';

/**
 * Full-page homepage renderer for the Canvas live preview.
 *
 * It renders the SAME section components in the SAME builder order as the
 * customer homepage (client/src/pages/Home.jsx), but driven by the Canvas
 * draft instead of published Firestore reads. No fetching, no persistence —
 * all data arrives via props so edits preview instantly from local state.
 *
 * Storefront parity notes (mirrors Home.jsx):
 * - `promoCards` render inside the hero; the builder slot renders nothing.
 * - The `announcement` builder slot renders nothing on the public homepage;
 *   the marquee above the navbar (TopBanner) is a separate instance. Canvas
 *   shows it via the `notice` + `isolatedPreview` slots.
 * - `bannerImage` comes from the legacy settings/homepage document, loaded
 *   read-only by Canvas (no editor owns it yet).
 */

/* Builder section type -> Canvas tab, for click-to-select in the preview. */
const TAB_FOR_TYPE = {
  hero: 'hero',
  promoCards: 'hero',
  announcement: 'messages',
  categories: 'categories',
  featured: 'featured',
  bestSellers: 'bestSellers',
  productBanners: 'promos',
  promoBanners: 'promos',
  secondaryBanners: 'promos',
  bannerImage: 'promos',
  banner: 'promos',
  festiveDeals: 'deals',
  trust: 'trust',
  newsletter: 'newsletter',
  wholesale: 'wholesale',
};

const maxOrAll = (arr, n) => (n && n > 0 ? arr.slice(0, n) : arr);

/* One broken section must never crash the whole preview. */
class SectionGuard extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    /* Swallow: the fallback below tells the admin which section broke. */
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="cv-section-fallback" role="alert">
          This section failed to preview. Your saved homepage is unaffected — fix
          the section settings, then save.
        </div>
      );
    }
    return this.props.children;
  }
}

function SectionShell({ type, label, selected, onSelect, children }) {
  const clickable = typeof onSelect === 'function';
  return (
    <div
      data-cv-section={type}
      onClick={clickable ? () => onSelect(type) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(type); } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Edit ${label} section` : undefined}
      title={clickable ? `Edit ${label}` : undefined}
      className={`cv-live-section${selected ? ' is-selected' : ''}${clickable ? ' is-clickable' : ''}`}
    >
      {selected && <span className="cv-live-tag">{label}</span>}
      {children}
    </div>
  );
}

/* Newsletter + track-order preview pair. Owns its two input states so typing
   in the preview forms re-renders only this pair, not the whole homepage. */
function PreviewNewsletterPair({ copy, notify }) {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [trackOrderId, setTrackOrderId] = useState('');
  return (
    <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
      <NewsletterBlock
        email={newsletterEmail}
        onEmailChange={(e) => setNewsletterEmail(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          notify?.('Preview only — subscribe on the live site.');
        }}
        copy={copy}
      />
      <TrackOrderBlock
        orderId={trackOrderId}
        onOrderIdChange={(e) => setTrackOrderId(e.target.value)}
        onSubmit={(e) => e.preventDefault()}
      />
    </div>
  );
}

export default function HomepagePreview({
  draft,
  orderedSections = [],
  heroBanners = [],
  promoCards = [],
  heroCopy,
  heroArtworkAnimation,
  heroProducts = [],
  showcaseLoading = false,
  texts = {},
  featuredBase = [],
  bestBase = [],
  visibleCats = [],
  countInCategory,
  enabledDeals = [],
  trustPreview = null,
  bannerSettings = null,
  fallbackBanners = [],
  fallbackCards = [],
  selectedTypes = [],
  onSelectType,
  notice = null,
  isolatedPreview = null,
  notify,
}) {
  if (!draft) return null;

  const handleSelectType = onSelectType
    ? (type) => {
      const tab = TAB_FOR_TYPE[type];
      if (tab) onSelectType(tab);
    }
    : undefined;

  const shell = (type, label, node) => (
    <SectionGuard key={type}>
      <SectionShell
        type={type}
        label={label}
        selected={selectedTypes.includes(type)}
        onSelect={handleSelectType}
      >
        {node}
      </SectionShell>
    </SectionGuard>
  );

  const renderSection = (section) => {
    switch (section.type) {
      case 'hero':
        return shell(
          'hero',
          section.label || 'Hero',
          <StorefrontHero
            banners={heroBanners.length > 0 ? heroBanners : fallbackBanners}
            cards={promoCards.length > 0 ? promoCards : fallbackCards}
            durationSec={draft.homepage?.carouselDurationSec ?? 5}
            loading={false}
            copy={heroCopy || draft.homepage?.heroCopy}
            heroProducts={heroProducts}
            showcaseLoading={showcaseLoading}
            heroArtworkAnimation={heroArtworkAnimation || draft.homepage?.heroArtworkAnimation}
          />,
        );
      case 'promoCards':
        return null;
      case 'announcement':
        return null;
      case 'categories':
        return visibleCats.length > 0
          ? shell(
            'categories',
            section.label || 'Categories',
            <CategoryShowcase
              countInCategory={countInCategory}
              categories={visibleCats}
              heading={texts.categories}
            />,
          )
          : null;
      case 'featured':
        return shell(
          'featured',
          section.label || 'Featured',
          <FeaturedSection
            products={maxOrAll(featuredBase, texts.featured?.maxItems ?? 12)}
            heading={texts.featured}
            loading={false}
          />,
        );
      case 'bestSellers':
        return shell(
          'bestSellers',
          section.label || 'Best sellers',
          <section className="section-pad home-sec-best">
            <div className="shell-wide">
              <HomeProductRail
                eyebrow={texts.bestSellers?.eyebrow}
                title={texts.bestSellers?.title}
                subtitle={texts.bestSellers?.subtitle}
                products={maxOrAll(bestBase, texts.bestSellers?.maxItems ?? 10)}
                loading={false}
                railLabel="best sellers"
              />
            </div>
          </section>,
        );
      case 'promoBanners': {
        const promos = [...(draft.promos || [])].sort((a, b) => (b.order || 0) - (a.order || 0));
        if (promos.length === 0) return null;
        return shell(
          'promoBanners',
          section.label || 'Promotional banners',
          <PromoSection promotionalBanners={promos} />,
        );
      }
      case 'secondaryBanners': {
        const banners = draft.homepage?.secondaryBanners || [];
        if (banners.length === 0) return null;
        return shell(
          'secondaryBanners',
          section.label || 'Secondary banners',
          <SecondaryBannerGrid banners={banners} />,
        );
      }
      case 'productBanners': {
        const banners = draft.homepage?.productBanners || [];
        if (banners.length === 0) return null;
        return shell(
          'productBanners',
          section.label || 'Product banners',
          <ProductBannerGrid banners={banners} />,
        );
      }
      case 'festiveDeals': {
        const shown = maxOrAll(enabledDeals, texts.deals?.maxItems);
        if (shown.length === 0) return null;
        return shell(
          'festiveDeals',
          section.label || 'Festive deals',
          <DealsSection deals={shown} heading={texts.deals} />,
        );
      }
      case 'bannerImage':
        return bannerSettings?.bannerImageUrl
          ? shell(
            'bannerImage',
            section.label || 'Banner image',
            <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
              <div className="shell-wide">
                <ScrollReveal distance={20} className="overflow-hidden" style={{ borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' }}>
                  <img
                    src={normalizeImageUrl(bannerSettings.bannerImageUrl)}
                    alt={bannerSettings.bannerImageAlt || 'Crackers Hyderabad Banner'}
                    loading="lazy"
                    className="max-h-[400px] w-full object-cover sm:max-h-[500px]"
                  />
                </ScrollReveal>
              </div>
            </section>,
          )
          : null;
      case 'trust':
        return shell(
          'trust',
          section.label || 'Trust',
          <TrustSection heading={texts.trust} cards={trustPreview?.cards} />,
        );
      case 'newsletter':
        return shell(
          'newsletter',
          section.label || 'Newsletter',
          <section className="section-pad home-sec-news">
            <div className="shell-wide">
              <PreviewNewsletterPair copy={texts.newsletter} notify={notify} />
            </div>
          </section>,
        );
      case 'wholesale':
        return shell(
          'wholesale',
          section.label || 'Wholesale',
          <WholesaleSection copy={texts.wholesale} />,
        );
      case 'banner': {
        const cfg = section.config || {};
        const banners = (cfg.banners || []).filter((b) => b.enabled !== false);
        if (banners.length === 0) return null;
        return shell(
          'banner',
          section.label || 'Banner section',
          <section className="section-pad-sm" style={{ background: 'var(--surface-card)' }}>
            <div className="shell-wide">
              <div className="grid gap-4">
                {banners.map((b) => (
                  <span
                    key={b.id}
                    className="block overflow-hidden rounded-2xl"
                    style={{ border: '1px solid var(--hairline)' }}
                  >
                    <img
                      src={b.imageDesktop || b.image}
                      alt={b.alt || ''}
                      className="w-full object-cover"
                      style={{ maxHeight: '400px' }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </section>,
        );
      }
      default:
        return null;
    }
  };

  const visible = orderedSections.filter((s) => s.enabled !== false);

  /* route-home scopes the storefront's home-only stylesheets
     (home-atmosphere section bands, mobile-home rules) to this preview so
     the draft renders exactly as the customer homepage — without leaking
     into the rest of the admin console. */
  return (
    <div className="cv-live-page route-home">
      {notice}
      {isolatedPreview}
      {visible.map(renderSection)}
      <SectionGuard>
        <SectionShell
          type="footer"
          label="Footer"
          selected={selectedTypes.includes('footer')}
          onSelect={handleSelectType}
        >
          <Footer
            preview={{
              phone: draft.footer?.phone,
              email: draft.site?.contact?.email || draft.footer?.email,
              address: draft.footer?.address,
              logoUrl: draft.site?.branding?.logoUrl,
              instagram: draft.site?.socialLinks?.instagram || '',
            }}
          />
        </SectionShell>
      </SectionGuard>
    </div>
  );
}