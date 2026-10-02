import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DOC = () => doc(db, 'settings', 'homepageBuilder');

export const SECTION_TYPES = {
  ANNOUNCEMENT: 'announcement',
  HERO: 'hero',
  PROMO_CARDS: 'promoCards',
  STABLE_MESSAGE: 'stableMessage',
  CATEGORIES: 'categories',
  FEATURED: 'featured',
  BEST_SELLERS: 'bestSellers',
  PROMO_BANNERS: 'promoBanners',
  SECONDARY: 'secondaryBanners',
  PRODUCT_BANNERS: 'productBanners',
  FESTIVE_DEALS: 'festiveDeals',
  BANNER_IMAGE: 'bannerImage',
  TRUST: 'trust',
  NEWSLETTER: 'newsletter',
  WHOLESALE: 'wholesale',
  BANNER: 'banner',
};

export const DEFAULT_SECTIONS = [
  { id: 'announcement', type: SECTION_TYPES.ANNOUNCEMENT, label: 'Announcement Bar', enabled: true, order: 0 },
  { id: 'hero', type: SECTION_TYPES.HERO, label: 'Hero / Main Banners', enabled: true, order: 1, config: { autoRotate: true, durationSec: 5 } },
  { id: 'promoCards', type: SECTION_TYPES.PROMO_CARDS, label: 'Right Promotional Banners', enabled: true, order: 2 },
  { id: 'stableMessage', type: SECTION_TYPES.STABLE_MESSAGE, label: 'Stable Message', enabled: true, order: 3 },
  { id: 'categories', type: SECTION_TYPES.CATEGORIES, label: 'Shop By Categories', enabled: true, order: 4 },
  { id: 'featured', type: SECTION_TYPES.FEATURED, label: 'Featured Products', enabled: true, order: 5 },
  { id: 'bestSellers', type: SECTION_TYPES.BEST_SELLERS, label: 'Best Sellers', enabled: true, order: 6 },
  { id: 'promoBanners', type: SECTION_TYPES.PROMO_BANNERS, label: 'Promotional Banners', enabled: true, order: 7 },
  { id: 'secondaryBanners', type: SECTION_TYPES.SECONDARY, label: 'Secondary Banners', enabled: true, order: 8 },
  { id: 'productBanners', type: SECTION_TYPES.PRODUCT_BANNERS, label: 'Product Banners', enabled: true, order: 9 },
  { id: 'festiveDeals', type: SECTION_TYPES.FESTIVE_DEALS, label: 'Festive Deals', enabled: true, order: 10 },
  { id: 'bannerImage', type: SECTION_TYPES.BANNER_IMAGE, label: 'Banner Image', enabled: true, order: 11 },
  { id: 'trust', type: SECTION_TYPES.TRUST, label: 'Why Choose Us', enabled: true, order: 12 },
  { id: 'newsletter', type: SECTION_TYPES.NEWSLETTER, label: 'Newsletter', enabled: true, order: 13 },
  { id: 'wholesale', type: SECTION_TYPES.WHOLESALE, label: 'Wholesale Section', enabled: true, order: 14 },
];

export const BANNER_SECTION_TEMPLATE = (order) => ({
  id: `banner-${Date.now()}`,
  type: SECTION_TYPES.BANNER,
  label: `Banner Section ${order + 1}`,
  enabled: true,
  order,
  config: {
    banners: [],
    autoRotate: false,
    durationSec: 4,
  },
});

export const DEFAULT_BUILDER_CONFIG = {
  sections: DEFAULT_SECTIONS,
  updatedAt: null,
  updatedBy: null,
};

export async function readBuilderConfig() {
  try {
    const snap = await getDoc(DOC());
    if (!snap.exists()) return { ...DEFAULT_BUILDER_CONFIG, sections: [...DEFAULT_SECTIONS] };
    const data = snap.data();
    const sections = Array.isArray(data.sections) && data.sections.length > 0 ? data.sections : [...DEFAULT_SECTIONS];
    // Ensure all default sections exist (for new installs)
    const existingIds = new Set(sections.map(s => s.id));
    const missing = DEFAULT_SECTIONS.filter(s => !existingIds.has(s.id));
    const merged = [...sections, ...missing].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map((s, i) => ({ ...s, order: i }));
    return { ...DEFAULT_BUILDER_CONFIG, ...data, sections: merged };
  } catch (error) {
    console.error('Error reading builder config:', error);
    return { ...DEFAULT_BUILDER_CONFIG, sections: [...DEFAULT_SECTIONS] };
  }
}

export async function saveBuilderConfig(config, { userEmail } = {}) {
  const payload = {
    ...config,
    sections: config.sections.map((s, i) => ({ ...s, order: i })),
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || 'admin',
  };
  await setDoc(DOC(), payload);
  return payload;
}

export async function saveSections(sections, userEmail) {
  const current = await readBuilderConfig();
  return saveBuilderConfig({ ...current, sections }, { userEmail });
}

export function moveSection(sections, id, direction) {
  const idx = sections.findIndex(s => s.id === id);
  if (idx === -1) return sections;
  const target = idx + direction;
  if (target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  const [moved] = next.splice(idx, 1);
  next.splice(target, 0, moved);
  return next.map((s, i) => ({ ...s, order: i }));
}

export function duplicateSection(sections, id) {
  const idx = sections.findIndex(s => s.id === id);
  if (idx === -1) return sections;
  const original = sections[idx];
  const copy = { ...original, id: `${original.id}-copy-${Date.now()}`, label: `${original.label} Copy`, order: idx + 1 };
  const next = [...sections];
  next.splice(idx + 1, 0, copy);
  return next.map((s, i) => ({ ...s, order: i }));
}
