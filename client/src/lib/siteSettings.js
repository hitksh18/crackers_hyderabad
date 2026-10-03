import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DOC = () => doc(db, 'settings', 'siteSettings');

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
  stableMessage: {
    enabled: true,
    text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers.',
  },
  updatedAt: null,
  updatedBy: null,
};

export async function readSiteSettings() {
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
      stableMessage: { ...DEFAULT_SITE_SETTINGS.stableMessage, ...(data.stableMessage || {}) },
    };
  } catch (error) {
    console.error('Error reading site settings:', error);
    return { ...DEFAULT_SITE_SETTINGS };
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

export async function updateStableMessage(msg, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, stableMessage: { ...current.stableMessage, ...msg } }, { userEmail });
}

export async function updateSocialLinks(links, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, socialLinks: { ...current.socialLinks, ...links } }, { userEmail });
}

export async function updateContact(contact, userEmail) {
  const current = await readSiteSettings();
  return saveSiteSettings({ ...current, contact: { ...current.contact, ...contact } }, { userEmail });
}
