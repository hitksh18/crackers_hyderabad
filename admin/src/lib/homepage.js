import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Homepage configuration — the single shared source of truth for the homepage
 * and the Admin → Homepage dashboard.
 *
 * The whole homepage lives under ONE document: `settings/homepageConfig`.
 * This keeps a clean, extendable data model (banners + cards + featured ids +
 * settings) that the storefront reads and the admin edits, so both always see
 * the same state. `status: 'published' | 'draft'` lets the admin preview drafts
 * before publishing to the public homepage.
 *
 * Document shape:
 *   {
 *     heroBanners:  Array<HeroBanner>,          // large carousel
 *     promoCards:   [PromoCard, PromoCard],      // two stacked cards (index 0, 1)
 *     featuredCategories: Array<string>,          // category slugs shown on D0 grid
 *     featuredProducts:   Array<string>,          // product ids shown on D0 grid
 *     carouselDurationSec: number,
 *     status: 'published' | 'draft',
 *     updatedAt, updatedBy
 *   }
 */
const DOC = () => doc(db, 'settings', 'homepageConfig');

/* Fallback demos. The homepage NEVER renders blank — these stand in until the
   admin publishes their own content. They are demo copy, not the final system. */
export const DEFAULT_HERO_BANNERS = [
  {
    id: 'fallback-banner-1',
    imageDesktop: '/images/catalog/111.webp',
    imageMobile: '/images/catalog/111.webp',
    alt: 'Festive crackers banner',
    fit: 'cover',
    badge: 'Diwali Special',
    heading: 'Light Up Your Celebrations',
    description: '',
    ctaText: 'Shop Now',
    ctaLink: '/products?category=Gift Boxes',
    ctaSecondaryText: '',
    ctaSecondaryLink: '',
    startDate: '',
    endDate: '',
    enabled: true,
    order: 0,
  },
  {
    id: 'fallback-banner-2',
    imageDesktop: '/images/catalog/125.webp',
    imageMobile: '/images/catalog/125.webp',
    alt: 'Best selling fireworks banner',
    fit: 'cover',
    badge: 'Best Sellers',
    heading: 'The Most-Loved Fireworks',
    description: '',
    ctaText: 'Shop Best Sellers',
    ctaLink: '/products',
    ctaSecondaryText: '',
    ctaSecondaryLink: '',
    startDate: '',
    endDate: '',
    enabled: true,
    order: 1,
  },
  {
    id: 'fallback-banner-3',
    imageDesktop: '/images/catalog/145.webp',
    imageMobile: '/images/catalog/145.webp',
    alt: 'Celebration combo packs banner',
    fit: 'cover',
    badge: 'Festive Combos',
    heading: 'Celebration Packs for Every Occasion',
    description: '',
    ctaText: 'Explore Combos',
    ctaLink: '/products?category=Gift Boxes',
    ctaSecondaryText: '',
    ctaSecondaryLink: '',
    startDate: '',
    endDate: '',
    enabled: true,
    order: 2,
  },
];

export const DEFAULT_PROMO_CARDS = [
  {
    id: 'fallback-card-1',
    image: '/images/catalog/165.webp',
    imageDesktop: '/images/catalog/165.webp',
    imageMobile: '/images/catalog/165.webp',
    alt: 'Popular selections banner',
    fit: 'cover',
    label: 'Best Sellers',
    heading: 'Explore Our Most Popular',
    description: '',
    ctaText: 'Shop Now',
    ctaLink: '/products',
    enabled: true,
  },
  {
    id: 'fallback-card-2',
    image: '/images/catalog/224.webp',
    imageDesktop: '/images/catalog/224.webp',
    imageMobile: '/images/catalog/224.webp',
    alt: 'Festive combo packs banner',
    fit: 'cover',
    label: 'Festive Combos',
    heading: 'Celebration Packs',
    description: '',
    ctaText: 'Explore',
    ctaLink: '/products?category=Gift Boxes',
    enabled: true,
  },
];

export const DEFAULT_HOMEPAGE = {
  heroBanners: DEFAULT_HERO_BANNERS,
  promoCards: DEFAULT_PROMO_CARDS,
  secondaryBanners: [],
  productBanners: [],
  featuredCategories: [],
  featuredProducts: [],
  carouselDurationSec: 5,
  status: 'draft',
  updatedAt: null,
  updatedBy: null,
};

/* A banner is "active" when enabled and, when a window is set, today falls
   inside it. Banners with no dates are always active within the enabled check. */
export const isBannerActive = (banner, now = Date.now()) => {
  if (!banner || banner.enabled === false) return false;
  if (banner.startDate && now < new Date(banner.startDate).getTime()) return false;
  if (banner.endDate && now > new Date(banner.endDate).getTime() + 86400000) return false;
  return true;
};

export const defaultHeroBanner = (order) => ({
  id: `hb-${Date.now()}`,
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  badge: '',
  heading: '',
  description: '',
  ctaText: 'Shop Now',
  ctaLink: '/products',
  ctaSecondaryText: '',
  ctaSecondaryLink: '',
  startDate: '',
  endDate: '',
  enabled: true,
  order,
});

export const defaultPromoCard = (index) => ({
  id: `card-${Date.now()}-${index}`,
  image: '',
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  label: '',
  heading: '',
  description: '',
  ctaText: 'Shop Now',
  ctaLink: '/products',
  enabled: true,
});

export const newHeroBanner = (order) => defaultHeroBanner(order);

/* Secondary banner (the independent strip below the hero, 1–10). Same image
   conventions as hero banners plus an optional link. */
export const defaultSecondaryBanner = (order) => ({
  id: `sb-${Date.now()}`,
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  ctaLink: '/products',
  enabled: true,
  order,
});

/* Product banner: a 16:9 creative bound to one catalogue product. The click
   target is derived from the stored slug/id via productPath() — never a
   hand-typed URL. */
export const defaultProductBanner = (order) => ({
  id: `pb-${Date.now()}`,
  image: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  productId: '',
  productSlug: '',
  productName: '',
  enabled: true,
  order,
});

/* ---- Read ---- */

/**
 * Load the homepage config. Falls back to DEFAULT_HOMEPAGE when the document
 * does not exist yet (admin has not saved) or the read fails — the page never
 * blanks out.
 */
export async function readHomepageConfig() {
  try {
    const snap = await getDoc(DOC());
    if (!snap.exists()) return { ...DEFAULT_HOMEPAGE };
    const data = snap.data();
    return {
      ...DEFAULT_HOMEPAGE,
      ...data,
      heroBanners: Array.isArray(data.heroBanners) ? data.heroBanners : DEFAULT_HOMEPAGE.heroBanners,
      promoCards: Array.isArray(data.promoCards) ? data.promoCards : DEFAULT_HOMEPAGE.promoCards,
      secondaryBanners: Array.isArray(data.secondaryBanners) ? data.secondaryBanners : [],
      productBanners: Array.isArray(data.productBanners) ? data.productBanners : [],
    };
  } catch (error) {
    console.error('Error reading homepage config:', error);
    return { ...DEFAULT_HOMEPAGE };
  }
}

/* ---- Write ---- */

/**
 * Save the homepage config. `status` is 'draft' by default (preview) or
 * 'published' when the admin commits to the public homepage.
 */
export async function saveHomepageConfig(config, { status = 'draft', userEmail } = {}) {
  const payload = {
    ...config,
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || 'admin',
  };
  await setDoc(DOC(), payload);
  return payload;
}
