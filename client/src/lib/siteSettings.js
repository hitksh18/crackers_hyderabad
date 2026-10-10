import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DOC = () => doc(db, 'settings', 'siteSettings');

/* 60s in-memory reuse + inflight dedup: Navbar, Footer, TopBanner and Home
   all read the same doc on one page load — one network read, not four. */
const SITE_TTL_MS = 60_000;
let siteCache = null;
let siteAt = 0;
let siteInflight = null;

export const DEFAULT_SITE_SETTINGS = {
  branding: {
    logoUrl: '/images/website/nav-logo.png',
    faviconUrl: '/favicon.png',
  },
  contact: {
    email: 'crackershyderabad@gmail.com',
  },
  socialLinks: {
    instagram: '',
  },
  announcementBar: {
    enabled: true,
    speed: 30,
    messages: [
      'Free Shipping & COD for orders above ₹2,500 in Hyderabad',
      'Special Festive Offers!',
      'Premium Fireworks Collection',
    ],
  },
  updatedAt: null,
  updatedBy: null,
};

/* Homepage SEO defaults — mirrored from admin/src/lib/siteSettings.js (the
   apps are separate builds with no shared package; keep the two copies
   identical). The storefront only READS `seo`; all edits happen in admin. */
export const DEFAULT_SEO = {
  homepageTitle: 'Firecrackers in Hyderabad | Buy Crackers Online | Crackers Hyderabad',
  homepageDescription:
    'Shop firecrackers and Diwali crackers online in Hyderabad. Explore sparklers, flower pots, rockets, ground chakkars, gift boxes and more at Crackers Hyderabad.',
  keywords:
    'firecrackers in Hyderabad, buy firecrackers online Hyderabad, crackers Hyderabad, fireworks Hyderabad, Diwali crackers Hyderabad, firecrackers online Hyderabad, firecracker shop Hyderabad',
  canonicalUrl: 'https://crackershyderabad.com/',
  homepageH1: 'Buy Firecrackers Online in Hyderabad',
  contentHeading: 'Firecrackers in Hyderabad',
  content:
    'Looking for quality firecrackers in Hyderabad? Crackers Hyderabad offers a wide selection of fireworks for Diwali celebrations and special occasions. Explore sparklers, flower pots, ground chakkars, rockets, fancy fireworks, crackers and gift boxes at competitive prices.\n\nBrowse our online collection to find fireworks for family celebrations, festive events and Diwali. Our product range makes it easy to compare prices and choose the right crackers for your celebration in Hyderabad.',
  ogTitle: 'Firecrackers in Hyderabad | Buy Crackers Online | Crackers Hyderabad',
  ogDescription:
    'Shop firecrackers and Diwali crackers online in Hyderabad. Explore sparklers, flower pots, rockets, ground chakkars, gift boxes and more at Crackers Hyderabad.',
  ogImage: '/images/website/crackerhyderabadlogo.png',
  twitterTitle: 'Firecrackers in Hyderabad | Buy Crackers Online | Crackers Hyderabad',
  twitterDescription:
    'Shop firecrackers and Diwali crackers online in Hyderabad. Explore sparklers, flower pots, rockets, ground chakkars, gift boxes and more at Crackers Hyderabad.',
  twitterImage: '/images/website/crackerhyderabadlogo.png',
  structuredData: {
    organization: true,
    website: true,
    webpage: true,
    localBusiness: false,
  },
};

export const normalizeSeoSettings = (seo) => ({
  ...DEFAULT_SEO,
  ...(seo || {}),
  structuredData: {
    ...DEFAULT_SEO.structuredData,
    ...((seo || {}).structuredData || {}),
  },
});

export async function readSiteSettings() {
  const now = Date.now();
  if (siteCache && now - siteAt < SITE_TTL_MS) return siteCache;
  if (siteInflight) return siteInflight;
  siteInflight = (async () => {
    try {
      const snap = await getDoc(DOC());
      if (!snap.exists()) return { ...DEFAULT_SITE_SETTINGS };
      const data = snap.data();
      return {
        ...DEFAULT_SITE_SETTINGS,
        ...data,
        branding: { ...DEFAULT_SITE_SETTINGS.branding, ...(data.branding || {}) },
        contact: { ...DEFAULT_SITE_SETTINGS.contact, ...(data.contact || {}) },
        socialLinks: { ...DEFAULT_SITE_SETTINGS.socialLinks, ...(data.socialLinks || {}) },
        announcementBar: {
          ...DEFAULT_SITE_SETTINGS.announcementBar,
          ...(data.announcementBar || {}),
          messages: normalizeAnnouncementMessages(
            (data.announcementBar || {}).messages ?? DEFAULT_SITE_SETTINGS.announcementBar.messages
          ),
        },
        seo: normalizeSeoSettings(data.seo),
      };
    } catch (error) {
      console.error('Error reading site settings:', error);
      return { ...DEFAULT_SITE_SETTINGS };
    }
  })();
  try {
    const result = await siteInflight;
    siteCache = result;
    siteAt = Date.now();
    return result;
  } finally {
    siteInflight = null;
  }
}

/**
 * Announcement messages are stored as objects ({ id, text, enabled }) so the
 * canvas can toggle and reorder them. Older documents carry plain strings —
 * normalize both shapes so every reader sees objects.
 */
export function normalizeAnnouncementMessages(messages) {
  const list = Array.isArray(messages) ? messages : DEFAULT_SITE_SETTINGS.announcementBar.messages;
  return list.map((m, i) =>
    typeof m === 'string'
      ? { id: `msg-${i}`, text: m, enabled: true }
      : { id: m?.id || `msg-${i}`, text: m?.text || '', enabled: m?.enabled !== false }
  );
}

/** Enabled message texts, in order. Accepts legacy string arrays too. */
export function announcementTexts(bar) {
  return normalizeAnnouncementMessages(bar?.messages)
    .filter((m) => m.enabled !== false && String(m.text || '').trim())
    .map((m) => m.text);
}

/** First enabled message, for the single-line slots on the homepage. */
export function firstAnnouncementText(bar, fallback = '') {
  const texts = announcementTexts(bar);
  return texts.length > 0 ? texts[0] : fallback;
}

export async function saveSiteSettings(settings, { userEmail } = {}) {
  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || 'admin',
  };
  await setDoc(DOC(), payload, { merge: true });
  return payload;
}

export async function updateBranding(branding, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, branding: { ...current.branding, ...branding } }, { userEmail });
}

export async function updateAnnouncementBar(bar, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, announcementBar: { ...current.announcementBar, ...bar } }, { userEmail });
}

export async function updateSocialLinks(links, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, socialLinks: { ...current.socialLinks, ...links } }, { userEmail });
}

export async function updateContact(contact, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, contact: { ...current.contact, ...contact } }, { userEmail });
}
