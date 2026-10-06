/* The approved store categories, each mapped to its single PNG icon.
   These names are used across the site (Home, Products filters, footer,
   product pages, price list). */

const NAME_SLUGS = {
  Rockets: 'rockets',
  Sparkles: 'sparkles',
  'Ground Chakkars': 'ground-chakkars',
  'Sky Shots': 'fancy',
  'Fancy Fireworks': 'fancy-fireworks',
  'Gift Boxes': 'gift-boxes',
  'Flower Pots': 'flower-pots',
  Bombs: 'bombs',
  Garlands: 'garlands',
  'Kids Special': 'kids',
  'Guns, Rolls & Pop Pop': 'guns-rolls-pop-pop',
  'Threads and Novelties': 'threads-novelties',
  // Display-label alias for the same category (see config/categories.js).
  'Threads & Pencils': 'threads-novelties',
};

import { resolveCategory } from '../config/categories';

export const slugForCategory = (name) =>
  NAME_SLUGS[String(name || '').trim()] || 'rockets';

/* Stored strings that predate the current storefront labels. Values that
   already match are returned as-is; everything else resolves through the
   single source of truth (config/categories.js) so the display label always
   matches the storefront showcase and the admin Categories page. */
const LEGACY_DISPLAY = {
  'Threads and Novelties': 'Threads & Pencils',
};

/** Display name for a category string — normalises legacy DB names to the
    current storefront label without duplicating the category. */
export const displayNameForCategory = (name) => {
  const key = String(name || '').trim();
  if (LEGACY_DISPLAY[key]) return LEGACY_DISPLAY[key];
  return resolveCategory(key)?.name || String(name || '');
};